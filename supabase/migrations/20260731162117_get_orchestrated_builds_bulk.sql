-- Bulk read for chat history hydrate: one round-trip for many builds.
-- Supports either cursor paging (after_sequence) or a short event tail.

create or replace function public.ai_get_orchestrated_builds_v1(
  p_requests jsonb,
  p_default_event_limit integer default 80
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_actor integer := public.current_user_id();
  v_is_service boolean := auth.role() = 'service_role';
  v_req jsonb;
  v_build_id uuid;
  v_after_sequence integer;
  v_event_limit integer;
  v_tail_events integer;
  v_job public.ai_build_jobs%rowtype;
  v_units jsonb;
  v_events jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if p_requests is null or jsonb_typeof(p_requests) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'requests_array_required', 'builds', '[]'::jsonb);
  end if;

  for v_req in
    select value
    from jsonb_array_elements(p_requests)
    limit 40
  loop
    v_count := v_count + 1;
    begin
      v_build_id := nullif(v_req->>'build_id', '')::uuid;
    exception when others then
      v_build_id := null;
    end;

    if v_build_id is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false,
        'error', 'build_id_required'
      ));
      continue;
    end if;

    select * into v_job
    from public.ai_build_jobs
    where id = v_build_id
      and (v_is_service or created_by = v_actor);

    if not found then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false,
        'build_id', v_build_id,
        'error', 'build_forbidden_or_not_found'
      ));
      continue;
    end if;

    v_after_sequence := greatest(coalesce((v_req->>'after_sequence')::integer, 0), 0);
    begin
      v_tail_events := nullif(v_req->>'tail_events', '')::integer;
    exception when others then
      v_tail_events := null;
    end;
    v_event_limit := greatest(
      1,
      least(
        coalesce(
          nullif(v_req->>'event_limit', '')::integer,
          nullif(p_default_event_limit, 0),
          80
        ),
        500
      )
    );

    select coalesce(jsonb_agg((to_jsonb(u) - 'lease_token') order by u.position, u.created_at), '[]'::jsonb)
    into v_units
    from public.ai_build_work_units u
    where u.build_id = v_build_id;

    if v_tail_events is not null and v_tail_events > 0 then
      -- Last N events (history card hydrate) — avoids replaying from sequence 0.
      select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence), '[]'::jsonb)
      into v_events
      from (
        select *
        from public.ai_build_events
        where build_id = v_build_id
        order by sequence desc
        limit least(v_tail_events, 500)
      ) e;
    else
      select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence), '[]'::jsonb)
      into v_events
      from (
        select *
        from public.ai_build_events
        where build_id = v_build_id
          and sequence > v_after_sequence
        order by sequence
        limit v_event_limit
      ) e;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'ok', true,
      'build', to_jsonb(v_job),
      'units', v_units,
      'events', v_events,
      'next_sequence', v_job.last_event_sequence
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'builds', v_results,
    'count', v_count
  );
end;
$function$;

revoke all on function public.ai_get_orchestrated_builds_v1(jsonb, integer) from public;
grant execute on function public.ai_get_orchestrated_builds_v1(jsonb, integer) to authenticated;
grant execute on function public.ai_get_orchestrated_builds_v1(jsonb, integer) to service_role;

comment on function public.ai_get_orchestrated_builds_v1(jsonb, integer) is
  'Bulk orchestrated-build snapshots for chat history hydrate (status + optional event tail).';
