-- Attach a chat/project-owned artifact to a project (clears task_id).

create or replace function public.ai_attach_artifact_to_project_v1(
  p_artifact_id uuid,
  p_project_id integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_artifact public.artifacts%rowtype;
begin
  if public.current_user_id() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);

  if coalesce(auth.role(), '') <> 'service_role' and not public.can_edit_project(p_project_id) then
    raise exception using errcode = '42501', message = 'artifact_project_forbidden';
  end if;

  if not exists (select 1 from public.projects p where p.id = p_project_id) then
    raise exception using errcode = '22023', message = 'project_not_found';
  end if;

  update public.artifacts
  set project_id = p_project_id,
      task_id = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'attached_to_project_at', now(),
        'attached_from_ai_thread_id', ai_thread_id,
        'attached_from_task_id', task_id
      ),
      updated_at = now()
  where id = p_artifact_id
  returning * into v_artifact;

  return jsonb_build_object('ok', true, 'artifact', public.ai_artifact_snapshot_v2(v_artifact.id));
end;
$function$;

revoke all on function public.ai_attach_artifact_to_project_v1(uuid, integer) from public;
grant execute on function public.ai_attach_artifact_to_project_v1(uuid, integer) to authenticated, service_role;
