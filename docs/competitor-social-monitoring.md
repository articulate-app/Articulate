# Competitor + brand social monitoring (Bright Data)

Owned brand = the project itself (`projects.id` / `projects.name`). Brand profiles live in `project_brand_social_profiles`. Competitor profiles stay in `project_competitor_social_profiles`. Posts share `project_competitor_social_posts` with `entity_type` (`owned` | `competitor`).

## Secrets

```bash
supabase secrets set BRIGHT_DATA_API_KEY="YOUR_BRIGHT_DATA_API_KEY"
supabase secrets set COMPETITOR_SYNC_CRON_SECRET="GENERATE_A_LONG_RANDOM_SECRET"
```

Deploy the edge function:

```bash
supabase functions deploy sync-competitor-social-posts
```

## Daily cron (Supabase)

1. Ensure `pg_cron` and `pg_net` are enabled.
2. Configure lookback / max posts / hour:

```sql
update public.app_runtime_settings
set value = jsonb_build_object(
  'cron_hour_utc', 6,
  'first_sync_days', 30,
  'max_posts_per_profile', 50
),
updated_at = now()
where key = 'competitor_social_sync';
```

3. Schedule (replace secret):

```sql
select cron.schedule(
  'sync-competitor-social-posts-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://hlszgarnpleikfkwujph.supabase.co/functions/v1/sync-competitor-social-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || '<COMPETITOR_SYNC_CRON_SECRET>'
    ),
    body := jsonb_build_object('trigger', 'automatic')
  );
  $$
);
```

Automatic sync loads **active brand + competitor** profiles.

## Snapshot lifecycle (why syncs are resumable)

Bright Data snapshots for LinkedIn, Instagram, Facebook and YouTube regularly need
more than the ~150s an Edge Function can stay alive. A snapshot is therefore triggered
once and its id is stored on the sync run (`metadata.snapshot_id`); the run stays
`queued` until an invocation collects it. The same scrape is never paid for twice.

Modes (`mode` in the request body):

| Mode | Behaviour |
| --- | --- |
| `trigger` | Start snapshots and return immediately. Used right after profile discovery. |
| `resume` | Collect snapshots that are already pending. Runs every 2 minutes via `resume-pending-social-snapshots`. |
| `sync` (default) | Resume a pending snapshot if there is one, otherwise trigger and wait as long as the request budget allows. Leaves the run pending instead of failing. |

A pending run is abandoned only after 60 minutes; runs with no snapshot id (killed
worker) are still released after 4 minutes.

The resume cron ships in `20260805130000_resume_pending_social_snapshots_cron.sql`
and needs the `project_url` / `service_role_key` vault secrets.

## Manual sync

Project Settings → **Competition**, or Competition tab → **Sync now**:

```http
POST /functions/v1/sync-competitor-social-posts
Authorization: Bearer <user JWT>
{ "project_id": 123, "trigger": "manual" }
```

Optional scopes: `competitor_id`, `social_profile_id(s)`, `brand_social_profile_id(s)`,
`entity_type` (`owned` | `competitor` | `all`), `mode`.

## Discovery starts the sync

"Find social profiles" (own brand and competitors) links the profiles and immediately
calls the function with `mode: "trigger"` for the profiles it just created, so nobody
has to sync network by network from Settings. The response reports
`profiles_pending`, and posts land as soon as the resume cron collects the snapshots.

## Read path

- Entities: `v_project_social_entities` (`is_owned` / `entity_type` derived server-side)
- Posts: `fn_list_project_social_posts(...)` / `v_project_social_posts`
- Snapshots: `project_social_profile_daily_snapshots` (followers / posts count per profile per day)
- Competitive summary: `fn_get_project_social_competitive_summary(project_id, date_from, date_to, networks, entity_ids)`
- Interactions: `reactions + comments + shares` via `fn_post_public_interactions` (all-null → null, not 0)

## UI (Phase 2)

Competition tab → **Overview** (rule-based summaries) / **Posts** / **Compare** (table + charts).  
Project Settings → **Competition** remains the place to manage brand + competitor profiles.
