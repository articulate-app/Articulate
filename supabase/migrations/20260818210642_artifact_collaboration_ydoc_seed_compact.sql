-- Applied remotely as 20260818210642 artifact_collaboration_ydoc_seed_compact. Do not edit; this is the recorded history SQL.

CREATE OR REPLACE FUNCTION public.artifact_collab_claim_seed_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_row collab.artifact_ydocs%rowtype;
  v_claim uuid := gen_random_uuid();
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));
  SELECT * INTO v_row FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;

  IF FOUND AND v_row.seed_status = 'ready' AND v_row.ydoc_snapshot IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ready',
      'artifact_id', p_artifact_id,
      'snapshot_base64', encode(v_row.ydoc_snapshot, 'base64'),
      'last_included_seq', v_row.last_included_seq
    );
  END IF;
  IF FOUND AND v_row.seed_status = 'failed' THEN
    RETURN jsonb_build_object('status', 'failed', 'artifact_id', p_artifact_id, 'seed_error', v_row.seed_error);
  END IF;
  IF FOUND AND v_row.seed_status = 'seeding'
     AND v_row.seeding_started_at IS NOT NULL
     AND v_row.seeding_started_at > now() - interval '30 seconds' THEN
    RETURN jsonb_build_object('status', 'seeding', 'artifact_id', p_artifact_id);
  END IF;

  IF FOUND THEN
    UPDATE collab.artifact_ydocs
    SET seed_status = 'seeding', claim_token = v_claim, seeding_started_at = now(), seed_error = NULL, updated_at = now()
    WHERE artifact_id = p_artifact_id;
  ELSE
    INSERT INTO collab.artifact_ydocs (artifact_id, seed_status, claim_token, seeding_started_at, updated_at)
    VALUES (p_artifact_id, 'seeding', v_claim, now(), now());
  END IF;

  RETURN jsonb_build_object('status', 'claimed', 'artifact_id', p_artifact_id, 'claim_token', v_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_complete_seed_v1(
  p_artifact_id uuid,
  p_claim_token uuid,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL,
  p_seeded_from text DEFAULT 'content_json'
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
  RETURN jsonb_build_object('ok', true, 'artifact_id', p_artifact_id, 'byte_size', v_size);
END;
$$;

CREATE OR REPLACE FUNCTION collab.compact_ydoc(
  p_artifact_id uuid,
  p_closed_seq bigint,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
DECLARE
  v_snapshot bytea;
  v_vector bytea;
  v_size integer;
  v_deleted integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
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
      last_included_seq = greatest(last_included_seq, p_closed_seq),
      last_compacted_at = now(),
      byte_size = v_size,
      updated_at = now()
  WHERE artifact_id = p_artifact_id
    AND seed_status = 'ready';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ydoc_not_ready');
  END IF;

  DELETE FROM collab.artifact_ydoc_updates
  WHERE artifact_id = p_artifact_id
    AND seq <= p_closed_seq;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE collab.artifact_ydocs
  SET update_count = (
    SELECT count(*) FROM collab.artifact_ydoc_updates WHERE artifact_id = p_artifact_id
  )
  WHERE artifact_id = p_artifact_id;

  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', p_artifact_id,
    'closed_seq', p_closed_seq,
    'deleted', v_deleted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.collab_compact_ydoc_v1(
  p_artifact_id uuid,
  p_closed_seq bigint,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
  SELECT collab.compact_ydoc(p_artifact_id, p_closed_seq, p_snapshot_base64, p_state_vector_base64);
$$;
