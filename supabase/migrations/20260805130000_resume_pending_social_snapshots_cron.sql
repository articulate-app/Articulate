-- Bright Data snapshots often need more time than a single Edge Function invocation.
-- Snapshots are now triggered once and collected later, so a short-interval cron has
-- to sweep the pending sync runs and persist the posts as soon as they are ready.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create index if not exists idx_project_competitor_sync_runs_pending
  on public.project_competitor_sync_runs (started_at)
  where status in ('queued', 'running');

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
    raise notice 'Skipping resume cron: vault secrets project_url/service_role_key are missing';
    return;
  end if;

  if exists (
    select 1 from cron.job where jobname = 'resume-pending-social-snapshots'
  ) then
    perform cron.unschedule('resume-pending-social-snapshots');
  end if;

  perform cron.schedule(
    'resume-pending-social-snapshots',
    '*/2 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
             || '/functions/v1/sync-competitor-social-posts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := jsonb_build_object(
        'trigger', 'automatic',
        'mode', 'resume',
        'source', 'pg_cron'
      )
    );
    $job$
  );
end
$do$;
