-- Soft-deleted outputs stay recoverable: restore or permanently purge.

CREATE INDEX IF NOT EXISTS artifacts_deleted_updated_idx
  ON public.artifacts (updated_at DESC NULLS LAST, created_at DESC)
  WHERE lower(coalesce(status, '')) = 'archived';

CREATE OR REPLACE FUNCTION public.ai_delete_artifact_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_artifact public.artifacts%ROWTYPE;
  v_prev_status text;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);
  v_prev_status := nullif(trim(v_artifact.status), '');

  IF lower(coalesce(v_prev_status, '')) = 'archived' THEN
    RETURN jsonb_build_object('ok', true, 'artifact_id', v_artifact.id, 'already_archived', true);
  END IF;

  UPDATE public.artifacts
  SET
    status = 'archived',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'pre_archive_status', v_prev_status,
      'archived_at', to_jsonb(now())
    ),
    updated_at = now()
  WHERE id = v_artifact.id;

  RETURN jsonb_build_object('ok', true, 'artifact_id', v_artifact.id, 'status', 'archived');
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_delete_artifact_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_delete_artifact_v1(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_restore_artifact_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_artifact public.artifacts%ROWTYPE;
  v_prev_status text;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);

  IF lower(coalesce(v_artifact.status, '')) <> 'archived' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'artifact_id', v_artifact.id,
      'already_restored', true,
      'status', v_artifact.status
    );
  END IF;

  v_prev_status := nullif(trim(v_artifact.metadata->>'pre_archive_status'), '');
  IF v_prev_status IS NULL OR lower(v_prev_status) = 'archived' THEN
    v_prev_status := 'ready';
  END IF;

  UPDATE public.artifacts
  SET
    status = left(v_prev_status, 50),
    metadata = (coalesce(metadata, '{}'::jsonb) - 'pre_archive_status') - 'archived_at',
    updated_at = now()
  WHERE id = v_artifact.id
  RETURNING * INTO v_artifact;

  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', v_artifact.id,
    'status', v_artifact.status,
    'artifact', to_jsonb(v_artifact)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_restore_artifact_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_restore_artifact_v1(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ai_purge_artifact_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_artifact public.artifacts%ROWTYPE;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);

  IF lower(coalesce(v_artifact.status, '')) <> 'archived' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'artifact_not_deleted';
  END IF;

  DELETE FROM public.artifacts WHERE id = v_artifact.id;

  RETURN jsonb_build_object('ok', true, 'artifact_id', v_artifact.id, 'purged', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_purge_artifact_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_purge_artifact_v1(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_deleted_artifacts_v1(
  p_task_id integer DEFAULT NULL,
  p_project_id integer DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  archived_at timestamp with time zone,
  project_id integer,
  project_name text,
  task_id integer,
  ai_thread_id uuid
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
    coalesce(
      nullif(a.metadata->>'archived_at', '')::timestamptz,
      a.updated_at
    ) AS archived_at,
    a.project_id,
    p.name::text AS project_name,
    a.task_id,
    a.ai_thread_id
  FROM public.artifacts a
  LEFT JOIN public.projects p
    ON p.id = a.project_id
  WHERE lower(coalesce(a.status, '')) = 'archived'
    AND (p_task_id IS NULL OR a.task_id = p_task_id)
    AND (p_project_id IS NULL OR a.project_id = p_project_id)
    AND (p_thread_id IS NULL OR a.ai_thread_id = p_thread_id)
  ORDER BY coalesce(
    nullif(a.metadata->>'archived_at', '')::timestamptz,
    a.updated_at
  ) DESC NULLS LAST, a.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
$function$;

COMMENT ON FUNCTION public.list_deleted_artifacts_v1(integer, integer, uuid, integer, integer) IS
  'Recently deleted outputs. Relies on caller RLS.';

REVOKE ALL ON FUNCTION public.list_deleted_artifacts_v1(integer, integer, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_deleted_artifacts_v1(integer, integer, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_deleted_artifacts_v1(integer, integer, uuid, integer, integer) TO service_role;
