alter table public.ai_token_usage_events
  add column if not exists cache_write_tokens integer not null default 0;

alter table public.ai_token_usage_events
  drop constraint if exists ai_token_usage_events_cache_write_tokens_check;

alter table public.ai_token_usage_events
  add constraint ai_token_usage_events_cache_write_tokens_check
  check (cache_write_tokens >= 0);

drop function if exists public.ai_finalize_token_call(uuid,uuid,text,integer,integer,integer,integer,integer,boolean,text,jsonb);

create or replace function public.ai_finalize_token_call(
  p_event_id uuid,
  p_run_id uuid default null::uuid,
  p_provider_request_id text default null::text,
  p_provider_http_status integer default null::integer,
  p_prompt_tokens integer default 0,
  p_completion_tokens integer default 0,
  p_cached_prompt_tokens integer default 0,
  p_cache_write_tokens integer default 0,
  p_total_tokens integer default 0,
  p_succeeded boolean default true,
  p_error_code text default null::text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor integer := current_user_id();
  v_event public.ai_token_usage_events%rowtype;
  v_run public.ai_chat_runs%rowtype;
  v_prompt integer := greatest(coalesce(p_prompt_tokens, 0), 0);
  v_completion integer := greatest(coalesce(p_completion_tokens, 0), 0);
  v_cached integer := greatest(coalesce(p_cached_prompt_tokens, 0), 0);
  v_cache_write integer := greatest(coalesce(p_cache_write_tokens, 0), 0);
  v_total integer := greatest(coalesce(p_total_tokens, 0), 0);
  v_accounted integer;
  v_is_estimate boolean := false;
begin
  select * into strict v_event from public.ai_token_usage_events where id = p_event_id for update;
  if auth.role() <> 'service_role' and v_event.user_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'token_event_forbidden';
  end if;
  if v_event.status in ('completed', 'failed') then
    return to_jsonb(v_event);
  end if;

  if p_run_id is not null then
    select * into strict v_run from public.ai_chat_runs where id = p_run_id;
    if v_run.created_by is distinct from v_event.user_id or v_run.thread_id is distinct from v_event.thread_id then
      raise exception using errcode = '42501', message = 'run_forbidden';
    end if;
  end if;

  if v_total = 0 then v_total := v_prompt + v_completion; end if;
  if v_total > 0 then
    v_accounted := v_total;
  elsif coalesce(p_provider_http_status, 0) between 200 and 299 then
    v_accounted := v_event.reserved_tokens;
    v_is_estimate := true;
  else
    v_accounted := 0;
  end if;

  update public.ai_token_usage_events
  set run_id = coalesce(p_run_id, run_id),
      status = case when p_succeeded then 'completed' else 'failed' end,
      reserved_tokens = 0,
      prompt_tokens = v_prompt,
      completion_tokens = v_completion,
      cached_prompt_tokens = v_cached,
      cache_write_tokens = v_cache_write,
      total_tokens = v_total,
      accounted_tokens = v_accounted,
      is_estimate = v_is_estimate,
      provider_request_id = left(nullif(p_provider_request_id, ''), 200),
      provider_http_status = p_provider_http_status,
      error_code = left(nullif(p_error_code, ''), 120),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      finalized_at = now(),
      updated_at = now()
  where id = p_event_id
  returning * into v_event;

  return to_jsonb(v_event) || jsonb_build_object(
    'usage', jsonb_build_object(
      'user', public.ai_token_scope_snapshot('user', v_event.user_id, v_event.team_id, now()),
      'team', case when v_event.team_id is null then null else public.ai_token_scope_snapshot('team', v_event.user_id, v_event.team_id, now()) end
    )
  );
end;
$function$;

grant execute on function public.ai_finalize_token_call(uuid,uuid,text,integer,integer,integer,integer,integer,integer,boolean,text,jsonb)
  to authenticated, service_role;
