-- Outputs directory: lean artifact list with project name.
-- Do not reuse search_global_discovery_sections_v2 here — it times out at browse limits.

CREATE INDEX IF NOT EXISTS artifacts_directory_updated_idx
  ON public.artifacts (updated_at DESC NULLS LAST, created_at DESC)
  WHERE lower(coalesce(status, '')) <> 'archived';

CREATE OR REPLACE FUNCTION public.list_artifact_directory_v1(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  project_id integer,
  project_name text,
  task_id integer
)
LANGUAGE sql
STABLE
SET search_path TO pg_catalog, public
AS $function$
  SELECT
    a.id,
    a.title,
    a.created_at,
    a.updated_at,
    a.project_id,
    p.name::text AS project_name,
    a.task_id
  FROM public.artifacts a
  LEFT JOIN public.projects p
    ON p.id = a.project_id
  WHERE lower(coalesce(a.status, '')) <> 'archived'
  ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
  OFFSET greatest(0, coalesce(p_offset, 0));
$function$;

COMMENT ON FUNCTION public.list_artifact_directory_v1(integer, integer) IS
  'Outputs directory page: visible artifacts with project name. Relies on caller RLS.';

REVOKE ALL ON FUNCTION public.list_artifact_directory_v1(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_artifact_directory_v1(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_artifact_directory_v1(integer, integer) TO service_role;
