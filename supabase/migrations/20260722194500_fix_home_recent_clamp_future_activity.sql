-- Imported task_activity_logs often carry historical/future created_at values (e.g. 2027)
-- while synced_at is the real import time. Those future stamps were dominating
-- list_home_recent_* and pinning stale projects/tasks above real recent work.

CREATE OR REPLACE FUNCTION public.home_recent_clamp_naive_ts(
  p_created timestamp without time zone,
  p_synced timestamp without time zone DEFAULT NULL
)
RETURNS timestamp with time zone
LANGUAGE sql
STABLE
AS $function$
  SELECT CASE
    WHEN p_created IS NULL THEN NULL
    -- Treat naive timestamps as UTC wall-clock.
    WHEN p_created <= (timezone('utc', now()) + interval '1 day')
      THEN p_created AT TIME ZONE 'UTC'
    -- Future created_at from bad imports: fall back to synced_at when present.
    WHEN p_synced IS NOT NULL
      AND p_synced <= (timezone('utc', now()) + interval '1 day')
      THEN p_synced AT TIME ZONE 'UTC'
    ELSE NULL
  END
$function$;

CREATE OR REPLACE FUNCTION public.list_home_recent_projects(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id integer,
  title text,
  recent_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor integer := current_user_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  RETURN QUERY
  WITH my_opens AS (
    SELECT
      nullif(h.entity_id, '')::integer AS project_id,
      max(h.opened_at) AS opened_at
    FROM public.global_object_open_history h
    WHERE h.opened_by = v_actor
      AND h.entity_type = 'project'
      AND h.entity_id ~ '^[0-9]+$'
    GROUP BY 1
  ),
  my_task_activity AS (
    SELECT
      t.project_id_int AS project_id,
      max(public.home_recent_clamp_naive_ts(tal.created_at, tal.synced_at)) AS activity_at
    FROM public.task_activity_logs tal
    JOIN public.tasks t
      ON t.id = tal.task_id
     AND coalesce(t.is_deleted, false) = false
    WHERE tal.created_by = v_actor
      AND coalesce(tal.is_deleted, false) = false
      AND t.project_id_int IS NOT NULL
    GROUP BY 1
  ),
  my_project_activity AS (
    SELECT
      pal.project_id,
      max(public.home_recent_clamp_naive_ts(pal."timestamp", NULL)) AS activity_at
    FROM public.project_activity_logs pal
    WHERE pal.user_id = v_actor
      AND coalesce(pal.is_deleted, false) = false
      AND pal.project_id IS NOT NULL
    GROUP BY 1
  ),
  ranked AS (
    SELECT
      p.id,
      p.name::text AS title,
      greatest(
        coalesce(o.opened_at, '-infinity'::timestamptz),
        coalesce(ta.activity_at, '-infinity'::timestamptz),
        coalesce(pa.activity_at, '-infinity'::timestamptz)
      ) AS recent_at
    FROM public.projects p
    LEFT JOIN my_opens o ON o.project_id = p.id
    LEFT JOIN my_task_activity ta ON ta.project_id = p.id
    LEFT JOIN my_project_activity pa ON pa.project_id = p.id
    WHERE coalesce(p.is_deleted, false) = false
      AND coalesce(p.active, true) = true
      AND (
        o.project_id IS NOT NULL
        OR ta.project_id IS NOT NULL
        OR pa.project_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.project_watchers pw
          WHERE pw.project_id = p.id
            AND pw.user_id = v_actor
            AND coalesce(pw.is_deleted, false) = false
        )
      )
  )
  SELECT r.id, r.title, r.recent_at
  FROM ranked r
  WHERE r.recent_at > '-infinity'::timestamptz
  ORDER BY r.recent_at DESC, r.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_home_recent_tasks(
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id integer,
  title text,
  recent_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor integer := current_user_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  RETURN QUERY
  WITH my_opens AS (
    SELECT
      nullif(h.entity_id, '')::integer AS task_id,
      max(h.opened_at) AS opened_at
    FROM public.global_object_open_history h
    WHERE h.opened_by = v_actor
      AND h.entity_type = 'task'
      AND h.entity_id ~ '^[0-9]+$'
    GROUP BY 1
  ),
  my_activity AS (
    SELECT
      tal.task_id,
      max(public.home_recent_clamp_naive_ts(tal.created_at, tal.synced_at)) AS activity_at
    FROM public.task_activity_logs tal
    WHERE tal.created_by = v_actor
      AND coalesce(tal.is_deleted, false) = false
      AND tal.task_id IS NOT NULL
    GROUP BY 1
  ),
  my_channel_versions AS (
    SELECT v.task_id, max(v.created_at) AS activity_at
    FROM public.task_channel_content_versions v
    WHERE v.changed_by = v_actor
      AND v.task_id IS NOT NULL
    GROUP BY 1
  ),
  my_output_versions AS (
    SELECT v.task_id, max(v.created_at) AS activity_at
    FROM public.task_component_output_versions v
    WHERE v.task_id IS NOT NULL
      AND (
        v.changed_by = v_actor
        OR EXISTS (SELECT 1 FROM my_channel_versions cv WHERE cv.task_id = v.task_id)
        OR EXISTS (SELECT 1 FROM my_opens o WHERE o.task_id = v.task_id)
        OR EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.id = v.task_id
            AND t.assigned_to_id = v_actor
            AND coalesce(t.is_deleted, false) = false
        )
      )
    GROUP BY 1
  ),
  my_output_updates AS (
    SELECT tco.task_id, max(tco.updated_at) AS activity_at
    FROM public.task_component_outputs tco
    WHERE tco.task_id IS NOT NULL
      AND tco.updated_at IS NOT NULL
      AND tco.updated_at <= (now() + interval '1 day')
      AND (
        EXISTS (SELECT 1 FROM my_channel_versions cv WHERE cv.task_id = tco.task_id)
        OR EXISTS (SELECT 1 FROM my_opens o WHERE o.task_id = tco.task_id)
        OR EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.id = tco.task_id
            AND t.assigned_to_id = v_actor
            AND coalesce(t.is_deleted, false) = false
        )
      )
    GROUP BY 1
  ),
  my_briefing_edits AS (
    SELECT b.task_id, max(b.updated_at) AS activity_at
    FROM public.task_channel_briefings b
    WHERE b.updated_at IS NOT NULL
      AND b.task_id IS NOT NULL
      AND b.updated_at <= (now() + interval '1 day')
      AND (
        EXISTS (SELECT 1 FROM my_opens o WHERE o.task_id = b.task_id)
        OR EXISTS (SELECT 1 FROM my_channel_versions cv WHERE cv.task_id = b.task_id)
        OR EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.id = b.task_id
            AND t.assigned_to_id = v_actor
            AND coalesce(t.is_deleted, false) = false
        )
      )
    GROUP BY 1
  ),
  ranked AS (
    SELECT
      t.id,
      coalesce(nullif(btrim(t.title), ''), 'Untitled')::text AS title,
      greatest(
        coalesce(o.opened_at, '-infinity'::timestamptz),
        coalesce(a.activity_at, '-infinity'::timestamptz),
        coalesce(ov.activity_at, '-infinity'::timestamptz),
        coalesce(ou.activity_at, '-infinity'::timestamptz),
        coalesce(cv.activity_at, '-infinity'::timestamptz),
        coalesce(be.activity_at, '-infinity'::timestamptz)
      ) AS recent_at
    FROM public.tasks t
    LEFT JOIN my_opens o ON o.task_id = t.id
    LEFT JOIN my_activity a ON a.task_id = t.id
    LEFT JOIN my_output_versions ov ON ov.task_id = t.id
    LEFT JOIN my_output_updates ou ON ou.task_id = t.id
    LEFT JOIN my_channel_versions cv ON cv.task_id = t.id
    LEFT JOIN my_briefing_edits be ON be.task_id = t.id
    WHERE coalesce(t.is_deleted, false) = false
      AND (
        o.task_id IS NOT NULL
        OR a.task_id IS NOT NULL
        OR ov.task_id IS NOT NULL
        OR ou.task_id IS NOT NULL
        OR cv.task_id IS NOT NULL
        OR be.task_id IS NOT NULL
      )
  )
  SELECT r.id, r.title, r.recent_at
  FROM ranked r
  WHERE r.recent_at > '-infinity'::timestamptz
  ORDER BY r.recent_at DESC, r.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$function$;

COMMENT ON FUNCTION public.home_recent_clamp_naive_ts(timestamp without time zone, timestamp without time zone) IS
  'Clamp naive activity timestamps for home sidebar recency; ignore imported future created_at.';

COMMENT ON FUNCTION public.list_home_recent_tasks(integer, integer) IS
  'Home sidebar tasks by GREATEST(open, clamped activity, output/channel versions, briefing edits).';

COMMENT ON FUNCTION public.list_home_recent_projects(integer, integer) IS
  'Home sidebar projects by GREATEST(open, clamped task/project activity).';
