-- Soft-delete must stay a cheap UPDATE (like project name/logo).
-- Move invoice / PO / search / occupation work to denormalization_jobs.

-- 1) Enqueue on is_deleted flips
CREATE OR REPLACE FUNCTION public.trg_enqueue_task_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
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

DROP TRIGGER IF EXISTS trg_tasks_enqueue_task_deleted ON public.tasks;
CREATE TRIGGER trg_tasks_enqueue_task_deleted
AFTER UPDATE OF is_deleted ON public.tasks
FOR EACH ROW
WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
EXECUTE FUNCTION public.trg_enqueue_task_deleted();

-- 2) Drop synchronous soft-delete side-effect triggers (replaced by the job)
DROP TRIGGER IF EXISTS trg_tasks_global_search_soft_del ON public.tasks;
DROP TRIGGER IF EXISTS trg_tasks_update_occupation_soft_del ON public.tasks;

-- Keep watcher email enqueue (cheap insert into pending_notifications).

-- 3) Remove is_deleted from sync invoice / PO update triggers
DROP TRIGGER IF EXISTS trg_sync_task_invoice_on_upd ON public.tasks;
CREATE TRIGGER trg_sync_task_invoice_on_upd
AFTER UPDATE OF project_id_int, delivery_date, content_type_id, production_type_id, language_id
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_task_invoice();

DROP TRIGGER IF EXISTS trg_tasks_sync_po_upd ON public.tasks;
CREATE TRIGGER trg_tasks_sync_po_upd
AFTER UPDATE OF assigned_to_id, delivery_date, content_type_id, production_type_id, language_id
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.trg_tasks_sync_po();

-- 4) Process task_deleted jobs asynchronously
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
  v_assigned_to_id int;
  v_delivery_date date;
  v_is_deleted boolean;
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

  -- PROJECT JOBS
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

  -- USER JOBS
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

  -- TASK JOBS
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
      select
        coalesce(t.is_deleted, false),
        t.assigned_to_id,
        t.delivery_date
      into v_is_deleted, v_assigned_to_id, v_delivery_date
      from public.tasks t
      where t.id = v_task_id;

      -- Task hard-removed somehow: still clean dependents from payload.
      if not found then
        v_is_deleted := true;
        v_assigned_to_id := nullif(v_job.payload ->> 'assigned_to_id', '')::int;
        v_delivery_date := nullif(v_job.payload ->> 'delivery_date', '')::date;
      end if;

      if v_is_deleted then
        perform public.delete_global_search_document('task', v_task_id::text);
      else
        perform public.upsert_global_search_task(v_task_id);
      end if;

      -- Invoice + production-order sync already treat is_deleted as non-billable.
      perform public.sync_task_into_invoice_order(v_task_id);
      perform public.fn_sync_task_into_po(v_task_id);

      v_assigned_to_id := coalesce(
        v_assigned_to_id,
        nullif(v_job.payload ->> 'assigned_to_id', '')::int
      );
      v_delivery_date := coalesce(
        v_delivery_date,
        nullif(v_job.payload ->> 'delivery_date', '')::date
      );

      if v_assigned_to_id is not null and v_delivery_date is not null then
        perform public.recalculate_user_occupation(v_assigned_to_id, v_delivery_date);
      end if;
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
