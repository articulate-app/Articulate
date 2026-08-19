-- Applied remotely as 20260818210613 artifact_collaboration_ydoc_rpcs. Do not edit; this is the recorded history SQL.
CREATE OR REPLACE FUNCTION collab.resolve_editor_kind(
  p_artifact public.artifacts
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind', '')))
      IN ('html_email', 'media', 'code', 'image', 'video', 'audio')
      THEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind')))
    WHEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format', '')))
      IN ('html_email', 'html', 'email', 'code', 'image', 'video', 'audio')
      THEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format')))
    WHEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind', '')))
      IN ('rich_text', 'tiptap', 'tiptap_json')
      THEN 'rich_text'
    WHEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format', '')))
      IN ('tiptap_json', 'rich_text')
      THEN 'rich_text'
    ELSE 'rich_text'
  END;
$$;

CREATE OR REPLACE FUNCTION collab.is_rich_text_editor_kind(p_editor_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(p_editor_kind, ''))) IN ('rich_text', 'tiptap', 'tiptap_json');
$$;

CREATE OR REPLACE FUNCTION collab.is_enabled_for_artifact(p_artifact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
DECLARE
  v_artifact public.artifacts%rowtype;
  v_flag boolean;
BEGIN
  SELECT * INTO v_artifact FROM public.artifacts WHERE id = p_artifact_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF NOT collab.is_rich_text_editor_kind(collab.resolve_editor_kind(v_artifact)) THEN
    RETURN false;
  END IF;

  SELECT enabled INTO v_flag
  FROM collab.feature_flags
  WHERE scope_type = 'artifact' AND scope_key = p_artifact_id::text;
  IF FOUND THEN
    RETURN v_flag;
  END IF;

  IF v_artifact.project_id IS NOT NULL THEN
    SELECT enabled INTO v_flag
    FROM collab.feature_flags
    WHERE scope_type = 'project' AND scope_key = v_artifact.project_id::text;
    IF FOUND THEN
      RETURN v_flag;
    END IF;
  END IF;

  SELECT enabled INTO v_flag
  FROM collab.feature_flags
  WHERE scope_type = 'global' AND scope_key = '';
  RETURN coalesce(v_flag, false);
END;
$$;

CREATE OR REPLACE FUNCTION collab.try_authorize_artifact(
  p_artifact_id uuid,
  p_require_write boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  PERFORM public.ai_authorize_artifact_v2(p_artifact_id, p_require_write);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_topic_access_v1(
  p_topic text,
  p_require_write boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_artifact_id uuid;
BEGIN
  IF public.current_user_id() IS NULL THEN
    RETURN false;
  END IF;
  IF p_topic IS NULL OR p_topic !~* '^artifact:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_artifact_id := substring(p_topic from 10)::uuid;
  IF NOT collab.is_enabled_for_artifact(v_artifact_id) THEN
    RETURN false;
  END IF;
  RETURN collab.try_authorize_artifact(v_artifact_id, p_require_write);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_authorize_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_actor integer := public.current_user_id();
  v_artifact public.artifacts%rowtype;
  v_can_read boolean := false;
  v_can_write boolean := false;
  v_user public.users%rowtype;
  v_editor_kind text;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'user_jwt_required';
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  BEGIN
    v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, false);
    v_can_read := true;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'code', SQLERRM, 'artifact_id', p_artifact_id);
  END;

  BEGIN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
    v_can_write := true;
  EXCEPTION
    WHEN OTHERS THEN
      v_can_write := false;
  END;

  SELECT * INTO v_user FROM public.users WHERE id = v_actor;
  v_editor_kind := collab.resolve_editor_kind(v_artifact);

  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', v_artifact.id,
    'can_read', v_can_read,
    'can_write', v_can_write,
    'collab_enabled', collab.is_enabled_for_artifact(v_artifact.id),
    'editor_kind', v_editor_kind,
    'room', 'artifact:' || v_artifact.id::text,
    'user_id', v_actor,
    'full_name', v_user.full_name,
    'photo', v_user.photo,
    'project_id', v_artifact.project_id,
    'task_id', v_artifact.task_id,
    'current_version', v_artifact.current_version
  );
END;
$$;
