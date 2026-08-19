-- Applied remotely as 20260819094040 artifact_collaboration_flush_rpcs. Do not edit; this is the recorded history SQL.

DROP FUNCTION IF EXISTS public.artifact_collab_complete_seed_v1(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.artifact_collab_complete_seed_v1(
  p_artifact_id uuid,
  p_claim_token uuid,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL,
  p_seeded_from text DEFAULT 'content_json',
  p_schema_version integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_snapshot bytea;
  v_vector bytea;
  v_size integer;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));
  v_snapshot := decode(p_snapshot_base64, 'base64');
  v_size := length(v_snapshot);
  IF v_size > 5242880 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'ydoc_too_large';
  END IF;
  IF p_state_vector_base64 IS NOT NULL AND length(p_state_vector_base64) > 0 THEN
    v_vector := decode(p_state_vector_base64, 'base64');
  END IF;

  UPDATE collab.artifact_ydocs
  SET ydoc_snapshot = v_snapshot,
      state_vector = v_vector,
      seed_status = 'ready',
      seeded_from = left(trim(coalesce(p_seeded_from, 'content_json')), 40),
      schema_version = greatest(coalesce(p_schema_version, 1), 1),
      seed_error = NULL,
      claim_token = NULL,
      seeded_at = now(),
      last_compacted_at = now(),
      byte_size = v_size,
      updated_at = now()
  WHERE artifact_id = p_artifact_id
    AND claim_token = p_claim_token
    AND seed_status = 'seeding';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'seed_claim_mismatch');
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', p_artifact_id,
    'byte_size', v_size,
    'schema_version', greatest(coalesce(p_schema_version, 1), 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_project_v1(
  p_artifact_id uuid,
  p_seq bigint,
  p_content_json jsonb,
  p_content_text text,
  p_state_vector_base64 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_doc collab.artifact_ydocs%rowtype;
  v_vector bytea;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
    IF NOT collab.is_enabled_for_artifact(p_artifact_id) THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'collab_disabled';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));
  SELECT * INTO v_doc FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'ydoc_missing';
  END IF;
  IF v_doc.projected_seq > coalesce(p_seq, 0) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'stale', true,
      'projected_seq', v_doc.projected_seq,
      'artifact_id', p_artifact_id
    );
  END IF;

  IF p_state_vector_base64 IS NOT NULL AND length(p_state_vector_base64) > 0 THEN
    v_vector := decode(p_state_vector_base64, 'base64');
  END IF;

  UPDATE public.artifacts
  SET content_json = coalesce(p_content_json, content_json),
      content_text = coalesce(p_content_text, content_text),
      updated_at = now()
  WHERE id = p_artifact_id;

  UPDATE collab.artifact_ydocs
  SET projected_seq = coalesce(p_seq, projected_seq),
      projected_state_vector = coalesce(v_vector, projected_state_vector),
      projected_at = now(),
      projection_error = NULL,
      updated_at = now()
  WHERE artifact_id = p_artifact_id;

  RETURN jsonb_build_object(
    'ok', true,
    'stale', false,
    'projected_seq', coalesce(p_seq, v_doc.projected_seq),
    'artifact_id', p_artifact_id
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
  INSERT INTO public.artifact_versions (
    artifact_id, version_number, snapshot, change_source, changed_by,
    ai_message_id, ai_thread_id, ai_run_id, change_summary, created_at,
    yjs_seq, yjs_state_vector, diff_stats
  ) VALUES (
    p_artifact_id, v_next, coalesce(p_snapshot, '{}'::jsonb), v_source, v_actor,
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
