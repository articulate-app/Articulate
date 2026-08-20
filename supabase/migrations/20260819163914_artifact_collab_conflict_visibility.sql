CREATE OR REPLACE FUNCTION public.artifact_collab_list_conflicts_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_last_applied timestamptz;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, false);
  END IF;

  SELECT max(updated_at) INTO v_last_applied
  FROM collab.artifact_ai_proposals
  WHERE artifact_id = p_artifact_id
    AND status = 'applied';

  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC)
    FROM collab.artifact_ai_proposals p
    WHERE p.artifact_id = p_artifact_id
      AND p.status IN ('conflict', 'failed')
      AND coalesce(p.conflict->>'kind', '') <> ''
      AND (v_last_applied IS NULL OR p.updated_at > v_last_applied)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_dismiss_conflict_v1(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_row collab.artifact_ai_proposals%rowtype;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  SELECT * INTO v_row
  FROM collab.artifact_ai_proposals
  WHERE id = p_proposal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_found');
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(v_row.artifact_id, true);
  END IF;

  UPDATE collab.artifact_ai_proposals
  SET status = 'rejected',
      updated_at = now()
  WHERE id = p_proposal_id
    AND status IN ('conflict', 'failed');

  RETURN jsonb_build_object('ok', true, 'id', p_proposal_id, 'status', 'rejected');
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
  v_max_seq bigint;
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
  SELECT coalesce(max(seq), 0) INTO v_max_seq
  FROM collab.artifact_ydoc_updates
  WHERE artifact_id = p_artifact_id;
  IF v_doc.projected_seq > coalesce(p_seq, 0) OR coalesce(p_seq, 0) < v_max_seq THEN
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

REVOKE ALL ON FUNCTION public.artifact_collab_dismiss_conflict_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artifact_collab_dismiss_conflict_v1(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.artifact_collab_persist_update_v1(uuid, text, text, text, text, text);

CREATE FUNCTION public.artifact_collab_persist_update_v1(
  p_artifact_id uuid,
  p_update_base64 text,
  p_idempotency_key text,
  p_client_id text DEFAULT NULL,
  p_origin text DEFAULT 'user',
  p_actor_type text DEFAULT 'user',
  p_base_seq bigint DEFAULT NULL
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
  v_max bigint;
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
  VALUES (p_artifact_id, 'pending', now())
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

  SELECT coalesce(max(seq), 0) INTO v_max
  FROM collab.artifact_ydoc_updates
  WHERE artifact_id = p_artifact_id;
  IF p_base_seq IS NOT NULL AND p_base_seq < v_max THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'stale_base',
      'max_seq', v_max,
      'artifact_id', p_artifact_id
    );
  END IF;

  v_seq := v_max + 1;

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
      last_manual_edit_at = CASE
        WHEN left(trim(coalesce(nullif(p_actor_type, ''), 'user')), 20) = 'user' THEN now()
        ELSE last_manual_edit_at
      END,
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

REVOKE ALL ON FUNCTION public.artifact_collab_persist_update_v1(uuid, text, text, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artifact_collab_persist_update_v1(uuid, text, text, text, text, text, bigint) TO authenticated, service_role;
