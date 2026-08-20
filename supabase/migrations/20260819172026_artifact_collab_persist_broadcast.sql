-- Broadcast every persisted Yjs update on the artifact room so open editors
-- apply AI/peer writes without waiting for a refresh.

CREATE OR REPLACE FUNCTION public.artifact_collab_persist_update_v1(
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
SET search_path TO 'pg_catalog', 'public', 'collab', 'realtime'
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

  BEGIN
    PERFORM realtime.send(
      jsonb_build_object(
        'key', trim(p_idempotency_key),
        'seq', v_seq,
        'update_base64', p_update_base64
      ),
      'ydoc-update',
      'artifact:' || p_artifact_id::text,
      true
    );
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'id', v_id,
    'seq', v_seq,
    'artifact_id', p_artifact_id
  );
END;
$$;
