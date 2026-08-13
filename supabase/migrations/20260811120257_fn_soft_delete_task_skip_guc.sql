-- Supabase blocks set_config('session_replication_role', ...):
--   permission denied to set parameter "session_replication_role"
-- Use a custom GUC instead so fn_soft_delete_task can skip the AFTER soft-delete
-- triggers (RPC enqueues the same side effects itself).

CREATE OR REPLACE FUNCTION public.app_skip_task_soft_delete_triggers()
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT coalesce(nullif(current_setting('app.skip_task_soft_delete_triggers', true), ''), 'off') = 'on';
$function$;

CREATE OR REPLACE FUNCTION public.trg_enqueue_task_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if public.app_skip_task_soft_delete_triggers() then
    return new;
  end if;

  perform public.enqueue_denormalization_job(
    'task_deleted',
    'task',
    new.id::text,
    jsonb_build_object(
      'assigned_to_id', new.assigned_to_id,
      'delivery_date', new.delivery_date,
      'old_is_deleted', coalesce(old.is_deleted, false),
      'new_is_deleted', coalesce(new.is_deleted, false)
    )
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_on_task_soft_delete_enqueue_task_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_user_id integer;
  v_bucket text;
begin
  if public.app_skip_task_soft_delete_triggers() then
    return new;
  end if;

  if coalesce(new.is_deleted, false) is not true then
    return new;
  end if;
  if coalesce(old.is_deleted, false) is true then
    return new;
  end if;

  select u.id into v_actor_user_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  v_bucket := public.time_bucket_5min(now());

  insert into public.pending_notifications (
    channel, template, recipient_user_id, actor_user_id,
    entity_type, entity_id, payload, dedupe_key, scheduled_at
  )
  select
    'email',
    'task_deleted',
    tw.user_id,
    v_actor_user_id,
    'task',
    new.id,
    jsonb_build_object(
      'task_id', new.id,
      'task_title', new.title,
      'project_id', new.project_id_int,
      'project_name', new.project_name,
      'deleted_at', now()
    ),
    'task_deleted:' || new.id::text || ':' || tw.user_id::text || ':' || v_bucket,
    now()
  from public.task_watchers tw
  join public.users u on u.id = tw.user_id
  where
    tw.task_id = new.id
    and coalesce(tw.is_deleted, false) = false
    and coalesce(u.active, true) = true
    and coalesce(u.is_deleted, false) = false
  on conflict (dedupe_key) do nothing;

  return new;
end;
$function$;

-- Skip channel re-aggregation on the soft-delete hot path (unchanged by is_deleted).
CREATE OR REPLACE FUNCTION public.update_task_channels()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF public.app_skip_task_soft_delete_triggers() THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY_AGG(c.name ORDER BY c.name)
  INTO NEW.channel_names
  FROM public.channels c
  JOIN public.task_channels tc ON tc.channel_id = c.id
  WHERE tc.task_id = NEW.id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_soft_delete_task(
  p_task_id integer,
  p_promote_subtasks boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_actor_user_id integer;
  v_task record;
  v_promoted int := 0;
begin
  if p_task_id is null then
    raise exception 'task_id_required' using errcode = '22023';
  end if;

  select u.id
  into v_actor_user_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;

  if v_actor_user_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Match DELETE RLS: freelancers (role_id = 1) cannot delete tasks.
  if exists (
    select 1
    from public.teams_users tu
    where tu.user_id = v_actor_user_id
      and tu.role_id = 1
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not public.can_edit_task(p_task_id) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select
    t.id,
    t.is_deleted,
    t.assigned_to_id,
    t.delivery_date,
    t.title,
    t.project_id_int,
    t.project_name
  into v_task
  from public.tasks t
  where t.id = p_task_id
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'task_id', p_task_id, 'already_gone', true);
  end if;

  if coalesce(v_task.is_deleted, false) then
    return jsonb_build_object('ok', true, 'task_id', p_task_id, 'already_deleted', true);
  end if;

  -- Local-only custom GUC (allowed on Supabase). Soft-delete AFTER triggers no-op;
  -- we enqueue side effects below. Never use session_replication_role here.
  perform set_config('app.skip_task_soft_delete_triggers', 'on', true);

  if p_promote_subtasks then
    update public.tasks
    set
      parent_task_id_int = null,
      updated_at = now()
    where parent_task_id_int = p_task_id
      and coalesce(is_deleted, false) = false;
    get diagnostics v_promoted = row_count;
  end if;

  update public.tasks
  set
    is_deleted = true,
    is_overdue = false,
    is_publication_overdue = false,
    updated_at = now()
  where id = p_task_id;

  perform set_config('app.skip_task_soft_delete_triggers', 'off', true);

  perform public.enqueue_denormalization_job(
    'task_deleted',
    'task',
    p_task_id::text,
    jsonb_build_object(
      'assigned_to_id', v_task.assigned_to_id,
      'delivery_date', v_task.delivery_date,
      'old_is_deleted', false,
      'new_is_deleted', true,
      'title', v_task.title,
      'project_id', v_task.project_id_int,
      'project_name', v_task.project_name,
      'actor_user_id', v_actor_user_id,
      'notify', true,
      'promoted_subtasks', v_promoted
    )
  );

  return jsonb_build_object(
    'ok', true,
    'task_id', p_task_id,
    'promoted_subtasks', v_promoted
  );
exception
  when others then
    perform set_config('app.skip_task_soft_delete_triggers', 'off', true);
    raise;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_soft_delete_task(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_soft_delete_task(integer, boolean) TO authenticated;
