-- Allow creating outputs without a task/project/thread.
-- The creator can see their own unattached rows. Project/task can be attached later.

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
  'Create a workspace output. Task, project, and AI thread are optional and can be attached later.';

DROP POLICY IF EXISTS artifacts_authenticated_read ON public.artifacts;
CREATE POLICY artifacts_authenticated_read
  ON public.artifacts
  FOR SELECT
  TO authenticated
  USING (
    (
      task_id IS NULL
      AND project_id IS NULL
      AND ai_thread_id IS NULL
      AND created_by = public.current_user_id()
    )
    OR public.ai_can_access_artifact_scope_v1(task_id, project_id, ai_thread_id, false)
  );

CREATE TABLE IF NOT EXISTS public.user_design_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by integer NOT NULL DEFAULT public.current_user_id() REFERENCES public.users (id),
  title text NOT NULL DEFAULT 'Untitled template',
  notes text,
  assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_artifact_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_design_templates_created_by_created_at_idx
  ON public.user_design_templates (created_by, created_at DESC);

ALTER TABLE public.user_design_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_design_templates_own ON public.user_design_templates;
CREATE POLICY user_design_templates_own
  ON public.user_design_templates
  FOR ALL
  TO authenticated
  USING (created_by = public.current_user_id())
  WITH CHECK (created_by = public.current_user_id());

REVOKE ALL ON TABLE public.user_design_templates FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_design_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_design_templates TO service_role;
