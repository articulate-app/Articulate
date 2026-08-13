-- Release orphaned token reservations left behind when an artifact worker
-- isolate is killed (WORKER_RESOURCE_LIMIT / 546) before finalize runs.
CREATE OR REPLACE FUNCTION public.ai_release_open_token_calls_v1(
  p_client_request_id uuid,
  p_reason text DEFAULT 'work_unit_retry'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor integer := public.current_user_id();
  v_released integer := 0;
begin
  if p_client_request_id is null then
    raise exception using errcode = '22023', message = 'client_request_id_required';
  end if;
  if auth.role() <> 'service_role' and v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  update public.ai_token_usage_events
  set status = 'released',
      reserved_tokens = 0,
      error_code = left(coalesce(nullif(trim(p_reason), ''), 'work_unit_retry'), 120),
      finalized_at = now(),
      updated_at = now()
  where client_request_id = p_client_request_id
    and status = 'reserved'
    and (auth.role() = 'service_role' or user_id = v_actor);

  get diagnostics v_released = row_count;

  return jsonb_build_object(
    'ok', true,
    'released_count', v_released,
    'client_request_id', p_client_request_id
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.ai_release_open_token_calls_v1(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_release_open_token_calls_v1(uuid, text) TO authenticated, service_role;
