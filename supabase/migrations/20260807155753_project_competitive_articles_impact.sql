-- Articles list with keywords (SV/KD) + GSC/GA impact for owned URLs.

create or replace function public.fn_normalize_competitive_page_url(p_url text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(trim(coalesce(p_url, '')), '^https?://', '', 'i'),
          '^www\.',
          '',
          'i'
        ),
        '/+$',
        ''
      )
    ),
    ''
  );
$$;

revoke all on function public.fn_normalize_competitive_page_url(text) from public;
grant execute on function public.fn_normalize_competitive_page_url(text) to authenticated, service_role;

create or replace function public.fn_list_project_competitive_articles_impact(
  p_project_id integer,
  p_date_from timestamp with time zone default null,
  p_date_to timestamp with time zone default null,
  p_metric_date_from date default null,
  p_metric_date_to date default null,
  p_entity_ids text[] default null,
  p_source_types text[] default null,
  p_sort text default 'recent',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id bigint,
  project_id integer,
  website_id bigint,
  content_source_id bigint,
  entity_type text,
  competitor_id bigint,
  entity_id text,
  entity_name text,
  is_owned boolean,
  url text,
  canonical_url text,
  title text,
  description text,
  language_code text,
  published_at timestamptz,
  modified_at timestamptz,
  image_url text,
  primary_keyword text,
  content_source_type text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  updated_at timestamptz,
  keywords jsonb,
  gsc_clicks numeric,
  gsc_impressions numeric,
  gsc_ctr numeric,
  gsc_position numeric,
  ga_sessions numeric,
  ga_users numeric,
  ga_pageviews numeric,
  impact_score numeric
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_metric_from date;
  v_metric_to date;
  v_sort text;
begin
  if p_project_id is null or not public.can_edit_project(p_project_id) then
    raise exception 'forbidden';
  end if;

  v_metric_to := coalesce(p_metric_date_to, (timezone('utc', now()))::date - 1);
  v_metric_from := coalesce(
    p_metric_date_from,
    case
      when p_date_from is not null then (p_date_from at time zone 'utc')::date
      else v_metric_to - 27
    end
  );
  v_sort := lower(coalesce(nullif(trim(p_sort), ''), 'recent'));

  return query
  with articles as (
    select
      v.id,
      v.project_id,
      v.website_id,
      v.content_source_id,
      v.entity_type::text as entity_type,
      v.competitor_id,
      v.entity_id::text as entity_id,
      v.entity_name::text as entity_name,
      v.is_owned,
      v.url::text as url,
      v.canonical_url::text as canonical_url,
      v.title::text as title,
      v.description::text as description,
      v.language_code::text as language_code,
      v.published_at,
      v.modified_at,
      v.image_url::text as image_url,
      v.primary_keyword::text as primary_keyword,
      v.content_source_type::text as content_source_type,
      v.first_seen_at,
      v.last_seen_at,
      v.updated_at,
      public.fn_normalize_competitive_page_url(coalesce(v.canonical_url, v.url)) as page_key
    from public.v_project_competitive_content_articles v
    where v.project_id = p_project_id
      and v.is_active = true
      and (
        p_date_from is null
        or v.published_at >= p_date_from
        or (v.published_at is null and v.first_seen_at >= p_date_from)
      )
      and (
        p_date_to is null
        or v.published_at <= p_date_to
        or (v.published_at is null and v.first_seen_at <= p_date_to)
      )
      and (
        p_entity_ids is null
        or cardinality(p_entity_ids) = 0
        or v.entity_id = any (p_entity_ids)
      )
      and (
        p_source_types is null
        or cardinality(p_source_types) = 0
        or v.content_source_type = any (p_source_types)
      )
  ),
  keywords as (
    select
      k.article_id,
      jsonb_agg(
        jsonb_build_object(
          'keyword', k.keyword,
          'keyword_type', k.keyword_type,
          'search_volume', k.search_volume,
          'competition', k.competition,
          'ranking_position', k.ranking_position,
          'clicks', k.clicks,
          'impressions', k.impressions
        )
        order by
          case k.keyword_type
            when 'inferred_primary' then 0
            when 'ranking' then 1
            when 'inferred_secondary' then 2
            else 3
          end,
          coalesce(k.search_volume, 0) desc,
          k.keyword
      ) as keywords
    from public.project_competitive_article_keywords k
    where k.project_id = p_project_id
      and k.article_id in (select a.id from articles a)
      and k.keyword_type in (
        'inferred_primary',
        'inferred_secondary',
        'ranking',
        'search_console_query'
      )
    group by k.article_id
  ),
  gsc as (
    select
      public.fn_normalize_competitive_page_url(coalesce(d.canonical_url, d.page_url)) as page_key,
      sum(coalesce(d.clicks, 0))::numeric as gsc_clicks,
      sum(coalesce(d.impressions, 0))::numeric as gsc_impressions,
      case
        when sum(coalesce(d.impressions, 0)) > 0
          then sum(coalesce(d.clicks, 0))::numeric / sum(coalesce(d.impressions, 0))::numeric
        else null
      end as gsc_ctr,
      case
        when sum(coalesce(d.impressions, 0)) > 0
          then sum(coalesce(d.position, 0) * coalesce(d.impressions, 0))
            / sum(coalesce(d.impressions, 0))
        else avg(d.position)
      end as gsc_position
    from public.project_search_console_page_daily d
    where d.project_id = p_project_id
      and d.metric_date >= v_metric_from
      and d.metric_date <= v_metric_to
    group by 1
  ),
  ga as (
    select
      public.fn_normalize_competitive_page_url(g.page_url) as page_key,
      sum(coalesce(g.sessions, 0))::numeric as ga_sessions,
      sum(coalesce(g.active_users, 0))::numeric as ga_users,
      sum(coalesce(g.screen_page_views, 0))::numeric as ga_pageviews
    from public.project_analytics_pages_daily g
    where g.project_id = p_project_id
      and g.date >= v_metric_from
      and g.date <= v_metric_to
    group by 1
  ),
  joined as (
    select
      a.*,
      coalesce(kw.keywords, '[]'::jsonb) as keywords,
      case when a.is_owned then coalesce(g.gsc_clicks, 0) else null end as gsc_clicks,
      case when a.is_owned then coalesce(g.gsc_impressions, 0) else null end as gsc_impressions,
      case when a.is_owned then g.gsc_ctr else null end as gsc_ctr,
      case when a.is_owned then g.gsc_position else null end as gsc_position,
      case when a.is_owned then coalesce(ga.ga_sessions, 0) else null end as ga_sessions,
      case when a.is_owned then coalesce(ga.ga_users, 0) else null end as ga_users,
      case when a.is_owned then coalesce(ga.ga_pageviews, 0) else null end as ga_pageviews,
      case
        when a.is_owned then
          coalesce(g.gsc_clicks, 0) * 10
          + coalesce(ga.ga_pageviews, 0)
          + coalesce(g.gsc_impressions, 0) * 0.01
        else null
      end as impact_score
    from articles a
    left join keywords kw on kw.article_id = a.id
    left join gsc g on g.page_key = a.page_key
    left join ga on ga.page_key = a.page_key
  )
  select
    j.id,
    j.project_id,
    j.website_id,
    j.content_source_id,
    j.entity_type,
    j.competitor_id,
    j.entity_id,
    j.entity_name,
    j.is_owned,
    j.url,
    j.canonical_url,
    j.title,
    j.description,
    j.language_code,
    j.published_at,
    j.modified_at,
    j.image_url,
    j.primary_keyword,
    j.content_source_type,
    j.first_seen_at,
    j.last_seen_at,
    j.updated_at,
    j.keywords,
    j.gsc_clicks,
    j.gsc_impressions,
    j.gsc_ctr,
    j.gsc_position,
    j.ga_sessions,
    j.ga_users,
    j.ga_pageviews,
    j.impact_score
  from joined j
  order by
    case when v_sort = 'impact' then j.impact_score end desc nulls last,
    case when v_sort = 'gsc_clicks' then j.gsc_clicks end desc nulls last,
    case when v_sort = 'gsc_impressions' then j.gsc_impressions end desc nulls last,
    case when v_sort = 'ga_views' then j.ga_pageviews end desc nulls last,
    case when v_sort = 'ga_sessions' then j.ga_sessions end desc nulls last,
    case when v_sort = 'updated_oldest' then coalesce(j.modified_at, j.updated_at, j.last_seen_at) end asc nulls last,
    case when v_sort = 'updated_newest' then coalesce(j.modified_at, j.updated_at, j.last_seen_at) end desc nulls last,
    case when v_sort = 'recent' then coalesce(j.published_at, j.first_seen_at) end desc nulls last,
    coalesce(j.published_at, j.first_seen_at) desc nulls last,
    j.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke all on function public.fn_list_project_competitive_articles_impact(
  integer, timestamptz, timestamptz, date, date, text[], text[], text, integer, integer
) from public;
grant execute on function public.fn_list_project_competitive_articles_impact(
  integer, timestamptz, timestamptz, date, date, text[], text[], text, integer, integer
) to authenticated, service_role;
