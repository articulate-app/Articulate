-- Daily competitor social sync via pg_cron + pg_net.
-- Requires: extensions pg_cron, pg_net; secrets BRIGHT_DATA_API_KEY + COMPETITOR_SYNC_CRON_SECRET.
-- Hour: app_runtime_settings.competitor_sync_cron_hour_utc (default 6).
--
-- Example (ops after deploy):
--
--   select cron.unschedule('sync-competitor-social-posts-daily');
--
--   select cron.schedule(
--     'sync-competitor-social-posts-daily',
--     '0 6 * * *',
--     $$
--     select net.http_post(
--       url := 'https://hlszgarnpleikfkwujph.supabase.co/functions/v1/sync-competitor-social-posts',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || '<COMPETITOR_SYNC_CRON_SECRET>'
--       ),
--       body := jsonb_build_object('trigger', 'automatic')
--     );
--     $$
--   );
--
-- This migration does not auto-schedule against a hardcoded secret.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
