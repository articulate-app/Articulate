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

## Manual sync

Project Settings → **Competition**, or Competition tab → **Sync now**:

```http
POST /functions/v1/sync-competitor-social-posts
Authorization: Bearer <user JWT>
{ "project_id": 123, "trigger": "manual" }
```

Optional scopes: `competitor_id`, `social_profile_id`, `brand_social_profile_id`, `entity_type` (`owned` | `competitor` | `all`).

## Read path

- Entities: `v_project_social_entities` (`is_owned` / `entity_type` derived server-side)
- Posts: `fn_list_project_social_posts(...)` / `v_project_social_posts`
- Snapshots: `project_social_profile_daily_snapshots` (followers / posts count per profile per day)
- Competitive summary: `fn_get_project_social_competitive_summary(project_id, date_from, date_to, networks, entity_ids)`
- Interactions: `reactions + comments + shares` via `fn_post_public_interactions` (all-null → null, not 0)

## UI (Phase 2)

Competition tab → **Overview** (rule-based summaries) / **Posts** / **Compare** (table + charts).  
Project Settings → **Competition** remains the place to manage brand + competitor profiles.
