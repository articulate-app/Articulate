-- Compare channel trends to previous equal-length period or same dates last year.
-- Already applied remotely; kept here so local/CI migrations stay in sync.
-- Drop any 4-arg overload first so PostgREST is not ambiguous with the defaulted 5th arg.

drop function if exists public.fn_get_project_analytics_channel_trends(
  integer, text, date, date
);

create or replace function public.fn_get_project_analytics_channel_trends(
  p_project_id integer,
  p_period_type text,
  p_start_date date,
  p_end_date date,
  p_compare_mode text default 'previous'
)
returns table (
  channel_group text,
  total_active_users numeric,
  total_sessions numeric,
  avg_session_duration numeric,
  prev_total_active_users numeric,
  prev_total_sessions numeric,
  prev_avg_session_duration numeric,
  sessions_change_pct numeric,
  active_users_change_pct numeric
)
language sql
security definer
set search_path to 'public'
as $function$
  with bounds as (
    select
      p_start_date as curr_start,
      p_end_date as curr_end,
      case
        when coalesce(nullif(trim(p_compare_mode), ''), 'previous') = 'year_ago' then
          (p_start_date - interval '1 year')::date
        else
          (p_start_date - 1) - (p_end_date - p_start_date)
      end as prev_start,
      case
        when coalesce(nullif(trim(p_compare_mode), ''), 'previous') = 'year_ago' then
          (p_end_date - interval '1 year')::date
        else
          (p_start_date - 1)
      end as prev_end
  ),
  current_base as (
    select
      d.channel_group,
      coalesce(d.active_users, 0) as active_users,
      coalesce(d.sessions, 0) as sessions,
      coalesce(d.avg_session_duration, 0) as avg_session_duration
    from project_analytics_daily d
    cross join bounds b
    where d.project_id = p_project_id
      and d.date between b.curr_start and b.curr_end
  ),
  previous_base as (
    select
      d.channel_group,
      coalesce(d.active_users, 0) as active_users,
      coalesce(d.sessions, 0) as sessions,
      coalesce(d.avg_session_duration, 0) as avg_session_duration
    from project_analytics_daily d
    cross join bounds b
    where d.project_id = p_project_id
      and d.date between b.prev_start and b.prev_end
  ),
  current_agg as (
    select
      channel_group,
      sum(active_users) as total_active_users,
      sum(sessions) as total_sessions,
      case
        when sum(sessions) > 0 then sum(sessions * avg_session_duration) / sum(sessions)
        else null
      end as avg_session_duration
    from current_base
    group by channel_group
  ),
  previous_agg as (
    select
      channel_group,
      sum(active_users) as total_active_users,
      sum(sessions) as total_sessions,
      case
        when sum(sessions) > 0 then sum(sessions * avg_session_duration) / sum(sessions)
        else null
      end as avg_session_duration
    from previous_base
    group by channel_group
  ),
  joined as (
    select
      coalesce(c.channel_group, p.channel_group) as channel_group,
      coalesce(c.total_active_users, 0) as total_active_users,
      coalesce(c.total_sessions, 0) as total_sessions,
      c.avg_session_duration,
      coalesce(p.total_active_users, 0) as prev_total_active_users,
      coalesce(p.total_sessions, 0) as prev_total_sessions,
      p.avg_session_duration as prev_avg_session_duration
    from current_agg c
    full outer join previous_agg p
      on p.channel_group = c.channel_group
  )
  select
    j.channel_group,
    j.total_active_users,
    j.total_sessions,
    j.avg_session_duration,
    j.prev_total_active_users,
    j.prev_total_sessions,
    j.prev_avg_session_duration,
    case
      when j.prev_total_sessions = 0 and j.total_sessions = 0 then 0
      when j.prev_total_sessions = 0 then null
      else round(((j.total_sessions - j.prev_total_sessions) / j.prev_total_sessions) * 100, 0)
    end as sessions_change_pct,
    case
      when j.prev_total_active_users = 0 and j.total_active_users = 0 then 0
      when j.prev_total_active_users = 0 then null
      else round(((j.total_active_users - j.prev_total_active_users) / j.prev_total_active_users) * 100, 0)
    end as active_users_change_pct
  from joined j
  order by j.total_sessions desc nulls last;
$function$;

grant execute on function public.fn_get_project_analytics_channel_trends(
  integer, text, date, date, text
) to public;

grant execute on function public.fn_get_project_analytics_channel_trends(
  integer, text, date, date, text
) to authenticated;

grant execute on function public.fn_get_project_analytics_channel_trends(
  integer, text, date, date, text
) to anon;

grant execute on function public.fn_get_project_analytics_channel_trends(
  integer, text, date, date, text
) to service_role;
