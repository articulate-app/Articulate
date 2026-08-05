-- Search Console keyword/page breakdown for the project Analytics tab.

create or replace function public.fn_get_project_search_console_breakdown(
  p_project_id integer,
  p_date_from date default null,
  p_date_to date default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_connected boolean;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_properties jsonb;
  v_totals jsonb;
  v_queries jsonb;
  v_pages jsonb;
begin
  if p_project_id is null or not public.can_edit_project(p_project_id) then
    raise exception 'forbidden';
  end if;

  select exists (
    select 1
    from public.project_search_console_properties p
    where p.project_id = p_project_id and p.is_active = true
  )
  into v_connected;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'property_url', p.property_url,
        'last_synced_at', p.last_synced_at,
        'last_sync_status', p.last_sync_status,
        'last_sync_error', p.last_sync_error
      )
      order by p.created_at
    ),
    '[]'::jsonb
  )
  into v_properties
  from public.project_search_console_properties p
  where p.project_id = p_project_id;

  select jsonb_build_object(
    'clicks', coalesce(sum(d.clicks), 0),
    'impressions', coalesce(sum(d.impressions), 0),
    'ctr', case
      when coalesce(sum(d.impressions), 0) = 0 then null
      else sum(d.clicks)::numeric / nullif(sum(d.impressions), 0)
    end,
    'position_avg', avg(d.position),
    'rows', count(*)
  )
  into v_totals
  from public.project_search_console_page_query_daily d
  where d.project_id = p_project_id
    and (p_date_from is null or d.metric_date >= p_date_from)
    and (p_date_to is null or d.metric_date <= p_date_to);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'label', q.label,
        'clicks', q.clicks,
        'impressions', q.impressions,
        'ctr', q.ctr,
        'position_avg', q.position_avg
      )
      order by q.clicks desc, q.impressions desc
    ),
    '[]'::jsonb
  )
  into v_queries
  from (
    select
      d.query as label,
      sum(d.clicks)::bigint as clicks,
      sum(d.impressions)::bigint as impressions,
      case
        when coalesce(sum(d.impressions), 0) = 0 then null
        else sum(d.clicks)::numeric / nullif(sum(d.impressions), 0)
      end as ctr,
      avg(d.position) as position_avg
    from public.project_search_console_page_query_daily d
    where d.project_id = p_project_id
      and d.query is not null
      and (p_date_from is null or d.metric_date >= p_date_from)
      and (p_date_to is null or d.metric_date <= p_date_to)
    group by d.query
    order by sum(d.clicks) desc nulls last, sum(d.impressions) desc nulls last
    limit v_limit
  ) q;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'label', p.label,
        'clicks', p.clicks,
        'impressions', p.impressions,
        'ctr', p.ctr,
        'position_avg', p.position_avg
      )
      order by p.clicks desc, p.impressions desc
    ),
    '[]'::jsonb
  )
  into v_pages
  from (
    select
      coalesce(d.canonical_url, d.page_url) as label,
      sum(d.clicks)::bigint as clicks,
      sum(d.impressions)::bigint as impressions,
      case
        when coalesce(sum(d.impressions), 0) = 0 then null
        else sum(d.clicks)::numeric / nullif(sum(d.impressions), 0)
      end as ctr,
      avg(d.position) as position_avg
    from public.project_search_console_page_query_daily d
    where d.project_id = p_project_id
      and coalesce(d.canonical_url, d.page_url) is not null
      and (p_date_from is null or d.metric_date >= p_date_from)
      and (p_date_to is null or d.metric_date <= p_date_to)
    group by coalesce(d.canonical_url, d.page_url)
    order by sum(d.clicks) desc nulls last, sum(d.impressions) desc nulls last
    limit v_limit
  ) p;

  return jsonb_build_object(
    'project_id', p_project_id,
    'date_from', p_date_from,
    'date_to', p_date_to,
    'connected', coalesce(v_connected, false),
    'properties', coalesce(v_properties, '[]'::jsonb),
    'totals', v_totals,
    'queries', v_queries,
    'pages', v_pages
  );
end;
$$;

revoke all on function public.fn_get_project_search_console_breakdown(integer, date, date, integer) from public;
grant execute on function public.fn_get_project_search_console_breakdown(integer, date, date, integer) to authenticated;
grant execute on function public.fn_get_project_search_console_breakdown(integer, date, date, integer) to service_role;

create index if not exists idx_gsc_page_query_daily_project_date
  on public.project_search_console_page_query_daily (project_id, metric_date desc);
