create or replace function public.ai_create_preference_v1(
  p_rule text,
  p_category text default 'other',
  p_scope text default 'user',
  p_project_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_user_id integer := public.current_user_id();
  v_rule text := btrim(coalesce(p_rule,''));
  v_category text := lower(btrim(coalesce(p_category,'other')));
  v_scope text := lower(btrim(coalesce(p_scope,'user')));
  v_scope_type text;
  v_project_id integer := p_project_id;
  v_pref_id uuid;
  v_key text;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='authentication_required';
  end if;
  if char_length(v_rule) < 3 or char_length(v_rule) > 600 then
    raise exception using errcode='22023', message='invalid_preference_rule';
  end if;
  if v_category not in ('tone','terminology','structure','formatting','other') then
    raise exception using errcode='22023', message='invalid_preference_category';
  end if;
  if v_scope not in ('user','user_project','project') then
    raise exception using errcode='22023', message='invalid_preference_scope';
  end if;
  if v_scope in ('user_project','project') and v_project_id is null then
    raise exception using errcode='22023', message='project_required';
  end if;
  if v_scope='user' then
    v_project_id := null;
  end if;
  if v_project_id is not null and not exists (
    select 1
    from public.projects pr
    join public.teams_users tu on tu.team_id=pr.team_id and tu.user_id=v_user_id
    where pr.id=v_project_id
  ) then
    raise exception using errcode='42501', message='project_access_denied';
  end if;

  v_scope_type := case when v_scope='project' then 'project' else 'user' end;
  v_key := 'manual_' || pg_catalog.md5(lower(v_rule));

  insert into public.ai_preferences(
    scope_type,user_id,project_id,category,rule,normalized_key,confidence,
    evidence_count,status,applies_to,first_observed_at,last_observed_at,created_by
  ) values (
    v_scope_type,
    case when v_scope='project' then null else v_user_id end,
    v_project_id,
    v_category,
    v_rule,
    v_key,
    1,1,'active','{}'::jsonb,now(),now(),v_user_id
  ) returning id into v_pref_id;

  insert into public.ai_preference_observations(
    preference_id,source_type,actor_user_id,project_id,proposed_scope,
    category,candidate_rule,normalized_key,confidence,polarity,evidence
  ) values (
    v_pref_id,'manual',v_user_id,v_project_id,v_scope_type,
    v_category,v_rule,v_key,1,'support',
    jsonb_build_object('source','settings_ui','action','create','ui_scope',v_scope)
  );

  return jsonb_build_object('ok',true,'id',v_pref_id,'status','active');
end;
$function$;

grant execute on function public.ai_create_preference_v1(text,text,text,integer) to authenticated;
