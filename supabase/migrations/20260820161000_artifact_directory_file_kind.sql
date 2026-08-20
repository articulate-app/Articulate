-- Outputs directory: enough fields to show Word / PDF / image icons like templates.

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
  task_id integer,
  artifact_type text,
  import_kind text,
  import_file_name text
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
    a.task_id,
    a.artifact_type,
    nullif(trim(a.metadata->>'import_kind'), '') AS import_kind,
    nullif(trim(a.metadata->>'import_file_name'), '') AS import_file_name
  FROM public.artifacts a
  LEFT JOIN public.projects p
    ON p.id = a.project_id
  WHERE lower(coalesce(a.status, '')) <> 'archived'
  ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
  OFFSET greatest(0, coalesce(p_offset, 0));
$function$;
