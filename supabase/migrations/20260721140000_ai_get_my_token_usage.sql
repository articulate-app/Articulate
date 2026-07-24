-- My AI usage across all teams the actor belongs to (no team filter).

CREATE OR REPLACE FUNCTION public.ai_get_my_token_usage_timeseries(
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
  v_range_summary jsonb;
  v_series jsonb := '[]'::jsonb;
  v_by_model jsonb := '[]'::jsonb;
  v_by_project jsonb := '[]'::jsonb;
  v_by_team jsonb := '[]'::jsonb;
  v_today_used bigint := 0;
  v_strictest jsonb := NULL;
  v_team_ids integer[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_from > p_date_to THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_date_range';
  END IF;

  IF v_granularity IS DISTINCT FROM 'day' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'unsupported_granularity';
  END IF;

  BEGIN
    PERFORM now() AT TIME ZONE v_timezone;
  EXCEPTION WHEN invalid_parameter_value THEN
    v_timezone := 'UTC';
  END;

  SELECT coalesce(array_agg(tu.team_id ORDER BY tu.team_id), ARRAY[]::integer[])
  INTO v_team_ids
  FROM public.teams_users tu
  WHERE tu.user_id = v_actor;

  v_from := (p_date_from::timestamp WITHOUT TIME ZONE) AT TIME ZONE v_timezone;
  v_to_exclusive := ((p_date_to + 1)::timestamp WITHOUT TIME ZONE) AT TIME ZONE v_timezone;

  -- Strictest personal limit among teams (highest percent_used with a configured limit).
  SELECT s.snapshot
  INTO v_strictest
  FROM (
    SELECT
      public.ai_token_scope_snapshot('user', v_actor, t.team_id, now()) AS snapshot
    FROM unnest(v_team_ids) AS t(team_id)
  ) s
  WHERE (s.snapshot ->> 'limit_tokens') IS NOT NULL
    AND nullif(s.snapshot ->> 'limit_tokens', '')::numeric > 0
  ORDER BY coalesce((s.snapshot ->> 'percent_used')::numeric, 0) DESC
  LIMIT 1;

  SELECT coalesce(sum(e.total_tokens), 0)::bigint
  INTO v_today_used
  FROM public.ai_token_usage_events e
  WHERE e.user_id = v_actor
    AND e.team_id = ANY (v_team_ids)
    AND e.status IN ('completed', 'failed')
    AND e.occurred_at >= (date_trunc('day', now() AT TIME ZONE v_timezone) AT TIME ZONE v_timezone)
    AND e.occurred_at < ((date_trunc('day', now() AT TIME ZONE v_timezone) + interval '1 day') AT TIME ZONE v_timezone);

  SELECT jsonb_build_object(
    'prompt_tokens', coalesce(sum(e.prompt_tokens), 0),
    'completion_tokens', coalesce(sum(e.completion_tokens), 0),
    'cached_prompt_tokens', coalesce(sum(e.cached_prompt_tokens), 0),
    'total_tokens', coalesce(sum(e.total_tokens), 0),
    'call_count', coalesce(count(*), 0),
    'limit_tokens', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'limit_tokens') END,
    'remaining_tokens', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'remaining_tokens') END,
    'percent_used', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'percent_used') END,
    'period_start', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'period_start') END,
    'resets_at', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'resets_at') END,
    'today_tokens', v_today_used,
    'strictest_team_id', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'team_id') END
  )
  INTO v_range_summary
  FROM public.ai_token_usage_events e
  WHERE e.user_id = v_actor
    AND (cardinality(v_team_ids) = 0 OR e.team_id = ANY (v_team_ids))
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
    WHERE e.user_id = v_actor
      AND (cardinality(v_team_ids) = 0 OR e.team_id = ANY (v_team_ids))
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
    WHERE e.user_id = v_actor
      AND (cardinality(v_team_ids) = 0 OR e.team_id = ANY (v_team_ids))
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
    WHERE e.user_id = v_actor
      AND (cardinality(v_team_ids) = 0 OR e.team_id = ANY (v_team_ids))
      AND e.status IN ('completed', 'failed')
      AND e.occurred_at >= v_from
      AND e.occurred_at < v_to_exclusive
    GROUP BY e.project_id, coalesce(nullif(btrim(p.name), ''), 'No project')
  ) pr;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team_id', team_id,
        'team_title', team_title,
        'total_tokens', total_tokens,
        'call_count', call_count,
        'limit_tokens', snapshot -> 'limit_tokens',
        'remaining_tokens', snapshot -> 'remaining_tokens',
        'percent_used', snapshot -> 'percent_used'
      )
      ORDER BY total_tokens DESC, call_count DESC, team_title, team_id
    ),
    '[]'::jsonb
  )
  INTO v_by_team
  FROM (
    SELECT
      tu.team_id,
      coalesce(nullif(btrim(t.title), ''), 'Team ' || tu.team_id::text) AS team_title,
      coalesce(u.total_tokens, 0)::bigint AS total_tokens,
      coalesce(u.call_count, 0)::bigint AS call_count,
      public.ai_token_scope_snapshot('user', v_actor, tu.team_id, now()) AS snapshot
    FROM public.teams_users tu
    LEFT JOIN public.teams t ON t.id = tu.team_id
    LEFT JOIN (
      SELECT
        e.team_id,
        coalesce(sum(e.total_tokens), 0)::bigint AS total_tokens,
        count(*)::bigint AS call_count
      FROM public.ai_token_usage_events e
      WHERE e.user_id = v_actor
        AND e.status IN ('completed', 'failed')
        AND e.occurred_at >= v_from
        AND e.occurred_at < v_to_exclusive
      GROUP BY e.team_id
    ) u ON u.team_id = tu.team_id
    WHERE tu.user_id = v_actor
  ) tm;

  RETURN jsonb_build_object(
    'user_id', v_actor,
    'timezone', coalesce(v_strictest ->> 'timezone', v_timezone),
    'date_from', to_char(p_date_from, 'YYYY-MM-DD'),
    'date_to', to_char(p_date_to, 'YYYY-MM-DD'),
    'summary', v_range_summary,
    'series', v_series,
    'by_model', v_by_model,
    'by_project', v_by_project,
    'by_team', v_by_team
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_get_my_token_usage_timeseries(date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_get_my_token_usage_timeseries(date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_get_my_token_usage_timeseries(date, date, text, text) TO service_role;

COMMENT ON FUNCTION public.ai_get_my_token_usage_timeseries(date, date, text, text) IS
  'Current user AI token usage across all member teams, with by_team / by_project / by_model.';

-- Lightweight daily snapshot for avatar / header meter.
CREATE OR REPLACE FUNCTION public.ai_get_my_daily_token_usage(
  p_timezone text DEFAULT 'UTC'::text
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
  v_team_ids integer[];
  v_used bigint := 0;
  v_strictest jsonb := NULL;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  BEGIN
    PERFORM now() AT TIME ZONE v_timezone;
  EXCEPTION WHEN invalid_parameter_value THEN
    v_timezone := 'UTC';
  END;

  SELECT coalesce(array_agg(tu.team_id), ARRAY[]::integer[])
  INTO v_team_ids
  FROM public.teams_users tu
  WHERE tu.user_id = v_actor;

  SELECT coalesce(sum(e.total_tokens), 0)::bigint
  INTO v_used
  FROM public.ai_token_usage_events e
  WHERE e.user_id = v_actor
    AND (cardinality(v_team_ids) = 0 OR e.team_id = ANY (v_team_ids))
    AND e.status IN ('completed', 'failed')
    AND e.occurred_at >= (date_trunc('day', now() AT TIME ZONE v_timezone) AT TIME ZONE v_timezone)
    AND e.occurred_at < ((date_trunc('day', now() AT TIME ZONE v_timezone) + interval '1 day') AT TIME ZONE v_timezone);

  SELECT s.snapshot
  INTO v_strictest
  FROM (
    SELECT
      public.ai_token_scope_snapshot('user', v_actor, t.team_id, now()) AS snapshot
    FROM unnest(v_team_ids) AS t(team_id)
  ) s
  WHERE (s.snapshot ->> 'limit_tokens') IS NOT NULL
    AND nullif(s.snapshot ->> 'limit_tokens', '')::numeric > 0
  ORDER BY coalesce((s.snapshot ->> 'percent_used')::numeric, 0) DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'user_id', v_actor,
    'used_tokens', v_used,
    'limit_tokens', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'limit_tokens') END,
    'remaining_tokens', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'remaining_tokens') END,
    'percent_used', CASE
      WHEN v_strictest IS NULL THEN NULL
      ELSE (v_strictest -> 'percent_used')
    END,
    'warning_percent', CASE WHEN v_strictest IS NULL THEN 80 ELSE (v_strictest -> 'warning_percent') END,
    'warning', CASE WHEN v_strictest IS NULL THEN false ELSE coalesce((v_strictest ->> 'warning')::boolean, false) END,
    'maxed_out', CASE WHEN v_strictest IS NULL THEN false ELSE coalesce((v_strictest ->> 'maxed_out')::boolean, false) END,
    'timezone', coalesce(v_strictest ->> 'timezone', v_timezone),
    'resets_at', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'resets_at') END,
    'strictest_team_id', CASE WHEN v_strictest IS NULL THEN NULL ELSE (v_strictest -> 'team_id') END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_get_my_daily_token_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_get_my_daily_token_usage(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_get_my_daily_token_usage(text) TO service_role;

COMMENT ON FUNCTION public.ai_get_my_daily_token_usage(text) IS
  'Current user daily AI token usage across teams for header / avatar meters.';
