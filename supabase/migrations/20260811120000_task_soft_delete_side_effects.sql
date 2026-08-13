-- Soft-delete side effects for tasks.
-- App deletes now use UPDATE is_deleted = true (cheap write, no CASCADE).
-- These triggers keep search, occupation, and watcher emails in sync.

-- 1) Global search: function already handles soft-delete; fire it on is_deleted flips.
DROP TRIGGER IF EXISTS trg_tasks_global_search_soft_del ON public.tasks;
CREATE TRIGGER trg_tasks_global_search_soft_del
AFTER UPDATE OF is_deleted ON public.tasks
FOR EACH ROW
WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
EXECUTE FUNCTION public.trg_upsert_global_search_task();

-- 2) Occupation: recalculate when a task is soft-deleted or restored.
CREATE OR REPLACE FUNCTION public.trg_update_occupation_from_task_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
  if coalesce(old.is_deleted, false) is distinct from coalesce(new.is_deleted, false) then
    if old.assigned_to_id is not null and old.delivery_date is not null then
      perform public.recalculate_user_occupation(old.assigned_to_id, old.delivery_date);
    end if;
    if new.assigned_to_id is not null
       and new.delivery_date is not null
       and (
         new.assigned_to_id is distinct from old.assigned_to_id
         or new.delivery_date is distinct from old.delivery_date
       )
    then
      perform public.recalculate_user_occupation(new.assigned_to_id, new.delivery_date);
    end if;
  end if;
  return null;
end;
$function$;

DROP TRIGGER IF EXISTS trg_tasks_update_occupation_soft_del ON public.tasks;
CREATE TRIGGER trg_tasks_update_occupation_soft_del
AFTER UPDATE OF is_deleted ON public.tasks
FOR EACH ROW
WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
EXECUTE FUNCTION public.trg_update_occupation_from_task_soft_delete();

-- 3) Watcher emails on soft-delete (mirror hard-delete path).
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

DROP TRIGGER IF EXISTS trg_on_task_soft_delete_enqueue_task_deleted ON public.tasks;
CREATE TRIGGER trg_on_task_soft_delete_enqueue_task_deleted
AFTER UPDATE OF is_deleted ON public.tasks
FOR EACH ROW
WHEN (
  coalesce(OLD.is_deleted, false) = false
  AND coalesce(NEW.is_deleted, false) = true
)
EXECUTE FUNCTION public.trg_on_task_soft_delete_enqueue_task_deleted();
