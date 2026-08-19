-- Applied remotely as 20260818210627 artifact_collaboration_ydoc_persist. Do not edit; this is the recorded history SQL.

CREATE OR REPLACE FUNCTION public.artifact_collab_persist_update_v1(
  p_artifact_id uuid,
  p_update_base64 text,
  p_idempotency_key text,
  p_client_id text DEFAULT NULL,
  p_origin text DEFAULT 'user',
  p_actor_type text DEFAULT 'user'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_actor integer := public.current_user_id();
  v_update bytea;
  v_size integer;
  v_seq bigint;
  v_id uuid;
  v_existing collab.artifact_ydoc_updates%rowtype;
BEGIN
  IF v_actor IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
    IF NOT collab.is_enabled_for_artifact(p_artifact_id) THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'collab_disabled';
    END IF;
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'idempotency_key_required';
  END IF;
  IF p_update_base64 IS NULL OR length(p_update_base64) = 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'update_required';
  END IF;

  v_update := decode(p_update_base64, 'base64');
  v_size := length(v_update);
  IF v_size > 1048576 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'ydoc_update_too_large';
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));

  INSERT INTO collab.artifact_ydocs (artifact_id, seed_status, updated_at)
  VALUES (p_artifact_id, 'ready', now())
  ON CONFLICT (artifact_id) DO NOTHING;

  SELECT * INTO v_existing
  FROM collab.artifact_ydoc_updates
  WHERE artifact_id = p_artifact_id AND idempotency_key = trim(p_idempotency_key);
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'id', v_existing.id,
      'seq', v_existing.seq,
      'artifact_id', p_artifact_id
    );
  END IF;

  SELECT coalesce(max(seq), 0) + 1
  INTO v_seq
  FROM collab.artifact_ydoc_updates
  WHERE artifact_id = p_artifact_id;

  INSERT INTO collab.artifact_ydoc_updates (
    artifact_id, seq, update_bin, byte_size, actor_type, actor_user_id,
    client_id, origin, idempotency_key
  ) VALUES (
    p_artifact_id, v_seq, v_update, v_size,
    left(trim(coalesce(nullif(p_actor_type, ''), 'user')), 20),
    v_actor,
    nullif(left(trim(coalesce(p_client_id, '')), 120), ''),
    nullif(left(trim(coalesce(p_origin, '')), 80), ''),
    trim(p_idempotency_key)
  )
  RETURNING id INTO v_id;

  UPDATE collab.artifact_ydocs
  SET update_count = update_count + 1,
      updated_at = now()
  WHERE artifact_id = p_artifact_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'id', v_id,
    'seq', v_seq,
    'artifact_id', p_artifact_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_load_document_v1(
  p_artifact_id uuid,
  p_after_seq bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_doc collab.artifact_ydocs%rowtype;
  v_updates jsonb;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, false);
  END IF;

  SELECT * INTO v_doc FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'missing',
      'artifact_id', p_artifact_id,
      'last_included_seq', 0,
      'updates', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'seq', u.seq,
    'update_base64', encode(u.update_bin, 'base64'),
    'idempotency_key', u.idempotency_key,
    'client_id', u.client_id,
    'created_at', u.created_at
  ) ORDER BY u.seq), '[]'::jsonb)
  INTO v_updates
  FROM collab.artifact_ydoc_updates u
  WHERE u.artifact_id = p_artifact_id
    AND u.seq > greatest(coalesce(p_after_seq, 0), v_doc.last_included_seq);

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_doc.seed_status,
    'artifact_id', p_artifact_id,
    'snapshot_base64', CASE WHEN v_doc.ydoc_snapshot IS NULL THEN NULL ELSE encode(v_doc.ydoc_snapshot, 'base64') END,
    'state_vector_base64', CASE WHEN v_doc.state_vector IS NULL THEN NULL ELSE encode(v_doc.state_vector, 'base64') END,
    'last_included_seq', v_doc.last_included_seq,
    'schema_version', v_doc.schema_version,
    'seed_error', v_doc.seed_error,
    'updates', v_updates
  );
END;
$$;
