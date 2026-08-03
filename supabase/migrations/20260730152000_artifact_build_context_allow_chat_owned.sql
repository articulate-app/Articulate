-- Allow chat-owned / project-owned artifact work units to load context
-- without requiring task_id (ai_validate_task_scope raises task_id_required).

create or replace function public.ai_get_build_work_unit_context_v1(
  p_build_id uuid,
  p_unit_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor integer := public.current_user_id();
  v_job public.ai_build_jobs%rowtype;
  v_unit public.ai_build_work_units%rowtype;
  v_task jsonb;
  v_project jsonb;
  v_channels jsonb := '[]'::jsonb;
  v_artifact_id uuid;
  v_artifact public.artifacts%rowtype;
begin
  select j.* into v_job
  from public.ai_build_jobs j
  where j.id = p_build_id
    and (auth.role() = 'service_role' or j.created_by = v_actor)
    and j.status = 'running';
  if not found then
    raise exception using errcode = '55000', message = 'worker_lease_invalid_or_expired';
  end if;

  select u.* into v_unit
  from public.ai_build_work_units u
  where u.build_id = v_job.id
    and u.id = p_unit_id
    and u.status = 'running'
    and u.lease_token = p_lease_token
    and u.lease_expires_at >= now();
  if not found then
    raise exception using errcode = '55000', message = 'worker_lease_invalid_or_expired';
  end if;

  if v_unit.task_id is not null then
    perform public.ai_validate_task_scope(
      p_task_id => v_unit.task_id,
      p_channel_id => null,
      p_require_write => true
    );
    select to_jsonb(t) into v_task from public.tasks t where t.id = v_unit.task_id;

    select coalesce(jsonb_agg(to_jsonb(channel_row) order by channel_row.id), '[]'::jsonb)
    into v_channels
    from (
      select c.id, c.name
      from public.task_channels tc
      join public.channels c on c.id = tc.channel_id
      where tc.task_id = v_unit.task_id
        and (
          jsonb_typeof(v_unit.input_snapshot->'channel_ids') is distinct from 'array'
          or jsonb_array_length(v_unit.input_snapshot->'channel_ids') = 0
          or tc.channel_id in (
            select value::integer from jsonb_array_elements_text(v_unit.input_snapshot->'channel_ids')
          )
        )
      order by c.id
      limit 20
    ) channel_row;
  elsif v_unit.unit_type = 'artifact' then
    v_artifact_id := nullif(v_unit.input_snapshot->>'artifact_id', '')::uuid;
    if v_artifact_id is null then
      raise exception using errcode = '22023', message = 'artifact_id_missing_from_unit';
    end if;
    v_artifact := public.ai_authorize_artifact_v2(v_artifact_id, true);
    if v_unit.project_id is not null then
      if auth.role() <> 'service_role' and not public.can_edit_project(v_unit.project_id) then
        raise exception using errcode = '42501', message = 'artifact_project_write_forbidden';
      end if;
    end if;
  else
    raise exception using errcode = '22023', message = 'task_id_required';
  end if;

  if v_unit.project_id is not null then
    select to_jsonb(p) into v_project from public.projects p where p.id = v_unit.project_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'build', jsonb_build_object(
      'id', v_job.id,
      'thread_id', v_job.thread_id,
      'ai_run_id', v_job.ai_run_id,
      'request_text', v_job.request_text,
      'shared_context', v_job.plan->>'shared_context',
      'status', v_job.status
    ),
    'unit', to_jsonb(v_unit),
    'task', coalesce(v_task, '{}'::jsonb),
    'project', coalesce(v_project, '{}'::jsonb),
    'channels', coalesce(v_channels, '[]'::jsonb)
  );
end;
$function$;
