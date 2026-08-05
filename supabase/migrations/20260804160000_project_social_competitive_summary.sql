-- Phase 2: competitive summary RPC for owned + competitor social posts.

create or replace function public.fn_post_public_interactions(
  p_reactions integer,
  p_comments integer,
  p_shares integer
)
returns integer
language sql
immutable
as $$
  select case
    when p_reactions is null and p_comments is null and p_shares is null then null
    else coalesce(p_reactions, 0) + coalesce(p_comments, 0) + coalesce(p_shares, 0)
  end;
$$;

revoke all on function public.fn_post_public_interactions(integer, integer, integer) from public;
grant execute on function public.fn_post_public_interactions(integer, integer, integer) to authenticated;
grant execute on function public.fn_post_public_interactions(integer, integer, integer) to service_role;

create or replace function public.fn_get_project_social_competitive_summary(
  p_project_id integer,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_networks text[] default null,
  p_entity_ids text[] default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_result jsonb;
begin
  if p_project_id is null or not public.can_edit_project(p_project_id) then
    raise exception 'forbidden';
  end if;

  with filtered_posts as (
    select
      v.*,
      public.fn_post_public_interactions(
        v.reactions_count,
        v.comments_count,
        v.shares_count
      ) as interactions
    from public.v_project_social_posts v
    where v.project_id = p_project_id
      and (p_date_from is null or v.published_at >= p_date_from)
      and (p_date_to is null or v.published_at <= p_date_to)
      and (p_networks is null or cardinality(p_networks) = 0 or v.network = any (p_networks))
      and (p_entity_ids is null or cardinality(p_entity_ids) = 0 or v.entity_id = any (p_entity_ids))
  ),
  entity_base as (
    select
      e.entity_id,
      e.entity_name,
      e.entity_type,
      e.is_owned
    from public.v_project_social_entities e
    where e.project_id = p_project_id
      and (p_entity_ids is null or cardinality(p_entity_ids) = 0 or e.entity_id = any (p_entity_ids))
  ),
  entity_post_stats as (
    select
      fp.entity_id,
      count(*)::integer as posts_count,
      count(*) filter (where fp.interactions is not null)::integer as posts_with_interactions,
      sum(fp.interactions)::bigint as interactions_total,
      avg(fp.interactions) filter (where fp.interactions is not null)::numeric as interactions_avg,
      sum(fp.reactions_count)::bigint as reactions_total,
      sum(fp.comments_count)::bigint as comments_total,
      sum(fp.shares_count)::bigint as shares_total,
      sum(fp.views_count)::bigint as views_total
    from filtered_posts fp
    group by fp.entity_id
  ),
  entity_medians as (
    select
      fp.entity_id,
      percentile_cont(0.5) within group (order by fp.interactions) as interactions_median
    from filtered_posts fp
    where fp.interactions is not null
    group by fp.entity_id
  ),
  totals as (
    select
      coalesce(sum(posts_count), 0)::integer as posts_count,
      sum(interactions_total)::bigint as interactions_total
    from entity_post_stats
  ),
  network_stats as (
    select
      fp.entity_id,
      fp.network,
      count(*)::integer as posts_count,
      sum(fp.interactions)::bigint as interactions_total,
      (
        select percentile_cont(0.5) within group (order by fp2.interactions)
        from filtered_posts fp2
        where fp2.entity_id = fp.entity_id
          and fp2.network = fp.network
          and fp2.interactions is not null
      ) as interactions_median
    from filtered_posts fp
    group by fp.entity_id, fp.network
  ),
  top_posts as (
    select
      x.entity_id,
      jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'network', x.network,
          'post_url', x.post_url,
          'published_at', x.published_at,
          'text_content', left(coalesce(x.text_content, ''), 280),
          'thumbnail_url', x.thumbnail_url,
          'reactions_count', x.reactions_count,
          'comments_count', x.comments_count,
          'shares_count', x.shares_count,
          'views_count', x.views_count,
          'interactions', x.interactions
        )
        order by x.interactions desc nulls last, x.published_at desc nulls last
      ) as posts
    from (
      select
        fp.*,
        row_number() over (
          partition by fp.entity_id
          order by fp.interactions desc nulls last, fp.published_at desc nulls last
        ) as rn
      from filtered_posts fp
      where fp.interactions is not null
    ) x
    where x.rn <= 3
    group by x.entity_id
  ),
  profile_snapshots as (
    select
      s.snapshot_date,
      case
        when s.entity_type = 'owned' then ('owned:' || s.project_id::text)
        else ('competitor:' || csp.competitor_id::text)
      end as entity_id,
      (
        s.entity_type || ':' ||
        coalesce(s.brand_social_profile_id, s.competitor_social_profile_id)::text
      ) as profile_key,
      s.followers_count
    from public.project_social_profile_daily_snapshots s
    left join public.project_competitor_social_profiles csp
      on csp.id = s.competitor_social_profile_id
    where s.project_id = p_project_id
      and (s.entity_type = 'owned' or csp.competitor_id is not null)
      and (p_date_from is null or s.snapshot_date >= (p_date_from::date))
      and (p_date_to is null or s.snapshot_date <= (p_date_to::date))
      and (
        p_entity_ids is null
        or cardinality(p_entity_ids) = 0
        or case
          when s.entity_type = 'owned' then ('owned:' || s.project_id::text)
          else ('competitor:' || csp.competitor_id::text)
        end = any (p_entity_ids)
      )
  ),
  -- Each profile is snapshotted on its own schedule, so a day where only one
  -- network synced must not read as a follower collapse for the whole entity:
  -- carry each profile's last known value across the entity's snapshot dates.
  snapshot_grid as (
    select
      dates.entity_id,
      dates.snapshot_date,
      profiles.profile_key
    from (select distinct entity_id, snapshot_date from profile_snapshots) dates
    join (select distinct entity_id, profile_key from profile_snapshots) profiles
      on profiles.entity_id = dates.entity_id
  ),
  snapshot_filled as (
    select
      g.entity_id,
      g.snapshot_date,
      (
        select ps.followers_count
        from profile_snapshots ps
        where ps.profile_key = g.profile_key
          and ps.snapshot_date <= g.snapshot_date
          and ps.followers_count is not null
        order by ps.snapshot_date desc
        limit 1
      ) as followers_count
    from snapshot_grid g
  ),
  snapshot_rows as (
    select
      f.entity_id,
      f.snapshot_date,
      sum(f.followers_count)::bigint as followers_count
    from snapshot_filled f
    where f.followers_count is not null
    group by 1, 2
  ),
  follower_bounds as (
    select
      entity_id,
      min(snapshot_date) as first_date,
      max(snapshot_date) as last_date,
      count(distinct snapshot_date)::integer as snapshot_days
    from snapshot_rows
    where followers_count is not null
    group by entity_id
  ),
  follower_growth as (
    select
      b.entity_id,
      b.snapshot_days,
      first_row.followers_count as followers_start,
      last_row.followers_count as followers_latest,
      case
        when b.snapshot_days < 2 then null
        else last_row.followers_count - first_row.followers_count
      end as followers_delta,
      case
        when b.snapshot_days < 2 or first_row.followers_count is null or first_row.followers_count = 0
          then null
        else round(
          ((last_row.followers_count - first_row.followers_count)::numeric
            / first_row.followers_count::numeric) * 100,
          2
        )
      end as followers_delta_pct
    from follower_bounds b
    join snapshot_rows first_row
      on first_row.entity_id = b.entity_id
     and first_row.snapshot_date = b.first_date
    join snapshot_rows last_row
      on last_row.entity_id = b.entity_id
     and last_row.snapshot_date = b.last_date
  ),
  entity_rows as (
    select
      eb.entity_id,
      eb.entity_name,
      eb.entity_type,
      eb.is_owned,
      coalesce(eps.posts_count, 0) as posts_count,
      coalesce(eps.posts_with_interactions, 0) as posts_with_interactions,
      eps.interactions_total,
      eps.interactions_avg,
      em.interactions_median,
      eps.reactions_total,
      eps.comments_total,
      eps.shares_total,
      eps.views_total,
      case
        when t.posts_count > 0
          then round((coalesce(eps.posts_count, 0)::numeric / t.posts_count::numeric) * 100, 2)
        else null
      end as share_of_posts_pct,
      case
        when t.interactions_total is not null and t.interactions_total > 0 and eps.interactions_total is not null
          then round((eps.interactions_total::numeric / t.interactions_total::numeric) * 100, 2)
        else null
      end as share_of_interactions_pct,
      fg.followers_latest,
      fg.followers_start,
      fg.followers_delta,
      fg.followers_delta_pct,
      fg.snapshot_days as follower_snapshot_days,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'network', ns.network,
              'posts_count', ns.posts_count,
              'interactions_total', ns.interactions_total,
              'interactions_median', ns.interactions_median
            )
            order by ns.posts_count desc, ns.network
          )
          from network_stats ns
          where ns.entity_id = eb.entity_id
        ),
        '[]'::jsonb
      ) as networks,
      coalesce(tp.posts, '[]'::jsonb) as top_posts
    from entity_base eb
    cross join totals t
    left join entity_post_stats eps on eps.entity_id = eb.entity_id
    left join entity_medians em on em.entity_id = eb.entity_id
    left join follower_growth fg on fg.entity_id = eb.entity_id
    left join top_posts tp on tp.entity_id = eb.entity_id
  ),
  post_timeseries as (
    select
      (fp.published_at::date) as day,
      fp.entity_id,
      count(*)::integer as posts_count,
      sum(fp.interactions)::bigint as interactions_total
    from filtered_posts fp
    where fp.published_at is not null
    group by 1, 2
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'date_from', p_date_from,
    'date_to', p_date_to,
    'totals', jsonb_build_object(
      'posts_count', (select posts_count from totals),
      'interactions_total', (select interactions_total from totals),
      'entities_count', (select count(*)::integer from entity_base)
    ),
    'entities', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'entity_id', er.entity_id,
            'entity_name', er.entity_name,
            'entity_type', er.entity_type,
            'is_owned', er.is_owned,
            'posts_count', er.posts_count,
            'posts_with_interactions', er.posts_with_interactions,
            'interactions_total', er.interactions_total,
            'interactions_avg', er.interactions_avg,
            'interactions_median', er.interactions_median,
            'reactions_total', er.reactions_total,
            'comments_total', er.comments_total,
            'shares_total', er.shares_total,
            'views_total', er.views_total,
            'share_of_posts_pct', er.share_of_posts_pct,
            'share_of_interactions_pct', er.share_of_interactions_pct,
            'followers_latest', er.followers_latest,
            'followers_start', er.followers_start,
            'followers_delta', er.followers_delta,
            'followers_delta_pct', er.followers_delta_pct,
            'follower_snapshot_days', er.follower_snapshot_days,
            'networks', er.networks,
            'top_posts', er.top_posts
          )
          order by er.is_owned desc, er.posts_count desc, er.entity_name
        )
        from entity_rows er
      ),
      '[]'::jsonb
    ),
    'post_timeseries', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date', pt.day,
            'entity_id', pt.entity_id,
            'posts_count', pt.posts_count,
            'interactions_total', pt.interactions_total
          )
          order by pt.day, pt.entity_id
        )
        from post_timeseries pt
      ),
      '[]'::jsonb
    ),
    'follower_timeseries', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date', sr.snapshot_date,
            'entity_id', sr.entity_id,
            'followers_count', sr.followers_count
          )
          order by sr.snapshot_date, sr.entity_id
        )
        from snapshot_rows sr
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.fn_get_project_social_competitive_summary(
  integer, timestamptz, timestamptz, text[], text[]
) from public;
grant execute on function public.fn_get_project_social_competitive_summary(
  integer, timestamptz, timestamptz, text[], text[]
) to authenticated;
grant execute on function public.fn_get_project_social_competitive_summary(
  integer, timestamptz, timestamptz, text[], text[]
) to service_role;
