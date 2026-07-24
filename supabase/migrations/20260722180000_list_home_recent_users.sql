-- Home sidebar: recently opened users (by open history).
CREATE OR REPLACE FUNCTION public.list_home_recent_users(
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
      nullif(h.entity_id, '')::integer AS user_id,
      max(h.opened_at) AS opened_at
    FROM public.global_object_open_history h
    WHERE h.opened_by = v_actor
      AND h.entity_type = 'user'
      AND h.entity_id ~ '^[0-9]+$'
    GROUP BY 1
  ),
  ranked AS (
    SELECT
      u.id,
      coalesce(nullif(trim(u.full_name), ''), 'Untitled')::text AS title,
      o.opened_at AS recent_at
    FROM my_opens o
    JOIN public.users u ON u.id = o.user_id
    WHERE coalesce(u.is_deleted, false) = false
      AND u.id <> v_actor
  )
  SELECT r.id, r.title, r.recent_at
  FROM ranked r
  WHERE r.recent_at IS NOT NULL
  ORDER BY r.recent_at DESC, r.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_home_recent_users(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_home_recent_users(integer, integer) TO service_role;

COMMENT ON FUNCTION public.list_home_recent_users(integer, integer) IS
  'Home sidebar: users recently opened by the current user, ordered by opened_at desc.';
