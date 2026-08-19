-- Applied remotely as 20260819094101 artifact_collaboration_proposal_rpcs. Do not edit; this is the recorded history SQL.

CREATE OR REPLACE FUNCTION public.artifact_collab_record_change_group_v1(
  p_artifact_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_row collab.artifact_change_groups%rowtype;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;

  INSERT INTO collab.artifact_change_groups (
    artifact_id, actor_type, actor_user_id, origin, summary, target,
    insert_count, delete_count, from_seq, to_seq, proposal_id
  ) VALUES (
    p_artifact_id,
    left(trim(coalesce(p_payload->>'actor_type', 'user')), 20),
    public.current_user_id(),
    nullif(left(trim(coalesce(p_payload->>'origin', '')), 80), ''),
    nullif(left(trim(coalesce(p_payload->>'summary', '')), 1000), ''),
    coalesce(p_payload->'target', '{}'::jsonb),
    coalesce(NULLIF(p_payload->>'insert_count', '')::integer, 0),
    coalesce(NULLIF(p_payload->>'delete_count', '')::integer, 0),
    NULLIF(p_payload->>'from_seq', '')::bigint,
    NULLIF(p_payload->>'to_seq', '')::bigint,
    NULLIF(p_payload->>'proposal_id', '')::uuid
  )
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_claim_proposal_v1(
  p_artifact_id uuid,
  p_idempotency_key text
)
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
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text || ':' || coalesce(p_idempotency_key, '')));

  SELECT * INTO v_row
  FROM collab.artifact_ai_proposals
  WHERE artifact_id = p_artifact_id AND idempotency_key = trim(p_idempotency_key)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_missing');
  END IF;
  IF v_row.status = 'applied' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'applied', 'duplicate', true, 'id', v_row.id);
  END IF;
  IF v_row.status IN ('conflict', 'rejected', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'status', v_row.status, 'id', v_row.id, 'error', v_row.error);
  END IF;
  IF v_row.status = 'applying' AND v_row.updated_at > now() - interval '2 minutes' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'applying', 'id', v_row.id, 'in_flight', true);
  END IF;
  IF v_row.status NOT IN ('ready', 'applying', 'streaming') THEN
    RETURN jsonb_build_object('ok', false, 'status', v_row.status, 'id', v_row.id);
  END IF;

  UPDATE collab.artifact_ai_proposals
  SET status = 'applying', error = NULL, updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'status', 'applying', 'id', v_row.id, 'duplicate', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_complete_proposal_v1(
  p_artifact_id uuid,
  p_idempotency_key text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
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
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;

  UPDATE collab.artifact_ai_proposals
  SET status = 'applied',
      error = NULL,
      updated_at = now()
  WHERE artifact_id = p_artifact_id
    AND idempotency_key = trim(p_idempotency_key)
    AND status IN ('applying', 'applied')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_applying');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', v_row.status, 'id', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_fail_proposal_v1(
  p_artifact_id uuid,
  p_idempotency_key text,
  p_status text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_row collab.artifact_ai_proposals%rowtype;
  v_status text := left(trim(coalesce(p_status, 'failed')), 20);
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;
  IF v_status NOT IN ('conflict', 'failed', 'rejected') THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'invalid_proposal_status';
  END IF;

  UPDATE collab.artifact_ai_proposals
  SET status = v_status,
      conflict = coalesce(p_payload->'conflict', conflict),
      error = coalesce(p_payload->>'error', error),
      updated_at = now()
  WHERE artifact_id = p_artifact_id
    AND idempotency_key = trim(p_idempotency_key)
    AND status IN ('ready', 'applying', 'streaming', 'conflict', 'failed')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_found');
  END IF;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_sync_status_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_doc collab.artifact_ydocs%rowtype;
  v_max bigint;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, false);
  END IF;
  SELECT * INTO v_doc FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'missing', 'artifact_id', p_artifact_id);
  END IF;
  SELECT coalesce(max(seq), 0) INTO v_max
  FROM collab.artifact_ydoc_updates WHERE artifact_id = p_artifact_id;
  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', p_artifact_id,
    'seed_status', v_doc.seed_status,
    'projected_seq', v_doc.projected_seq,
    'last_checkpoint_seq', v_doc.last_checkpoint_seq,
    'last_included_seq', v_doc.last_included_seq,
    'max_seq', v_max,
    'pending_updates', greatest(v_max - v_doc.last_included_seq, 0),
    'projection_pending', v_max > v_doc.projected_seq
  );
END;
$$;

REVOKE ALL ON FUNCTION public.artifact_collab_complete_seed_v1(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_project_v1(uuid, bigint, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_checkpoint_v1(uuid, bigint, jsonb, text, text, jsonb, text, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_record_change_group_v1(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_claim_proposal_v1(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_complete_proposal_v1(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_fail_proposal_v1(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_sync_status_v1(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.artifact_collab_complete_seed_v1(uuid, uuid, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_project_v1(uuid, bigint, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_checkpoint_v1(uuid, bigint, jsonb, text, text, jsonb, text, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_record_change_group_v1(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_claim_proposal_v1(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_complete_proposal_v1(uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_fail_proposal_v1(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_sync_status_v1(uuid) TO authenticated, service_role;
