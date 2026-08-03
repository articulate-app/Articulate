-- Include artifacts touched by builds on this thread, not only rows whose
-- ai_thread_id still points here (task-owned artifacts often keep an older thread).

create or replace function public.ai_list_ai_thread_artifacts_v1(
  p_thread_id uuid,
  p_include_content boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_items jsonb;
begin
  if not public.ai_can_read_thread(p_thread_id) and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'thread_read_forbidden';
  end if;

  select coalesce(
    jsonb_agg(
      item
      order by coalesce((item->>'sort_order')::integer, 0) asc,
               (item->>'updated_at')::timestamptz desc nulls last
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', a.id,
      'task_id', a.task_id,
      'project_id', a.project_id,
      'ai_thread_id', a.ai_thread_id,
      'artifact_type', a.artifact_type,
      'artifact_role', a.artifact_role,
      'title', a.title,
      'status', a.status,
      'sort_order', a.sort_order,
      'channel_id', a.channel_id,
      'language_id', a.language_id,
      'current_version', a.current_version,
      'source_artifact_id', a.source_artifact_id,
      'source_version_number', a.source_version_number,
      'derivation_type', a.derivation_type,
      'metadata', coalesce(a.metadata, '{}'::jsonb),
      'content_text', case when p_include_content then a.content_text else null end,
      'content_json', case when p_include_content then a.content_json else null end,
      'asset_data', case when p_include_content then coalesce(a.asset_data, '{}'::jsonb) else null end,
      'content_preview', case
        when p_include_content then null
        else left(regexp_replace(coalesce(a.content_text, ''), '\s+', ' ', 'g'), 400)
      end,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    )) item
    from public.artifacts a
    where lower(coalesce(a.status, '')) <> 'archived'
      and (
        a.ai_thread_id = p_thread_id
        or a.id in (
          select distinct candidate.artifact_id
          from (
            select nullif(u.input_snapshot->>'artifact_id', '')::uuid as artifact_id
            from public.ai_build_work_units u
            join public.ai_build_jobs j on j.id = u.build_id
            where j.thread_id = p_thread_id
              and u.unit_type = 'artifact'
            union all
            select nullif(saved.item->>'artifact_id', '')::uuid as artifact_id
            from public.ai_build_work_units u
            join public.ai_build_jobs j on j.id = u.build_id
            cross join lateral jsonb_array_elements(
              case
                when jsonb_typeof(u.result->'saved') = 'array' then u.result->'saved'
                else '[]'::jsonb
              end
            ) as saved(item)
            where j.thread_id = p_thread_id
              and u.unit_type = 'artifact'
          ) candidate
          where candidate.artifact_id is not null
        )
      )
    order by a.sort_order asc, a.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) q;

  return jsonb_build_object(
    'ok', true,
    'thread_id', p_thread_id,
    'artifacts', v_items
  );
end;
$function$;
