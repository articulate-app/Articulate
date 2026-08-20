-- Create a blank output from the Outputs directory (task, project, or AI thread).

CREATE OR REPLACE FUNCTION public.ai_create_workspace_artifact_v1(
  p_title text DEFAULT 'Untitled',
  p_artifact_type text DEFAULT 'document',
  p_task_id integer DEFAULT NULL,
  p_project_id integer DEFAULT NULL,
  p_ai_thread_id uuid DEFAULT NULL,
  p_status text DEFAULT 'draft',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  v_actor integer := public.current_user_id();
  v_artifact public.artifacts%ROWTYPE;
  v_project_id integer := p_project_id;
  v_task_project_id integer;
BEGIN
  IF v_actor IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  IF p_task_id IS NULL AND p_project_id IS NULL AND p_ai_thread_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'artifact_scope_required';
  END IF;

  IF nullif(trim(coalesce(p_artifact_type, '')), '') IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'artifact_type_required';
  END IF;

  IF p_task_id IS NOT NULL THEN
    PERFORM public.ai_validate_task_scope(
      p_task_id => p_task_id,
      p_channel_id => NULL,
      p_require_write => true
    );
    SELECT t.project_id_int
      INTO v_task_project_id
    FROM public.tasks t
    WHERE t.id = p_task_id
      AND coalesce(t.is_deleted, false) = false;
    IF v_project_id IS NULL THEN
      v_project_id := v_task_project_id;
    END IF;
  END IF;

  IF v_project_id IS NOT NULL AND NOT public.can_edit_project(v_project_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'artifact_project_forbidden';
  END IF;

  IF p_ai_thread_id IS NOT NULL AND NOT public.ai_can_post_in_thread(p_ai_thread_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'artifact_thread_write_forbidden';
  END IF;

  INSERT INTO public.artifacts (
    task_id,
    project_id,
    ai_thread_id,
    artifact_type,
    title,
    status,
    content_text,
    content_json,
    asset_data,
    current_version,
    metadata,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_task_id,
    v_project_id,
    p_ai_thread_id,
    left(trim(p_artifact_type), 100),
    left(trim(coalesce(nullif(trim(p_title), ''), 'Untitled')), 240),
    left(trim(coalesce(nullif(p_status, ''), 'draft')), 50),
    NULL,
    NULL,
    '{}'::jsonb,
    0,
    coalesce(p_metadata, '{}'::jsonb),
    v_actor,
    now(),
    now()
  )
  RETURNING * INTO v_artifact;

  RETURN jsonb_build_object(
    'ok', true,
    'artifact', public.ai_task_artifact_snapshot_v1(v_artifact.id)
  );
END;
$function$;

COMMENT ON FUNCTION public.ai_create_workspace_artifact_v1(text, text, integer, integer, uuid, text, jsonb) IS
  'Create a blank workspace output scoped to a task, project, or AI thread.';

REVOKE ALL ON FUNCTION public.ai_create_workspace_artifact_v1(text, text, integer, integer, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_create_workspace_artifact_v1(text, text, integer, integer, uuid, text, jsonb) TO authenticated, service_role;
