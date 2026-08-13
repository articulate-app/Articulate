-- Search artifacts the current user can already see (task / project / AI thread /
-- personally created), by title and content preview. Used by ai_search_artifacts
-- so the model can find deliverables created in other chats before creating anew.

create or replace function public.ai_search_artifacts_v1(
  p_q text,
  p_limit integer default 8,
  p_task_id integer default null,
  p_project_id integer default null,
  p_ai_thread_id uuid default null,
  p_artifact_types text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor integer := public.current_user_id();
  v_q text := trim(coalesce(p_q, ''));
  v_q_norm text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 50));
  v_items jsonb := '[]'::jsonb;
begin
  if v_actor is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if char_length(v_q) < 2 then
    return jsonb_build_object('ok', true, 'q', v_q, 'artifacts', '[]'::jsonb, 'rows', '[]'::jsonb);
  end if;

  v_q_norm := lower(v_q);

  if p_task_id is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.ai_current_user_can_access_task_v1(p_task_id) then
    raise exception using errcode = '42501', message = 'task_artifacts_forbidden';
  end if;

  if p_project_id is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.ai_current_user_can_access_project_v1(p_project_id) then
    raise exception using errcode = '42501', message = 'project_artifacts_forbidden';
  end if;

  if p_ai_thread_id is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.ai_can_read_thread(p_ai_thread_id) then
    raise exception using errcode = '42501', message = 'thread_read_forbidden';
  end if;

  select coalesce(
    jsonb_agg(item order by (item->>'score')::numeric desc, (item->>'updated_at')::timestamptz desc nulls last),
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
      'channel_id', a.channel_id,
      'language_id', a.language_id,
      'current_version', a.current_version,
      'content_preview', left(regexp_replace(coalesce(a.content_text, ''), '[[:space:]]+', ' ', 'g'), 400),
      'primary_match_field', case
        when strpos(lower(coalesce(a.title, '')), v_q_norm) > 0 then 'title'
        when strpos(lower(coalesce(a.artifact_type, '')), v_q_norm) > 0 then 'artifact_type'
        else 'content'
      end,
      'score', (
        case
          when lower(coalesce(a.title, '')) = v_q_norm then 400
          when lower(coalesce(a.title, '')) like (v_q_norm || '%') then 280
          when strpos(lower(coalesce(a.title, '')), v_q_norm) > 0 then 220
          else 0
        end
        + case
          when strpos(lower(coalesce(a.content_text, '')), v_q_norm) > 0 then 70
          else 0
        end
        + case
          when strpos(lower(coalesce(a.artifact_type, '')), v_q_norm) > 0 then 20
          else 0
        end
        + case
          when a.updated_at > now() - interval '14 days' then 10
          else 0
        end
      ),
      'created_at', a.created_at,
      'updated_at', a.updated_at
    )) as item
    from public.artifacts a
    where lower(coalesce(a.status, '')) <> 'archived'
      and (
        strpos(lower(coalesce(a.title, '')), v_q_norm) > 0
        or strpos(lower(coalesce(a.content_text, '')), v_q_norm) > 0
        or strpos(lower(coalesce(a.artifact_type, '')), v_q_norm) > 0
      )
      and (
        coalesce(auth.role(), '') = 'service_role'
        or (
          (a.task_id is not null and public.ai_current_user_can_access_task_v1(a.task_id))
          or (
            a.project_id is not null
            and a.task_id is null
            and public.ai_current_user_can_access_project_v1(a.project_id)
          )
          or (a.ai_thread_id is not null and public.ai_can_read_thread(a.ai_thread_id))
          or (
            a.task_id is null
            and a.project_id is null
            and a.ai_thread_id is null
            and a.created_by = v_actor
          )
        )
      )
      and (p_task_id is null or a.task_id = p_task_id)
      and (
        p_project_id is null
        or a.project_id = p_project_id
        or exists (
          select 1
          from public.tasks t
          where t.id = a.task_id
            and t.project_id_int = p_project_id
            and coalesce(t.is_deleted, false) = false
        )
      )
      and (p_ai_thread_id is null or a.ai_thread_id = p_ai_thread_id)
      and (
        p_artifact_types is null
        or cardinality(p_artifact_types) = 0
        or a.artifact_type = any (p_artifact_types)
      )
    order by
      (
        case
          when lower(coalesce(a.title, '')) = v_q_norm then 400
          when lower(coalesce(a.title, '')) like (v_q_norm || '%') then 280
          when strpos(lower(coalesce(a.title, '')), v_q_norm) > 0 then 220
          else 0
        end
        + case when strpos(lower(coalesce(a.content_text, '')), v_q_norm) > 0 then 70 else 0 end
        + case when strpos(lower(coalesce(a.artifact_type, '')), v_q_norm) > 0 then 20 else 0 end
        + case when a.updated_at > now() - interval '14 days' then 10 else 0 end
      ) desc,
      a.updated_at desc nulls last
    limit v_limit
  ) q;

  return jsonb_build_object(
    'ok', true,
    'q', v_q,
    'artifacts', v_items,
    'rows', v_items
  );
end;
$function$;

revoke all on function public.ai_search_artifacts_v1(text, integer, integer, integer, uuid, text[]) from public;
grant execute on function public.ai_search_artifacts_v1(text, integer, integer, integer, uuid, text[]) to authenticated, service_role;

comment on function public.ai_search_artifacts_v1(text, integer, integer, integer, uuid, text[]) is
  'Search visible artifacts by title/content for AI tools; scoped to task/project/thread access.';
