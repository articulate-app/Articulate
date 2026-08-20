-- Projects directory: lean project list.
-- Do not reuse search_global_discovery_sections_v2 here — it times out at browse limits.

CREATE INDEX IF NOT EXISTS projects_directory_updated_idx
  ON public.projects (updated_at DESC NULLS LAST, name ASC)
  WHERE coalesce(is_deleted, false) = false
    AND coalesce(active, true) = true;

CREATE OR REPLACE FUNCTION public.list_project_directory_v1(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id integer,
  name text,
  logo text,
  color text,
  created_by integer,
  created_at timestamp without time zone,
  updated_at timestamp without time zone
)
LANGUAGE sql
STABLE
SET search_path TO pg_catalog, public
AS $function$
  SELECT
    p.id,
    p.name,
    p.logo::text,
    p.color,
    p.created_by,
    p.created_at,
    p.updated_at
  FROM public.projects p
  WHERE coalesce(p.is_deleted, false) = false
    AND coalesce(p.active, true) = true
  ORDER BY p.updated_at DESC NULLS LAST, p.name ASC
  LIMIT greatest(1, least(coalesce(p_limit, 25), 500))
  OFFSET greatest(0, coalesce(p_offset, 0));
$function$;

COMMENT ON FUNCTION public.list_project_directory_v1(integer, integer) IS
  'Projects directory page: visible active projects. Relies on caller RLS.';

REVOKE ALL ON FUNCTION public.list_project_directory_v1(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_project_directory_v1(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_project_directory_v1(integer, integer) TO service_role;
