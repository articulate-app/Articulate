-- Cheap soft-delete path for tasks.
-- Authenticated REST UPDATE/DELETE hits 8s statement_timeout under triggers + RLS.
-- This RPC:
--   1) authorizes the actor
--   2) writes is_deleted with soft-delete AFTER triggers skipped via
--      app.skip_task_soft_delete_triggers (Supabase denies session_replication_role)
--   3) enqueues heavy side effects (search / invoice / PO / occupation / emails)
--
-- NOTE: session_replication_role is patched out in
-- 20260811120257_fn_soft_delete_task_skip_guc.sql (must apply after this file).

CREATE OR REPLACE FUNCTION public.fn_process_task_deleted_job(
  p_task_id integer,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_is_deleted boolean;
  v_assigned_to_id int;
  v_delivery_date date;
  v_title text;
  v_project_id int;
  v_project_name text;
  v_actor_user_id int;
  v_bucket text;
begin
  select
    coalesce(t.is_deleted, false),
    t.assigned_to_id,
    t.delivery_date,
    t.title,
    t.project_id_int,
    t.project_name
  into
    v_is_deleted,
    v_assigned_to_id,
    v_delivery_date,
    v_title,
    v_project_id,
    v_project_name
  from public.tasks t
  where t.id = p_task_id;

  if not found then
    v_is_deleted := true;
    v_assigned_to_id := nullif(p_payload ->> 'assigned_to_id', '')::int;
    v_delivery_date := nullif(p_payload ->> 'delivery_date', '')::date;
    v_title := nullif(p_payload ->> 'title', '');
    v_project_id := nullif(p_payload ->> 'project_id', '')::int;
    v_project_name := nullif(p_payload ->> 'project_name', '');
  end if;

  if v_is_deleted then
    perform public.delete_global_search_document('task', p_task_id::text);
  else
    perform public.upsert_global_search_task(p_task_id);
  end if;

  perform public.sync_task_into_invoice_order(p_task_id);
  perform public.fn_sync_task_into_po(p_task_id);

  v_assigned_to_id := coalesce(
    v_assigned_to_id,
    nullif(p_payload ->> 'assigned_to_id', '')::int
  );
  v_delivery_date := coalesce(
    v_delivery_date,
    nullif(p_payload ->> 'delivery_date', '')::date
  );

  if v_assigned_to_id is not null and v_delivery_date is not null then
    perform public.recalculate_user_occupation(v_assigned_to_id, v_delivery_date);
  end if;

  -- Watcher emails (moved off the hot UPDATE path).
  if v_is_deleted and coalesce((p_payload ->> 'notify')::boolean, true) then
    v_actor_user_id := nullif(p_payload ->> 'actor_user_id', '')::int;
    if v_actor_user_id is null then
      select u.id into v_actor_user_id
      from public.users u
      where u.auth_user_id = auth.uid()
      limit 1;
    end if;

    v_bucket := public.time_bucket_5min(now());
    v_title := coalesce(v_title, nullif(p_payload ->> 'title', ''), 'Task');
    v_project_id := coalesce(v_project_id, nullif(p_payload ->> 'project_id', '')::int);
    v_project_name := coalesce(v_project_name, nullif(p_payload ->> 'project_name', ''));

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
      p_task_id,
      jsonb_build_object(
        'task_id', p_task_id,
        'task_title', v_title,
        'project_id', v_project_id,
        'project_name', v_project_name,
        'deleted_at', now()
      ),
      'task_deleted:' || p_task_id::text || ':' || tw.user_id::text || ':' || v_bucket,
      now()
    from public.task_watchers tw
    join public.users u on u.id = tw.user_id
    where
      tw.task_id = p_task_id
      and coalesce(tw.is_deleted, false) = false
      and coalesce(u.active, true) = true
      and coalesce(u.is_deleted, false) = false
    on conflict (dedupe_key) do nothing;
  end if;
end;
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

  -- Disable user triggers for the hot write (enqueue side effects ourselves).
  perform set_config('session_replication_role', 'replica', true);

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

  perform set_config('session_replication_role', 'origin', true);

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
    -- Always restore trigger firing if we failed mid-flight.
    perform set_config('session_replication_role', 'origin', true);
    raise;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_soft_delete_task(integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_soft_delete_task(integer, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_process_task_deleted_job(integer, jsonb) FROM PUBLIC;

-- Route denorm worker through the shared helper (includes watcher emails).
CREATE OR REPLACE FUNCTION public.process_denormalization_job(p_job_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_job public.denormalization_jobs%rowtype;
  v_project_id int;
  v_user_id int;
  v_task_id int;
  v_start_date date;
  v_effective_end date;
begin
  select *
  into v_job
  from public.denormalization_jobs
  where id = p_job_id
    and processed_at is null
  for update skip locked;

  if not found then
    return;
  end if;

  update public.denormalization_jobs
  set started_at = now(),
      attempts = attempts + 1,
      error = null
  where id = v_job.id;

  if v_job.entity_type = 'project' then
    v_project_id := v_job.entity_id::int;

    if v_job.job_type = 'project_display_changed' then
      update public.tasks t
      set
        project_name = p.name,
        project_color = p.color,
        project_logo = p.logo
      from public.projects p
      where p.id = v_project_id
        and t.project_id_int = p.id
        and t.is_deleted is not true
        and (
          t.project_name is distinct from p.name
          or t.project_color is distinct from p.color
          or t.project_logo is distinct from p.logo
        );

      perform public.update_task_search_display_from_project(v_project_id);
    end if;

    if v_job.job_type = 'project_context_cache_refresh' then
      update public.ai_threads t
      set
        interactive_context_cache = public.ai_compute_thread_interactive_context(t.id),
        interactive_context_cached_at = now()
      where t.project_id = v_project_id
         or t.task_id in (
           select tk.id
           from public.tasks tk
           where tk.project_id_int = v_project_id
         );
    end if;

    if v_job.job_type = 'project_search_dependents_refresh' then
      perform public.upsert_global_search_mention(m.id)
      from public.mentions m
      join public.threads th on th.id = m.thread_id
      where th.project_id = v_project_id;

      perform public.upsert_global_search_project_briefing(pbt.id)
      from public.project_briefing_types pbt
      where pbt.project_id = v_project_id;
    end if;
  end if;

  if v_job.entity_type = 'user' then
    v_user_id := v_job.entity_id::int;

    if v_job.job_type = 'user_display_changed' then
      update public.tasks t
      set
        assigned_to_name = u.full_name,
        assigned_to_photo = u.photo
      from public.users u
      where u.id = v_user_id
        and t.assigned_to_id = u.id
        and t.is_deleted is not true
        and (
          t.assigned_to_name is distinct from u.full_name
          or t.assigned_to_photo is distinct from u.photo
        );

      perform public.upsert_global_search_user(v_user_id);

      perform public.upsert_global_search_project(pw.project_id)
      from public.project_watchers pw
      where pw.user_id = v_user_id
        and coalesce(pw.is_deleted, false) = false;

      perform public.upsert_global_search_team(tu.team_id)
      from public.teams_users tu
      where tu.user_id = v_user_id
        and tu.team_id is not null;

      perform public.upsert_global_search_mention(m.id)
      from public.mentions m
      where m.created_by = v_user_id;

      perform public.upsert_global_search_mention(m.id)
      from public.mentions m
      join public.thread_watchers tw
        on tw.thread_id = m.thread_id
      where tw.watcher_id = v_user_id;
    end if;

    if v_job.job_type = 'user_workload_recalculate' then
      v_start_date := coalesce(
        (v_job.payload ->> 'start_date')::date,
        current_date
      );

      select greatest(
        coalesce(max(date), date '2000-01-01'),
        current_date + interval '60 days'
      )::date
      into v_effective_end
      from public.daily_user_occupation
      where user_id = v_user_id;

      perform public.recalculate_user_range_occupation(
        v_user_id,
        v_start_date,
        v_effective_end
      );
    end if;
  end if;

  if v_job.entity_type = 'task' then
    v_task_id := v_job.entity_id::int;

    if v_job.job_type = 'task_details_changed' then
      update public.ai_threads t
      set
        interactive_context_cache = public.ai_build_thread_interactive_context_cache(t.id),
        interactive_context_cached_at = now()
      where t.task_id = v_task_id;

      perform public.upsert_global_search_task(v_task_id);

      if (v_job.payload ->> 'old_assigned_to_id') is not null
         and (v_job.payload ->> 'old_delivery_date') is not null then
        perform public.recalculate_user_occupation(
          (v_job.payload ->> 'old_assigned_to_id')::int,
          (v_job.payload ->> 'old_delivery_date')::date
        );
      end if;

      if (v_job.payload ->> 'new_assigned_to_id') is not null
         and (v_job.payload ->> 'new_delivery_date') is not null then
        perform public.recalculate_user_occupation(
          (v_job.payload ->> 'new_assigned_to_id')::int,
          (v_job.payload ->> 'new_delivery_date')::date
        );
      end if;
    end if;

    if v_job.job_type = 'task_channels_changed' then
      with new_channels as (
        select
          v_task_id as task_id,
          array_agg(c.name order by c.name) as channel_names
        from public.channels c
        join public.task_channels tc on tc.channel_id = c.id
        where tc.task_id = v_task_id
      )
      update public.tasks t
      set channel_names = nc.channel_names
      from new_channels nc
      where t.id = nc.task_id
        and t.channel_names is distinct from nc.channel_names;

      update public.ai_threads t
      set
        interactive_context_cache = public.ai_build_thread_interactive_context_cache(t.id),
        interactive_context_cached_at = now()
      where t.task_id = v_task_id;
    end if;

    if v_job.job_type = 'task_deleted' then
      perform public.fn_process_task_deleted_job(v_task_id, coalesce(v_job.payload, '{}'::jsonb));
    end if;
  end if;

  update public.denormalization_jobs
  set processed_at = now(),
      error = null
  where id = v_job.id;

exception when others then
  update public.denormalization_jobs
  set error = sqlerrm,
      available_at = now() + interval '1 minute'
  where id = p_job_id;

  raise;
end;
$function$;
