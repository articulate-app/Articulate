-- AI tools must authorize by what the current user can already see/edit in the
-- workspace. Requiring an explicit ai_chat_run_targets row forced the model to
-- fail on discovered projects (e.g. "Dimas") unless the user @tagged them or
-- opened the chat from that project/task.

create or replace function public.ai_current_user_can_access_task_v1(p_task_id integer)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select auth.role() = 'service_role'
    or exists (
      select 1
      from public.tasks t
      where t.id = p_task_id
        and coalesce(t.is_deleted, false) = false
        and (
          public.ai_current_user_can_access_project_v1(t.project_id_int)
          or t.assigned_to_id = public.current_user_id()
        )
    );
$$;

revoke all on function public.ai_current_user_can_access_task_v1(integer) from public;
grant execute on function public.ai_current_user_can_access_task_v1(integer) to authenticated, service_role;

create or replace function public.ai_authorize_chat_run_target(
  p_run_id uuid,
  p_project_id integer default null,
  p_task_id integer default null,
  p_channel_id integer default null,
  p_component_id uuid default null,
  p_output_id uuid default null,
  p_user_id integer default null,
  p_attachment_id uuid default null,
  p_require_write boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_run public.ai_chat_runs%rowtype;
  v_actor integer := current_user_id();
  v_project_id integer := p_project_id;
  v_task_id integer := p_task_id;
  v_channel_id integer := p_channel_id;
  v_component_id uuid := p_component_id;
  v_output_id uuid := p_output_id;
  v_component public.task_channel_components%rowtype;
  v_output public.task_component_outputs%rowtype;
  v_target public.ai_chat_run_targets%rowtype;
  v_visibility_ok boolean := false;
begin
  select * into strict v_run from public.ai_chat_runs where id = p_run_id;
  if auth.role() <> 'service_role' and v_run.created_by is distinct from v_actor then
    raise exception using errcode = '42501', message = 'run_forbidden';
  end if;
  if v_run.status not in ('accepted', 'running') then
    raise exception using errcode = '55000', message = 'run_not_active';
  end if;

  if p_user_id is not null then
    select * into v_target
    from public.ai_chat_run_targets t
    where t.run_id = p_run_id
      and t.target_kind = 'user'
      and t.user_id = p_user_id
      and t.allow_read
      and (not p_require_write or t.allow_write)
    order by t.allow_write desc
    limit 1;
  elsif p_attachment_id is not null then
    select * into v_target
    from public.ai_chat_run_targets t
    where t.run_id = p_run_id
      and t.target_kind = 'attachment'
      and t.attachment_id = p_attachment_id
      and t.allow_read
      and not p_require_write
    limit 1;
  else
    if p_output_id is not null then
      select * into v_output
      from public.task_component_outputs o
      where o.id = p_output_id;
      if not found then
        raise exception using errcode = '22023', message = 'output_not_found';
      end if;

      v_task_id := v_output.task_id;
      v_channel_id := v_output.channel_id;
      v_output_id := v_output.id;

      if v_output.task_component_id is not null then
        if p_component_id is not null and p_component_id is distinct from v_output.task_component_id then
          raise exception using errcode = '22023', message = 'output_component_mismatch';
        end if;
        v_component_id := v_output.task_component_id;
      elsif p_component_id is not null then
        select * into v_component
        from public.task_channel_components c
        where c.id = p_component_id
          and c.task_id = v_output.task_id
          and c.channel_id = v_output.channel_id
          and c.briefing_component_id is not distinct from v_output.briefing_component_id;
        if not found then
          raise exception using errcode = '22023', message = 'output_component_mismatch';
        end if;
        v_component_id := p_component_id;
      else
        v_component_id := null;
      end if;
    end if;

    if v_component_id is not null then
      select * into v_component
      from public.task_channel_components c
      where c.id = v_component_id;
      if not found then
        raise exception using errcode = '22023', message = 'component_not_found';
      end if;
      if v_output_id is not null and (
        v_component.task_id is distinct from v_output.task_id
        or v_component.channel_id is distinct from v_output.channel_id
        or (
          v_output.task_component_id is null
          and v_component.briefing_component_id is distinct from v_output.briefing_component_id
        )
      ) then
        raise exception using errcode = '22023', message = 'output_component_mismatch';
      end if;
      v_task_id := v_component.task_id;
      v_channel_id := v_component.channel_id;
    end if;

    if v_task_id is not null then
      select t.project_id_int into v_project_id
      from public.tasks t where t.id = v_task_id;
      if not found then
        raise exception using errcode = '22023', message = 'task_not_found';
      end if;
    end if;

    if p_project_id is not null and v_project_id is distinct from p_project_id then
      raise exception using errcode = '22023', message = 'project_scope_mismatch';
    end if;
    if p_task_id is not null and v_task_id is distinct from p_task_id then
      raise exception using errcode = '22023', message = 'task_scope_mismatch';
    end if;
    if p_channel_id is not null and v_channel_id is distinct from p_channel_id then
      raise exception using errcode = '22023', message = 'channel_scope_mismatch';
    end if;
    if p_component_id is not null and v_component_id is distinct from p_component_id then
      raise exception using errcode = '22023', message = 'component_scope_mismatch';
    end if;

    select * into v_target
    from public.ai_chat_run_targets t
    where t.run_id = p_run_id
      and t.allow_read
      and (not p_require_write or t.allow_write)
      and (
        (t.target_kind = 'project' and t.project_id = v_project_id and (v_task_id is null or t.allow_descendants))
        or (t.target_kind = 'task' and t.task_id = v_task_id)
        or (t.target_kind = 'channel' and t.task_id = v_task_id and t.channel_id = v_channel_id)
        or (t.target_kind = 'component' and t.component_id = v_component_id)
        or (t.target_kind = 'output' and (
          t.output_id = v_output_id
          or (v_output_id is null and t.component_id = v_component_id)
        ))
      )
    order by
      case t.target_kind when 'output' then 1 when 'component' then 2 when 'channel' then 3 when 'task' then 4 else 5 end,
      t.allow_write desc
    limit 1;
  end if;

  if v_target.id is null then
    -- Prefer explicit run targets when present, but do not require them.
    -- Fall back to workspace visibility / edit rights so discovered projects
    -- and tasks work without @tags or ambient chat scope.
    if p_user_id is not null or p_attachment_id is not null then
      raise exception using errcode = '42501', message = case
        when p_require_write then 'target_write_not_authorized'
        else 'target_read_not_authorized'
      end;
    end if;

    if p_require_write then
      v_visibility_ok := (
        v_project_id is not null
        and public.ai_current_user_can_access_project_v1(v_project_id)
        and public.can_edit_project(v_project_id)
      );
    else
      v_visibility_ok := (
        (v_task_id is not null and public.ai_current_user_can_access_task_v1(v_task_id))
        or (
          v_task_id is null
          and v_project_id is not null
          and public.ai_current_user_can_access_project_v1(v_project_id)
        )
      );
    end if;

    if not v_visibility_ok then
      raise exception using errcode = '42501', message = case
        when p_require_write then 'target_write_not_authorized'
        else 'target_read_not_authorized'
      end;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'target_id', v_target.id,
    'target_kind', coalesce(v_target.target_kind, case
      when v_component_id is not null then 'component'
      when v_task_id is not null then 'task'
      when v_project_id is not null then 'project'
      else null
    end),
    'project_id', v_project_id,
    'task_id', v_task_id,
    'channel_id', v_channel_id,
    'component_id', v_component_id,
    'output_id', v_output_id,
    'user_id', p_user_id,
    'attachment_id', p_attachment_id,
    'allow_write', coalesce(v_target.allow_write, p_require_write),
    'authorized_via', case when v_target.id is null then 'visibility' else 'run_target' end
  );
end;
$function$;
