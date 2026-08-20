-- Collab checkpoints store a partial snapshot ({ title, content_text, content_json })
-- without artifact identity. Viewing those versions made ai_get_artifact_v2 return
-- a snapshot that the client rejected ("returned no snapshot").

CREATE OR REPLACE FUNCTION public.ai_hydrate_artifact_snapshot_v1(
  p_base jsonb,
  p_overlay jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT coalesce(p_base, '{}'::jsonb) || coalesce((
    SELECT jsonb_object_agg(e.key, e.value)
    FROM jsonb_each(coalesce(p_overlay, '{}'::jsonb)) AS e
    WHERE e.value IS NOT NULL AND e.value <> 'null'::jsonb
  ), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.ai_get_artifact_v2(
  p_artifact_id uuid,
  p_version_number integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_artifact public.artifacts%rowtype;
  v_snapshot jsonb;
  v_base jsonb;
BEGIN
  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, false);
  v_base := public.ai_artifact_snapshot_v2(v_artifact.id);
  IF p_version_number IS NULL THEN
    v_snapshot := v_base;
  ELSE
    SELECT snapshot INTO v_snapshot
    FROM public.artifact_versions
    WHERE artifact_id = v_artifact.id AND version_number = p_version_number;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = '22023', message = 'artifact_version_not_found';
    END IF;
    v_snapshot := public.ai_hydrate_artifact_snapshot_v1(v_base, v_snapshot)
      || jsonb_build_object(
        'id', v_artifact.id,
        'current_version', p_version_number
      );
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', v_artifact.id,
    'version_number', coalesce(p_version_number, v_artifact.current_version),
    'snapshot', coalesce(v_snapshot, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_restore_artifact_version_v1(
  p_artifact_id uuid,
  p_version_number integer,
  p_change_summary text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_artifact public.artifacts%rowtype;
  v_snapshot jsonb;
  v_base jsonb;
BEGIN
  IF p_version_number IS NULL OR p_version_number < 1 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'valid_artifact_version_required';
  END IF;

  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);
  v_base := public.ai_artifact_snapshot_v2(v_artifact.id);

  SELECT v.snapshot
  INTO v_snapshot
  FROM public.artifact_versions v
  WHERE v.artifact_id = v_artifact.id
    AND v.version_number = p_version_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'artifact_version_not_found';
  END IF;

  v_snapshot := public.ai_hydrate_artifact_snapshot_v1(v_base, v_snapshot)
    || jsonb_build_object('id', v_artifact.id);

  RETURN public.ai_save_workspace_artifact_v2(
    p_artifact_id => v_artifact.id,
    p_expected_version => v_artifact.current_version,
    p_snapshot => v_snapshot,
    p_change_source => 'restore',
    p_changed_by => public.current_user_id(),
    p_ai_message_id => null,
    p_ai_thread_id => null,
    p_ai_run_id => null,
    p_change_summary => coalesce(
      nullif(trim(p_change_summary), ''),
      'Restored artifact version ' || p_version_number::text
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_checkpoint_v1(
  p_artifact_id uuid,
  p_seq bigint,
  p_snapshot jsonb,
  p_change_source text DEFAULT 'manual',
  p_summary text DEFAULT NULL,
  p_diff_stats jsonb DEFAULT '{}'::jsonb,
  p_state_vector_base64 text DEFAULT NULL,
  p_ai_run_id uuid DEFAULT NULL,
  p_ai_message_id uuid DEFAULT NULL,
  p_ai_thread_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_actor integer := public.current_user_id();
  v_artifact public.artifacts%rowtype;
  v_doc collab.artifact_ydocs%rowtype;
  v_next integer;
  v_version_id uuid;
  v_vector bytea;
  v_source text := left(trim(coalesce(nullif(p_change_source, ''), 'manual')), 100);
  v_stored jsonb;
BEGIN
  IF v_actor IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);
    IF NOT collab.is_enabled_for_artifact(p_artifact_id) THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'collab_disabled';
    END IF;
  ELSE
    SELECT * INTO v_artifact FROM public.artifacts WHERE id = p_artifact_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0002', message = 'artifact_not_found';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(87, hashtext(p_artifact_id::text));
  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));

  SELECT * INTO v_artifact FROM public.artifacts WHERE id = p_artifact_id FOR UPDATE;
  SELECT * INTO v_doc FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'ydoc_missing';
  END IF;

  IF v_doc.last_checkpoint_seq = coalesce(p_seq, 0) AND coalesce(p_seq, 0) > 0 THEN
    SELECT id, version_number INTO v_version_id, v_next
    FROM public.artifact_versions
    WHERE artifact_id = p_artifact_id AND yjs_seq = p_seq
    ORDER BY version_number DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'artifact_id', p_artifact_id,
      'version_id', v_version_id,
      'version_number', coalesce(v_next, v_artifact.current_version),
      'seq', p_seq
    );
  END IF;

  IF p_state_vector_base64 IS NOT NULL AND length(p_state_vector_base64) > 0 THEN
    v_vector := decode(p_state_vector_base64, 'base64');
  END IF;

  v_next := v_artifact.current_version + 1;
  v_stored := public.ai_hydrate_artifact_snapshot_v1(
    public.ai_artifact_snapshot_v2(p_artifact_id),
    coalesce(p_snapshot, '{}'::jsonb)
  ) || jsonb_build_object(
    'id', p_artifact_id,
    'current_version', v_next
  );
  INSERT INTO public.artifact_versions (
    artifact_id, version_number, snapshot, change_source, changed_by,
    ai_message_id, ai_thread_id, ai_run_id, change_summary, created_at,
    yjs_seq, yjs_state_vector, diff_stats
  ) VALUES (
    p_artifact_id, v_next, v_stored, v_source, v_actor,
    p_ai_message_id, p_ai_thread_id, p_ai_run_id,
    nullif(left(trim(coalesce(p_summary, '')), 1000), ''),
    now(), coalesce(p_seq, 0), v_vector, coalesce(p_diff_stats, '{}'::jsonb)
  )
  RETURNING id INTO v_version_id;

  UPDATE public.artifacts
  SET current_version = v_next,
      updated_at = now()
  WHERE id = p_artifact_id;

  UPDATE collab.artifact_ydocs
  SET last_checkpoint_seq = greatest(last_checkpoint_seq, coalesce(p_seq, 0)),
      updated_at = now()
  WHERE artifact_id = p_artifact_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'artifact_id', p_artifact_id,
    'version_id', v_version_id,
    'version_number', v_next,
    'seq', coalesce(p_seq, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ai_hydrate_artifact_snapshot_v1(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_hydrate_artifact_snapshot_v1(jsonb, jsonb) TO authenticated, service_role;
