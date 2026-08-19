-- Applied remotely as 20260819090151 artifact_collaboration_runtime. Do not edit; this is the recorded history SQL.
-- Functions and grants from 20260819085921_artifact_collaboration_runtime.sql
-- Tables/columns already applied. CREATE OR REPLACE is idempotent.

CREATE OR REPLACE FUNCTION public.artifact_collab_is_enabled_v1(p_artifact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
  SELECT collab.is_enabled_for_artifact(p_artifact_id);
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_fail_seed_v1(
  p_artifact_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;
  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));
  UPDATE collab.artifact_ydocs
  SET seed_status = 'failed',
      seed_error = left(trim(coalesce(p_error, 'seed_failed')), 2000),
      claim_token = NULL,
      updated_at = now()
  WHERE artifact_id = p_artifact_id
    AND claim_token = p_claim_token
    AND seed_status = 'seeding';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'seed_claim_mismatch');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'failed');
END;
$$;

REVOKE ALL ON FUNCTION public.artifact_collab_is_enabled_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_fail_seed_v1(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artifact_collab_is_enabled_v1(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_fail_seed_v1(uuid, uuid, text) TO authenticated, service_role;
