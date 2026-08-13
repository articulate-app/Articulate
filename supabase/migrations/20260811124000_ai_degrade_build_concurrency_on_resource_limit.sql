-- Allow orchestrator to lower concurrency when workers hit WORKER_RESOURCE_LIMIT,
-- so failed units can be requeued and drained more sequentially.
CREATE OR REPLACE FUNCTION public.ai_degrade_build_concurrency_v1(
  p_build_id uuid,
  p_target integer DEFAULT 1,
  p_reason text DEFAULT 'worker_resource_limit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor integer := public.current_user_id();
  v_job public.ai_build_jobs%rowtype;
  v_target integer := greatest(1, least(coalesce(p_target, 1), 8));
  v_previous integer;
begin
  select * into v_job
  from public.ai_build_jobs
  where id = p_build_id
    and (auth.role() = 'service_role' or created_by = v_actor)
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'build_forbidden_or_not_found';
  end if;

  v_previous := greatest(1, coalesce(v_job.concurrency_limit, 1));
  if v_previous <= v_target then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'build_id', p_build_id,
      'concurrency_limit', v_previous,
      'previous_concurrency_limit', v_previous
    );
  end if;

  update public.ai_build_jobs
  set concurrency_limit = v_target,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'degraded_for_resource_limit', true,
        'degraded_at', now(),
        'degrade_reason', left(coalesce(nullif(trim(p_reason), ''), 'worker_resource_limit'), 200),
        'previous_concurrency_limit', v_previous
      ),
      updated_at = now()
  where id = p_build_id;

  perform public.ai_append_build_event_v1(
    p_build_id,
    'build.concurrency_degraded',
    coalesce(v_job.status, 'running'),
    null,
    jsonb_build_object(
      'previous_concurrency_limit', v_previous,
      'concurrency_limit', v_target,
      'reason', left(coalesce(nullif(trim(p_reason), ''), 'worker_resource_limit'), 200)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'build_id', p_build_id,
    'concurrency_limit', v_target,
    'previous_concurrency_limit', v_previous
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.ai_degrade_build_concurrency_v1(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_degrade_build_concurrency_v1(uuid, integer, text) TO authenticated, service_role;
