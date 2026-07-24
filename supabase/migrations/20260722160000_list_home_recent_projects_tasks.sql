-- Home sidebar recency: GREATEST(my last open, my last activity) for projects + tasks.
-- Used by the ChatGPT-style Sidebar feed with infinite scroll (limit/offset).

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
      max(tal.created_at) AS activity_at
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
      max(pal."timestamp") AS activity_at
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
        coalesce(ta.activity_at AT TIME ZONE 'UTC', '-infinity'::timestamptz),
        coalesce(pa.activity_at AT TIME ZONE 'UTC', '-infinity'::timestamptz)
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
      max(tal.created_at) AS activity_at
    FROM public.task_activity_logs tal
    WHERE tal.created_by = v_actor
      AND coalesce(tal.is_deleted, false) = false
      AND tal.task_id IS NOT NULL
    GROUP BY 1
  ),
  ranked AS (
    SELECT
      t.id,
      coalesce(nullif(btrim(t.title), ''), 'Untitled')::text AS title,
      greatest(
        coalesce(o.opened_at, '-infinity'::timestamptz),
        coalesce(a.activity_at AT TIME ZONE 'UTC', '-infinity'::timestamptz)
      ) AS recent_at
    FROM public.tasks t
    LEFT JOIN my_opens o ON o.task_id = t.id
    LEFT JOIN my_activity a ON a.task_id = t.id
    WHERE coalesce(t.is_deleted, false) = false
      AND (o.task_id IS NOT NULL OR a.task_id IS NOT NULL)
  )
  SELECT r.id, r.title, r.recent_at
  FROM ranked r
  WHERE r.recent_at > '-infinity'::timestamptz
  ORDER BY r.recent_at DESC, r.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_home_recent_projects(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_home_recent_projects(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_home_recent_tasks(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_home_recent_tasks(integer, integer) TO service_role;
