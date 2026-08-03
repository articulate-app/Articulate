-- task_keywords is shared task-level SEO guidance (keyword + secondary_keywords only).
-- meta_title / meta_description remain on the task row but are not part of task_keywords.

create or replace function public.ai_get_artifact_generation_context_v4(
  p_build_id uuid,
  p_unit_id uuid,
  p_lease_token uuid,
  p_artifact_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_artifact jsonb;
  v_task_id integer;
  v_project_id integer;
  v_thread_id uuid;
  v_explicit_ids uuid[] := '{}'::uuid[];
  v_sources jsonb := '[]'::jsonb;
  v_task_keywords jsonb := '{}'::jsonb;
begin
  v_base := public.ai_get_artifact_generation_context_v3(p_build_id, p_unit_id, p_lease_token, p_artifact_id);
  if coalesce((v_base->>'ok')::boolean, true) is false then return v_base; end if;
  v_artifact := coalesce(v_base->'artifact', '{}'::jsonb);
  v_task_id := nullif(v_artifact->>'task_id', '')::integer;
  v_project_id := nullif(v_artifact->>'project_id', '')::integer;
  v_thread_id := nullif(v_artifact->>'ai_thread_id', '')::uuid;

  -- Normalize to keyword-only shape regardless of older v3 payload contents.
  v_task_keywords := jsonb_strip_nulls(jsonb_build_object(
    'primary_keyword', nullif(trim(coalesce(
      v_base#>>'{task_keywords,primary_keyword}',
      v_base#>>'{task,keyword}',
      ''
    )), ''),
    'secondary_keywords', nullif(trim(coalesce(
      v_base#>>'{task_keywords,secondary_keywords}',
      v_base#>>'{task,secondary_keywords}',
      ''
    )), '')
  ));

  if jsonb_typeof(v_base#>'{unit,input_snapshot,artifact_spec,source_ids}') = 'array' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_explicit_ids
    from jsonb_array_elements_text(v_base#>'{unit,input_snapshot,artifact_spec,source_ids}')
    where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;

  select coalesce(jsonb_agg(row_data order by explicit_first desc, updated_at desc), '[]'::jsonb)
  into v_sources
  from (
    select
      (s.id = any(v_explicit_ids)) as explicit_first,
      s.updated_at,
      jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'source_type', s.source_type,
        'source_url', s.source_url,
        'attachment_id', s.attachment_id,
        'task_id', s.task_id,
        'project_id', s.project_id,
        'ai_thread_id', s.ai_thread_id,
        'current_version', s.current_version,
        'content_preview', left(regexp_replace(coalesce(s.content_text, ''), '\s+', ' ', 'g'), 5000),
        'metadata', s.metadata,
        'app_link', 'app://source/' || s.id::text
      ) as row_data
    from public.sources s
    where public.ai_can_access_source_scope_v1(s.id, false)
      and (
        s.id = any(v_explicit_ids)
        or (v_task_id is not null and s.task_id = v_task_id)
        or (v_project_id is not null and s.project_id = v_project_id)
        or (v_thread_id is not null and s.ai_thread_id = v_thread_id)
      )
    order by explicit_first desc, s.updated_at desc
    limit 50
  ) q;

  return v_base || jsonb_build_object(
    'task_keywords', v_task_keywords,
    'sources', v_sources
  );
end;
$$;

grant execute on function public.ai_get_artifact_generation_context_v4(uuid,uuid,uuid,uuid) to authenticated, service_role;
