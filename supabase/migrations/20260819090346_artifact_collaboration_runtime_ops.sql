-- Applied remotely as 20260819090346 artifact_collaboration_runtime_ops. Do not edit; this is the recorded history SQL.
CREATE OR REPLACE FUNCTION public.artifact_collab_upsert_proposal_v1(p_artifact_id uuid, p_idempotency_key text, p_status text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE v_row collab.artifact_ai_proposals%rowtype;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;
  INSERT INTO collab.artifact_ai_proposals (
    artifact_id, idempotency_key, status, actor_type, actor_user_id,
    ai_run_id, ai_message_id, ai_thread_id, base_seq, base_content_text,
    expected_text, target, proposed_content, conflict, error, updated_at
  ) VALUES (
    p_artifact_id, trim(p_idempotency_key), left(trim(coalesce(p_status, 'ready')), 20),
    left(trim(coalesce(p_payload->>'actor_type', 'agent')), 20), public.current_user_id(),
    NULLIF(p_payload->>'ai_run_id', '')::uuid, NULLIF(p_payload->>'ai_message_id', '')::uuid,
    NULLIF(p_payload->>'ai_thread_id', '')::uuid, NULLIF(p_payload->>'base_seq', '')::bigint,
    p_payload->>'base_content_text', p_payload->>'expected_text',
    coalesce(p_payload->'target', '{}'::jsonb), p_payload->'proposed_content',
    p_payload->'conflict', p_payload->>'error', now()
  )
  ON CONFLICT (artifact_id, idempotency_key) DO UPDATE
  SET status = excluded.status, target = excluded.target, proposed_content = excluded.proposed_content,
      conflict = excluded.conflict, error = excluded.error, updated_at = now()
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.artifact_collab_upsert_proposal_v1(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artifact_collab_upsert_proposal_v1(uuid, text, text, jsonb) TO authenticated, service_role;
