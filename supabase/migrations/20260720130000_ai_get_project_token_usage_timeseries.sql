-- Canonical project AI token usage timeseries for the Project page AI usage tab.
-- Reads ai_token_usage_events only (never assistant-message token fields).
-- Matches the deployed RPC signature used by the frontend.

CREATE OR REPLACE FUNCTION public.ai_get_project_token_usage_timeseries(
  p_project_id integer,
  p_date_from date DEFAULT (CURRENT_DATE - 29),
  p_date_to date DEFAULT CURRENT_DATE,
  p_timezone text DEFAULT 'UTC'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor integer := public.current_user_id();
  v_timezone text := coalesce(nullif(trim(p_timezone), ''), 'UTC');
  v_date_from date := coalesce(p_date_from, current_date - 29);
  v_date_to date := coalesce(p_date_to, current_date);
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_summary jsonb;
  v_series jsonb;
  v_by_model jsonb;
  v_by_stage jsonb;
  v_by_user jsonb;
BEGIN
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'project_id_required';
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF v_actor IS NULL THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
    END IF;
    IF NOT public.can_edit_project(p_project_id) THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'project_read_forbidden';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_timezone';
  END IF;

  IF v_date_to < v_date_from OR (v_date_to - v_date_from) > 366 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_date_range';
  END IF;

  v_from_ts := v_date_from::timestamp AT TIME ZONE v_timezone;
  v_to_ts := (v_date_to + 1)::timestamp AT TIME ZONE v_timezone;

  WITH scoped AS (
    SELECT e.*
    FROM public.ai_token_usage_events e
    WHERE e.project_id = p_project_id
      AND e.occurred_at >= v_from_ts
      AND e.occurred_at < v_to_ts
      AND e.status IN ('completed', 'failed')
  )
  SELECT jsonb_build_object(
    'accounted_tokens', coalesce(sum(accounted_tokens), 0),
    'prompt_tokens', coalesce(sum(prompt_tokens), 0),
    'completion_tokens', coalesce(sum(completion_tokens), 0),
    'cached_prompt_tokens', coalesce(sum(cached_prompt_tokens), 0),
    'estimated_tokens', coalesce(sum(accounted_tokens) FILTER (WHERE is_estimate), 0),
    'call_count', count(*),
    'estimated_call_count', count(*) FILTER (WHERE is_estimate),
    'user_count', count(DISTINCT user_id)
  )
  INTO v_summary
  FROM scoped;

  WITH days AS (
    SELECT generate_series(v_date_from, v_date_to, interval '1 day')::date AS bucket_date
  ), scoped AS (
    SELECT
      (e.occurred_at AT TIME ZONE v_timezone)::date AS bucket_date,
      e.*
    FROM public.ai_token_usage_events e
    WHERE e.project_id = p_project_id
      AND e.occurred_at >= v_from_ts
      AND e.occurred_at < v_to_ts
      AND e.status IN ('completed', 'failed')
  ), agg AS (
    SELECT
      bucket_date,
      coalesce(sum(accounted_tokens), 0) AS accounted_tokens,
      coalesce(sum(prompt_tokens), 0) AS prompt_tokens,
      coalesce(sum(completion_tokens), 0) AS completion_tokens,
      coalesce(sum(cached_prompt_tokens), 0) AS cached_prompt_tokens,
      coalesce(sum(accounted_tokens) FILTER (WHERE is_estimate), 0) AS estimated_tokens,
      count(*) AS call_count
    FROM scoped
    GROUP BY bucket_date
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'bucket_start', d.bucket_date,
    'accounted_tokens', coalesce(a.accounted_tokens, 0),
    'prompt_tokens', coalesce(a.prompt_tokens, 0),
    'completion_tokens', coalesce(a.completion_tokens, 0),
    'cached_prompt_tokens', coalesce(a.cached_prompt_tokens, 0),
    'estimated_tokens', coalesce(a.estimated_tokens, 0),
    'call_count', coalesce(a.call_count, 0)
  ) ORDER BY d.bucket_date), '[]'::jsonb)
  INTO v_series
  FROM days d
  LEFT JOIN agg a USING (bucket_date);

  WITH agg AS (
    SELECT provider, model, sum(accounted_tokens) AS accounted_tokens, count(*) AS call_count
    FROM public.ai_token_usage_events
    WHERE project_id = p_project_id
      AND occurred_at >= v_from_ts AND occurred_at < v_to_ts
      AND status IN ('completed', 'failed')
    GROUP BY provider, model
    ORDER BY accounted_tokens DESC
  )
  SELECT coalesce(jsonb_agg(to_jsonb(agg)), '[]'::jsonb) INTO v_by_model FROM agg;

  WITH agg AS (
    SELECT stage, sum(accounted_tokens) AS accounted_tokens, count(*) AS call_count
    FROM public.ai_token_usage_events
    WHERE project_id = p_project_id
      AND occurred_at >= v_from_ts AND occurred_at < v_to_ts
      AND status IN ('completed', 'failed')
    GROUP BY stage
    ORDER BY accounted_tokens DESC
  )
  SELECT coalesce(jsonb_agg(to_jsonb(agg)), '[]'::jsonb) INTO v_by_stage FROM agg;

  WITH agg AS (
    SELECT user_id, sum(accounted_tokens) AS accounted_tokens, count(*) AS call_count
    FROM public.ai_token_usage_events
    WHERE project_id = p_project_id
      AND occurred_at >= v_from_ts AND occurred_at < v_to_ts
      AND status IN ('completed', 'failed')
    GROUP BY user_id
    ORDER BY accounted_tokens DESC
  )
  SELECT coalesce(jsonb_agg(to_jsonb(agg)), '[]'::jsonb) INTO v_by_user FROM agg;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'timezone', v_timezone,
    'date_from', v_date_from,
    'date_to', v_date_to,
    'summary', v_summary,
    'series', v_series,
    'by_model', v_by_model,
    'by_stage', v_by_stage,
    'by_user', v_by_user
  );
END;
$function$;
