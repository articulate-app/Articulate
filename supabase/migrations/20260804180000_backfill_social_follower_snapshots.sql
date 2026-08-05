-- Backfill follower snapshots from existing posts so growth charts have history.
-- Covers both owned brand profiles and competitor profiles.
-- Safe to re-run: skips rows that already exist for profile+date.

with candidates as (
  select
    p.project_id,
    p.entity_type,
    p.brand_social_profile_id,
    p.social_profile_id,
    coalesce(p.published_at::date, p.last_seen_at::date) as snapshot_date,
    max(p.followers_count_at_sync) as followers_count,
    count(*)::int as posts_count
  from public.project_competitor_social_posts p
  where p.followers_count_at_sync is not null
    and coalesce(p.published_at, p.last_seen_at) is not null
    and (
      (p.entity_type = 'competitor' and p.social_profile_id is not null)
      or (p.entity_type = 'owned' and p.brand_social_profile_id is not null)
    )
  group by 1, 2, 3, 4, 5
)
insert into public.project_social_profile_daily_snapshots (
  project_id, entity_type, brand_social_profile_id, competitor_social_profile_id,
  snapshot_date, followers_count, posts_count, raw_payload
)
select
  c.project_id,
  c.entity_type,
  case when c.entity_type = 'owned' then c.brand_social_profile_id end,
  case when c.entity_type = 'competitor' then c.social_profile_id end,
  c.snapshot_date,
  c.followers_count,
  c.posts_count,
  jsonb_build_object('source', 'backfill_from_posts')
from candidates c
where not exists (
  select 1
  from public.project_social_profile_daily_snapshots s
  where s.snapshot_date = c.snapshot_date
    and s.entity_type = c.entity_type
    and (
      (c.entity_type = 'owned' and s.brand_social_profile_id = c.brand_social_profile_id)
      or (c.entity_type = 'competitor' and s.competitor_social_profile_id = c.social_profile_id)
    )
);
