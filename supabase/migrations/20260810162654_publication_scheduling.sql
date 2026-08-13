-- One-time scheduled publishing for agentic publication runs.
-- Extends publication_runs; does not redesign the lifecycle.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.publication_runs
  add column if not exists publish_mode text not null default 'now';

alter table public.publication_runs
  add column if not exists scheduled_at timestamptz null;

alter table public.publication_runs
  add column if not exists schedule_timezone text null;

alter table public.publication_runs
  add column if not exists schedule_strategy text null;

alter table public.publication_runs
  add column if not exists scheduled_external_at timestamptz null;

alter table public.publication_runs
  add column if not exists execution_started_at timestamptz null;

alter table public.publication_runs
  drop constraint if exists publication_runs_publish_mode_check;

alter table public.publication_runs
  add constraint publication_runs_publish_mode_check
  check (publish_mode in ('now', 'scheduled'));

alter table public.publication_runs
  drop constraint if exists publication_runs_schedule_strategy_check;

alter table public.publication_runs
  add constraint publication_runs_schedule_strategy_check
  check (
    schedule_strategy is null
    or schedule_strategy in ('external', 'internal')
  );

alter table public.publication_runs
  drop constraint if exists publication_runs_status_check;

alter table public.publication_runs
  add constraint publication_runs_status_check
  check (
    status in (
      'scheduled',
      'queued',
      'starting',
      'running',
      'needs_user',
      'awaiting_publish_confirmation',
      'publishing',
      'verifying',
      'published',
      'failed',
      'cancelled',
      'uncertain'
    )
  );

create index if not exists idx_publication_runs_scheduled_due
  on public.publication_runs (scheduled_at)
  where status = 'scheduled' and schedule_strategy = 'internal';

comment on column public.publication_runs.publish_mode is
  'now = immediate publication; scheduled = one-time future publication';
comment on column public.publication_runs.scheduled_at is
  'UTC instant when the publication should execute (internal) or was requested (external)';
comment on column public.publication_runs.schedule_timezone is
  'IANA timezone used to interpret the user-facing schedule (e.g. Europe/Lisbon)';
comment on column public.publication_runs.schedule_strategy is
  'external = native CMS schedule; internal = Articulate cron starts Browser Use at scheduled_at';
comment on column public.publication_runs.execution_started_at is
  'When an internal scheduled run was claimed for execution';

-- ---------------------------------------------------------------------------
-- Atomic claim for internal scheduled execution (single-winner)
-- ---------------------------------------------------------------------------
create or replace function public.claim_scheduled_publication_run(
  p_run_id uuid,
  p_stale_hours integer default 24
)
returns public.publication_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.publication_runs;
  v_stale_hours integer := greatest(coalesce(p_stale_hours, 24), 1);
begin
  -- Extremely stale: do not auto-publish; mark needs_user instead.
  update public.publication_runs
  set
    status = 'needs_user',
    error_code = 'invalid_request',
    error_message = 'This scheduled publication is stale and needs review before publishing.',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'stale_schedule', true,
      'stale_threshold_hours', v_stale_hours,
      'phase_message', 'This scheduled publication is stale and needs review before publishing.'
    ),
    updated_at = now()
  where id = p_run_id
    and status = 'scheduled'
    and schedule_strategy = 'internal'
    and scheduled_at is not null
    and scheduled_at <= (now() - make_interval(hours => v_stale_hours))
  returning * into v_row;

  if v_row.id is not null then
    return v_row;
  end if;

  update public.publication_runs
  set
    status = 'queued',
    execution_started_at = now(),
    error_code = null,
    error_message = null,
    updated_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'claimed_for_execution_at', now(),
      'phase_message', null,
      'stale_schedule', false
    )
  where id = p_run_id
    and status = 'scheduled'
    and schedule_strategy = 'internal'
    and scheduled_at is not null
    and scheduled_at <= now()
    and scheduled_at > (now() - make_interval(hours => v_stale_hours))
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.claim_scheduled_publication_run(uuid, integer) from public;
grant execute on function public.claim_scheduled_publication_run(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Cron: dispatch due internal schedules every minute
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $do$
declare
  v_project_url text;
  v_service_key text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url';

  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_project_url is null or v_service_key is null then
    raise notice 'Skipping scheduled-publishing cron: vault secrets project_url/service_role_key are missing';
    return;
  end if;

  if exists (
    select 1 from cron.job where jobname = 'dispatch-scheduled-publications'
  ) then
    perform cron.unschedule('dispatch-scheduled-publications');
  end if;

  perform cron.schedule(
    'dispatch-scheduled-publications',
    '* * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
             || '/functions/v1/agentic-publishing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := jsonb_build_object(
        'action', 'dispatch_scheduled_publications',
        'source', 'pg_cron'
      )
    );
    $job$
  );
end
$do$;
