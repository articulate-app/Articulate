-- Optimistic, thread-aware AI chat restore.
--
-- 1. Persist the restore point on the thread so reloads show the restored timeline.
-- 2. Have ai_restore_thread_to_message create a "restore confirmation" assistant
--    message and return enough data (restored_items + created_chat_message) for the
--    frontend to update component output state and truncate the chat optimistically.
-- 3. Have v_ai_messages_enriched respect the restore point: hide the superseded
--    messages created between the restore target and the confirmation, while keeping
--    the target, the confirmation, and any genuinely new messages sent afterwards.

-- ---------------------------------------------------------------------------
-- 1. Restore-point columns on ai_threads
-- ---------------------------------------------------------------------------
alter table public.ai_threads
  add column if not exists restored_to_message_id uuid,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by integer,
  add column if not exists restore_message_id uuid;

-- ---------------------------------------------------------------------------
-- 2. Enriched messages view respects the restore point
-- ---------------------------------------------------------------------------
create or replace view public.v_ai_messages_enriched as
select
  m.id,
  m.thread_id,
  m.role,
  m.content,
  m.content_json,
  m.created_by,
  m.created_at,
  m.usage_prompt_tokens,
  m.usage_completion_tokens,
  m.usage_total_tokens,
  m.latency_ms,
  m.model_provider,
  m.model_name,
  m.input_cost,
  m.output_cost,
  m.total_cost,
  m.error,
  m.search_vector,
  u.full_name as author_name,
  u.photo as author_photo,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'file_name', a.file_name,
        'file_path', a.file_path,
        'mime_type', a.mime_type,
        'size', a.size
      )
    ) filter (where a.id is not null),
    '[]'::jsonb
  ) as attachments
from v_ai_messages_visible m
  join ai_threads th on th.id = m.thread_id
  left join ai_messages target on target.id = th.restored_to_message_id
  left join ai_messages rmsg on rmsg.id = th.restore_message_id
  left join users u on u.id = m.created_by
  left join attachments a on a.table_name = 'ai_messages' and a.record_id = (m.id)::text
where
  -- Thread has no active restore point: show everything (default behaviour).
  th.restored_to_message_id is null
  -- Defensive fallback if the restore target row is missing.
  or target.created_at is null
  -- Original history up to and including the restore target.
  or m.created_at <= target.created_at
  -- The restore confirmation message itself.
  or m.id = th.restore_message_id
  -- Genuinely new messages sent after the restore happened.
  or (rmsg.created_at is not null and m.created_at > rmsg.created_at)
group by
  m.id, m.thread_id, m.role, m.content, m.content_json, m.created_by, m.created_at,
  m.usage_prompt_tokens, m.usage_completion_tokens, m.usage_total_tokens, m.latency_ms,
  m.model_provider, m.model_name, m.input_cost, m.output_cost, m.total_cost, m.error,
  m.search_vector, u.full_name, u.photo;

