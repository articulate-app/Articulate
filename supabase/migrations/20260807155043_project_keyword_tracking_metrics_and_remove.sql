-- Tracked keywords: store Ads SV/KD, allow deactivate via RPC, expose metrics in view.

alter table public.project_keywords
  add column if not exists search_volume integer,
  add column if not exists competition_index integer;

comment on column public.project_keywords.search_volume is
  'Google Ads avg monthly searches for the keyword locale at last enrich.';
comment on column public.project_keywords.competition_index is
  'Google Ads competition index 0-100 (shown as KD in the product).';

drop view if exists public.v_project_keywords_with_latest_rank;

create view public.v_project_keywords_with_latest_rank as
select
  pk.id as project_keyword_id,
  pk.project_id,
  pk.keyword,
  pk.language_code,
  pk.region_code,
  pk.search_volume,
  pk.competition_index,
  pk.is_active,
  pk.created_at,
  pk.updated_at,
  r.rank,
  r.check_date,
  r.found_url,
  r.found_domain,
  r.top_results
from public.project_keywords pk
left join lateral (
  select
    r_1.id,
    r_1.project_keyword_id,
    r_1.check_date,
    r_1.rank,
    r_1.found_url,
    r_1.found_domain,
    r_1.top_results,
    r_1.created_at
  from public.project_keyword_rankings r_1
  where r_1.project_keyword_id = pk.id
  order by r_1.check_date desc, r_1.created_at desc
  limit 1
) r on true
where coalesce(pk.is_active, true) = true;

grant select on public.v_project_keywords_with_latest_rank to authenticated, anon, service_role;

create or replace function public.fn_deactivate_project_keyword(
  p_project_keyword_id integer
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project_id integer;
begin
  select project_id
    into v_project_id
  from public.project_keywords
  where id = p_project_keyword_id;

  if v_project_id is null then
    raise exception 'Keyword not found';
  end if;

  if not coalesce(public.can_edit_project(v_project_id), false) then
    raise exception 'Not allowed to edit this project';
  end if;

  update public.project_keywords
  set
    is_active = false,
    updated_at = now()
  where id = p_project_keyword_id
    and coalesce(is_active, true) = true;

  return true;
end;
$$;

revoke all on function public.fn_deactivate_project_keyword(integer) from public;
grant execute on function public.fn_deactivate_project_keyword(integer) to authenticated, service_role;

create or replace function public.fn_update_project_keyword_metrics(
  p_project_keyword_id integer,
  p_search_volume integer,
  p_competition_index integer
)
returns public.project_keywords
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project_id integer;
  rec public.project_keywords;
begin
  select project_id
    into v_project_id
  from public.project_keywords
  where id = p_project_keyword_id;

  if v_project_id is null then
    raise exception 'Keyword not found';
  end if;

  if not coalesce(public.can_edit_project(v_project_id), false) then
    raise exception 'Not allowed to edit this project';
  end if;

  update public.project_keywords
  set
    search_volume = p_search_volume,
    competition_index = p_competition_index,
    updated_at = now()
  where id = p_project_keyword_id
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.fn_update_project_keyword_metrics(integer, integer, integer) from public;
grant execute on function public.fn_update_project_keyword_metrics(integer, integer, integer) to authenticated, service_role;
