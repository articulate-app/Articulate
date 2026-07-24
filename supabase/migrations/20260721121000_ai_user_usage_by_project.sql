-- Add per-project breakdown to user AI usage timeseries.

CREATE OR REPLACE FUNCTION public.ai_get_user_token_usage_timeseries(
  p_user_id integer,
  p_team_id integer,
  p_date_from date,
  p_date_to date,
  p_timezone text DEFAULT 'UTC'::text,
  p_granularity text DEFAULT 'day'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor integer := current_user_id();
  v_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
  v_granularity text := lower(coalesce(nullif(btrim(p_granularity), ''), 'day'));
  v_from timestamptz;
  v_to_exclusive timestamptz;
  v_snapshot jsonb;
  v_range_summary jsonb;
  v_series jsonb := '[]'::jsonb;
  v_by_model jsonb := '[]'::jsonb;
  v_by_project jsonb := '[]'::jsonb;
  v_can_manage boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  IF p_user_id IS NULL OR p_user_id <= 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_user_id';
  END IF;

  IF p_team_id IS NULL OR p_team_id <= 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_team_id';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_from > p_date_to THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_date_range';
  END IF;

  IF v_granularity IS DISTINCT FROM 'day' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'unsupported_granularity';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.v_user_teams_i_can_see t
    WHERE t.user_id = v_actor
      AND t.team_id = p_team_id
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'team_read_forbidden';
  END IF;

  IF v_actor IS DISTINCT FROM p_user_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.v_users_minimal_i_can_see u
       WHERE u.id = p_user_id
     ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'user_read_forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.teams_users tu
    WHERE tu.team_id = p_team_id
      AND tu.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'user_not_in_team';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.teams_users tu
    WHERE tu.user_id = v_actor
      AND (
        tu.role_id = 3
        OR (tu.team_id = p_team_id AND tu.role_id = 7)
      )
  )
  INTO v_can_manage;

  BEGIN
    PERFORM now() AT TIME ZONE v_timezone;
  EXCEPTION WHEN invalid_parameter_value THEN
    v_timezone := 'UTC';
  END;

  v_from := (p_date_from::timestamp WITHOUT TIME ZONE) AT TIME ZONE v_timezone;
  v_to_exclusive := ((p_date_to + 1)::timestamp WITHOUT TIME ZONE) AT TIME ZONE v_timezone;

  v_snapshot := public.ai_token_scope_snapshot('user', p_user_id, p_team_id, now());

  SELECT jsonb_build_object(
    'prompt_tokens', coalesce(sum(e.prompt_tokens), 0),
    'completion_tokens', coalesce(sum(e.completion_tokens), 0),
    'cached_prompt_tokens', coalesce(sum(e.cached_prompt_tokens), 0),
    'total_tokens', coalesce(sum(e.total_tokens), 0),
    'call_count', coalesce(count(*), 0),
    'limit_tokens', v_snapshot -> 'limit_tokens',
    'remaining_tokens', v_snapshot -> 'remaining_tokens',
    'percent_used', v_snapshot -> 'percent_used',
    'period_start', v_snapshot -> 'period_start',
    'resets_at', v_snapshot -> 'resets_at'
  )
  INTO v_range_summary
  FROM public.ai_token_usage_events e
  WHERE e.team_id = p_team_id
    AND e.user_id = p_user_id
    AND e.status IN ('completed', 'failed')
    AND e.occurred_at >= v_from
    AND e.occurred_at < v_to_exclusive;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket_start', to_char(bucket_day, 'YYYY-MM-DD'),
        'prompt_tokens', prompt_tokens,
        'completion_tokens', completion_tokens,
        'cached_prompt_tokens', cached_prompt_tokens,
        'total_tokens', total_tokens,
        'call_count', call_count
      )
      ORDER BY bucket_day
    ),
    '[]'::jsonb
  )
  INTO v_series
  FROM (
    SELECT
      (date_trunc('day', e.occurred_at AT TIME ZONE v_timezone))::date AS bucket_day,
      coalesce(sum(e.prompt_tokens), 0)::bigint AS prompt_tokens,
      coalesce(sum(e.completion_tokens), 0)::bigint AS completion_tokens,
      coalesce(sum(e.cached_prompt_tokens), 0)::bigint AS cached_prompt_tokens,
      coalesce(sum(e.total_tokens), 0)::bigint AS total_tokens,
      count(*)::bigint AS call_count
    FROM public.ai_token_usage_events e
    WHERE e.team_id = p_team_id
      AND e.user_id = p_user_id
      AND e.status IN ('completed', 'failed')
      AND e.occurred_at >= v_from
      AND e.occurred_at < v_to_exclusive
    GROUP BY 1
  ) s;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider', provider,
        'model', model,
        'total_tokens', total_tokens,
        'call_count', call_count
      )
      ORDER BY total_tokens DESC, call_count DESC, provider, model
    ),
    '[]'::jsonb
  )
  INTO v_by_model
  FROM (
    SELECT
      coalesce(nullif(btrim(e.provider), ''), 'unknown') AS provider,
      coalesce(nullif(btrim(e.model), ''), 'unknown') AS model,
      coalesce(sum(e.total_tokens), 0)::bigint AS total_tokens,
      count(*)::bigint AS call_count
    FROM public.ai_token_usage_events e
    WHERE e.team_id = p_team_id
      AND e.user_id = p_user_id
      AND e.status IN ('completed', 'failed')
      AND e.occurred_at >= v_from
      AND e.occurred_at < v_to_exclusive
    GROUP BY 1, 2
  ) m;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'project_id', project_id,
        'project_title', project_title,
        'total_tokens', total_tokens,
        'call_count', call_count
      )
      ORDER BY total_tokens DESC, call_count DESC, project_title, project_id
    ),
    '[]'::jsonb
  )
  INTO v_by_project
  FROM (
    SELECT
      e.project_id,
      coalesce(nullif(btrim(p.name), ''), 'No project') AS project_title,
      coalesce(sum(e.total_tokens), 0)::bigint AS total_tokens,
      count(*)::bigint AS call_count
    FROM public.ai_token_usage_events e
    LEFT JOIN public.projects p ON p.id = e.project_id
    WHERE e.team_id = p_team_id
      AND e.user_id = p_user_id
      AND e.status IN ('completed', 'failed')
      AND e.occurred_at >= v_from
      AND e.occurred_at < v_to_exclusive
    GROUP BY e.project_id, coalesce(nullif(btrim(p.name), ''), 'No project')
  ) pr;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'team_id', p_team_id,
    'can_manage', v_can_manage,
    'timezone', coalesce(v_snapshot ->> 'timezone', v_timezone),
    'date_from', to_char(p_date_from, 'YYYY-MM-DD'),
    'date_to', to_char(p_date_to, 'YYYY-MM-DD'),
    'summary', v_range_summary,
    'series', v_series,
    'by_model', v_by_model,
    'by_project', v_by_project
  );
END;
$function$;

COMMENT ON FUNCTION public.ai_get_user_token_usage_timeseries(integer, integer, date, date, text, text) IS
  'Per-user AI token usage timeseries with by_model and by_project breakdowns.';
