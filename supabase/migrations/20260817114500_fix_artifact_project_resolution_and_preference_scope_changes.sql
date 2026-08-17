create or replace function public.ai_queue_preference_from_artifact_version_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_base public.artifact_versions%rowtype;
  v_project_id integer;
  v_source_key text;
begin
  if new.change_source <> 'manual' or new.changed_by is null then return new; end if;

  select v.* into v_base
  from public.artifact_versions v
  where v.artifact_id=new.artifact_id
    and v.version_number<new.version_number
    and v.change_source<>'manual'
  order by v.version_number desc
  limit 1;

  if not found then return new; end if;
  if not (v_base.change_source in ('ai_build','ai','ai_chat') or v_base.ai_run_id is not null or v_base.ai_message_id is not null) then return new; end if;

  select coalesce(a.project_id,t.project_id_int)
  into v_project_id
  from public.artifacts a
  left join public.tasks t on t.id=a.task_id
  where a.id=new.artifact_id;

  v_source_key := 'artifact:'||new.artifact_id::text||':base:'||v_base.version_number::text;

  insert into public.ai_preference_learning_queue(
    source_key,source_type,artifact_id,from_version_number,to_version_number,
    actor_user_id,project_id,status,available_at,created_at,updated_at
  ) values (
    v_source_key,'artifact_edit',new.artifact_id,v_base.version_number,new.version_number,
    new.changed_by,v_project_id,'queued',now()+interval '90 seconds',now(),now()
  )
  on conflict (source_key) do update set
    to_version_number=greatest(public.ai_preference_learning_queue.to_version_number,excluded.to_version_number),
    actor_user_id=excluded.actor_user_id,
    project_id=coalesce(excluded.project_id,public.ai_preference_learning_queue.project_id),
    status='queued',available_at=now()+interval '90 seconds',updated_at=now(),processed_at=null,last_error=null;

  return new;
end;
$function$;

create or replace function public.ai_change_preference_scope_v1(
  p_preference_id uuid,
  p_scope text,
  p_project_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_user_id integer := public.current_user_id();
  v_pref public.ai_preferences%rowtype;
  v_scope text := lower(btrim(coalesce(p_scope,'')));
  v_target_scope_type text;
  v_target_user_id integer;
  v_target_project_id integer;
  v_existing public.ai_preferences%rowtype;
  v_target_id uuid;
  v_total_count integer;
  v_conf numeric(5,4);
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication_required'; end if;
  if v_scope not in ('user','user_project','project') then raise exception using errcode='22023', message='invalid_preference_scope'; end if;

  select * into v_pref from public.ai_preferences where id=p_preference_id for update;
  if not found then raise exception using errcode='P0002', message='preference_not_found'; end if;

  if v_pref.scope_type='user' and v_pref.user_id<>v_user_id then
    raise exception using errcode='42501', message='preference_edit_denied';
  end if;
  if v_pref.scope_type='project' and not exists (
    select 1 from public.projects pr join public.teams_users tu on tu.team_id=pr.team_id and tu.user_id=v_user_id where pr.id=v_pref.project_id
  ) then raise exception using errcode='42501', message='preference_edit_denied'; end if;

  if v_scope='user' then
    v_target_scope_type:='user'; v_target_user_id:=v_user_id; v_target_project_id:=null;
  elsif v_scope='user_project' then
    v_target_scope_type:='user'; v_target_user_id:=v_user_id; v_target_project_id:=coalesce(p_project_id,v_pref.project_id);
    if v_target_project_id is null then raise exception using errcode='22023', message='project_required'; end if;
  else
    v_target_scope_type:='project'; v_target_user_id:=null; v_target_project_id:=coalesce(p_project_id,v_pref.project_id);
    if v_target_project_id is null then raise exception using errcode='22023', message='project_required'; end if;
  end if;

  if v_target_project_id is not null and not exists (
    select 1 from public.projects pr join public.teams_users tu on tu.team_id=pr.team_id and tu.user_id=v_user_id where pr.id=v_target_project_id
  ) then raise exception using errcode='42501', message='project_access_denied'; end if;

  if v_pref.scope_type=v_target_scope_type
     and coalesce(v_pref.user_id,0)=coalesce(v_target_user_id,0)
     and coalesce(v_pref.project_id,0)=coalesce(v_target_project_id,0) then
    return jsonb_build_object('ok',true,'id',v_pref.id,'scope',v_scope);
  end if;

  select * into v_existing
  from public.ai_preferences p
  where p.id<>v_pref.id
    and p.scope_type=v_target_scope_type
    and coalesce(p.user_id,0)=coalesce(v_target_user_id,0)
    and coalesce(p.project_id,0)=coalesce(v_target_project_id,0)
    and p.category=v_pref.category
    and p.normalized_key=v_pref.normalized_key
    and p.status in ('candidate','active')
  order by case when p.status='active' then 0 else 1 end, p.updated_at desc
  limit 1
  for update;

  if found then
    v_total_count := greatest(1,v_existing.evidence_count+v_pref.evidence_count);
    v_conf := round(((v_existing.confidence*v_existing.evidence_count)+(v_pref.confidence*v_pref.evidence_count))/v_total_count,4);
    update public.ai_preference_observations set preference_id=v_existing.id, project_id=v_target_project_id where preference_id=v_pref.id;
    update public.ai_preferences set
      evidence_count=v_total_count,
      confidence=least(0.99,v_conf),
      status=case when v_existing.status='active' or v_pref.status='active' then 'active' else 'candidate' end,
      last_observed_at=greatest(v_existing.last_observed_at,v_pref.last_observed_at),
      updated_at=now()
    where id=v_existing.id;
    update public.ai_preferences set status='superseded',updated_at=now() where id=v_pref.id;
    v_target_id:=v_existing.id;
  else
    update public.ai_preferences set
      scope_type=v_target_scope_type,
      user_id=v_target_user_id,
      project_id=v_target_project_id,
      updated_at=now()
    where id=v_pref.id;
    update public.ai_preference_observations set project_id=v_target_project_id where preference_id=v_pref.id;
    v_target_id:=v_pref.id;
  end if;

  insert into public.ai_preference_observations(
    preference_id,source_type,actor_user_id,project_id,proposed_scope,category,candidate_rule,normalized_key,confidence,polarity,evidence
  ) values (
    v_target_id,'manual',v_user_id,v_target_project_id,v_target_scope_type,v_pref.category,v_pref.rule,v_pref.normalized_key,1,'support',
    jsonb_build_object('source','settings_ui','action','change_scope','ui_scope',v_scope)
  );

  return jsonb_build_object('ok',true,'id',v_target_id,'scope',v_scope,'project_id',v_target_project_id);
end;
$function$;

grant execute on function public.ai_change_preference_scope_v1(uuid,text,integer) to authenticated;