-- ---------------------------------------------------------------------------
-- 3. Restore RPC: revert + confirmation message + rich response payload
-- ---------------------------------------------------------------------------
create or replace function public.ai_restore_thread_to_message(
  p_thread_id uuid,
  p_target_message_id uuid,
  p_restored_by integer default null::integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target_created_at timestamptz;
  v_restore_change_set public.ai_message_change_sets;
  v_restore_id uuid;
  v_cs record;
  v_item record;
  v_before jsonb;
  v_after jsonb;
  v_restored_items int := 0;
  v_reverted_change_sets int := 0;
  v_restored_items_json jsonb := '[]'::jsonb;
  v_restore_message_id uuid;
  v_restore_message_created_at timestamptz;
  v_confirmation_content_json jsonb;
begin
  select created_at
  into v_target_created_at
  from public.ai_messages
  where id = p_target_message_id
    and thread_id = p_thread_id;

  if v_target_created_at is null then
    raise exception 'Target message not found in thread';
  end if;

  insert into public.ai_message_change_sets (
    thread_id,
    assistant_message_id,
    created_by,
    status,
    summary
  )
  values (
    p_thread_id,
    null,
    p_restored_by,
    'pending',
    jsonb_build_object(
      'type', 'restore_to_message',
      'target_message_id', p_target_message_id,
      'target_created_at', v_target_created_at
    )
  )
  returning * into v_restore_change_set;

  insert into public.ai_message_change_set_restores (
    change_set_id,
    restored_by,
    status,
    created_change_set_id
  )
  values (
    null,
    p_restored_by,
    'pending',
    v_restore_change_set.id
  )
  returning id into v_restore_id;

  for v_cs in
    select *
    from public.ai_message_change_sets
    where thread_id = p_thread_id
      and created_at > v_target_created_at
      and id <> v_restore_change_set.id
      and status in ('completed', 'restored')
    order by created_at desc
  loop
    v_reverted_change_sets := v_reverted_change_sets + 1;

    for v_item in
      select *
      from public.ai_message_change_set_items
      where change_set_id = v_cs.id
      order by updated_at desc, created_at desc
    loop
      if v_item.entity_type = 'task_component_output' then
        select to_jsonb(tco.*)
        into v_before
        from public.task_component_outputs tco
        where tco.id = v_item.task_component_output_id;

        update public.task_component_outputs tco
        set
          content_text = coalesce(
            v_item.before_snapshot ->> 'content_text',
            v_item.before_content_text
          ),
          content_json = coalesce(
            v_item.before_snapshot -> 'content_json',
            v_item.before_content_json
          ),
          output_kind = coalesce(
            nullif(v_item.before_snapshot ->> 'output_kind', ''),
            tco.output_kind
          ),
          is_autogenerated = coalesce(
            (v_item.before_snapshot ->> 'is_autogenerated')::boolean,
            tco.is_autogenerated
          ),
          updated_at = now()
        where tco.id = v_item.task_component_output_id;

        select to_jsonb(tco.*)
        into v_after
        from public.task_component_outputs tco
        where tco.id = v_item.task_component_output_id;

        perform public.ai_record_change_set_item(
          v_restore_change_set.id,
          'task_component_output',
          v_item.entity_id,
          v_item.task_id,
          v_item.project_id,
          v_item.channel_id,
          v_item.task_component_output_id,
          v_item.task_component_id,
          v_item.briefing_component_id,
          v_item.component_title,
          'restore_to_message',
          v_before,
          v_after,
          v_before ->> 'content_text',
          v_after ->> 'content_text',
          v_before -> 'content_json',
          v_after -> 'content_json'
        );

        v_restored_items := v_restored_items + 1;
      end if;
    end loop;
  end loop;

  -- Build the list of restored component outputs (deduped per output) using the
  -- final reverted state so the frontend can patch its caches immediately.
  select coalesce(jsonb_agg(item order by (item ->> 'component_title')), '[]'::jsonb)
  into v_restored_items_json
  from (
    select distinct on (i.task_component_output_id)
      jsonb_build_object(
        'task_id', i.task_id,
        'channel_id', i.channel_id,
        'component_id', i.task_component_id,
        'task_component_id', i.task_component_id,
        'briefing_component_id', i.briefing_component_id,
        'task_component_output_id', i.task_component_output_id,
        'component_title', i.component_title,
        'restored_content_text', tco.content_text,
        'restored_content_json', tco.content_json,
        'content_format', case when tco.content_json is not null then 'json' else 'text' end
      ) as item
    from public.ai_message_change_set_items i
    join public.task_component_outputs tco on tco.id = i.task_component_output_id
    where i.change_set_id = v_restore_change_set.id
      and i.task_component_output_id is not null
    order by i.task_component_output_id, i.created_at desc
  ) sub;

  update public.ai_message_change_set_restores
  set
    status = 'completed',
    restored_item_count = v_restored_items,
    created_change_set_id = v_restore_change_set.id
  where id = v_restore_id;

  update public.ai_message_change_sets
  set
    status = 'completed',
    entity_count = v_restored_items,
    change_count = v_restored_items
  where id = v_restore_change_set.id;

  -- Create the restore confirmation assistant message.
  v_confirmation_content_json := jsonb_build_object(
    'type', 'restore_confirmation',
    'restored_to_message_id', p_target_message_id,
    'change_set_id', v_restore_change_set.id,
    'restored_items', v_restored_items_json
  );

  insert into public.ai_messages (
    thread_id,
    role,
    content,
    content_json,
    created_by
  )
  values (
    p_thread_id,
    'assistant',
    'Restored the conversation to this point.',
    v_confirmation_content_json,
    p_restored_by
  )
  returning id, created_at
  into v_restore_message_id, v_restore_message_created_at;

  -- Persist the restore point so reloads render the restored timeline.
  update public.ai_threads
  set
    restored_to_message_id = p_target_message_id,
    restored_at = now(),
    restored_by = p_restored_by,
    restore_message_id = v_restore_message_id,
    updated_at = now()
  where id = p_thread_id;

  return jsonb_build_object(
    'ok', true,
    'mode', 'restore_to_message',
    'thread_id', p_thread_id,
    'restored_to_message_id', p_target_message_id,
    'restore_message_id', v_restore_message_id,
    'restore_id', v_restore_id,
    'change_set_id', v_restore_change_set.id,
    'restore_change_set_id', v_restore_change_set.id,
    'reverted_change_sets_count', v_reverted_change_sets,
    'restored_item_count', v_restored_items,
    'restored_items', v_restored_items_json,
    'created_chat_message', jsonb_build_object(
      'id', v_restore_message_id,
      'thread_id', p_thread_id,
      'role', 'assistant',
      'content', 'Restored the conversation to this point.',
      'content_json', v_confirmation_content_json,
      'created_at', v_restore_message_created_at,
      'created_by', p_restored_by
    )
  );
end;
$function$;
