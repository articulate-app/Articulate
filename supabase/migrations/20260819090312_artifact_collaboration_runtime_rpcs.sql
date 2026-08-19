-- Applied remotely as 20260819090312 artifact_collaboration_runtime_rpcs. Do not edit; this is the recorded history SQL.
CREATE INDEX IF NOT EXISTS artifact_change_groups_proposal_idx ON collab.artifact_change_groups (proposal_id);

CREATE OR REPLACE FUNCTION public.artifact_collab_list_conflicts_v1(p_artifact_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, false);
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC)
    FROM collab.artifact_ai_proposals p
    WHERE p.artifact_id = p_artifact_id AND p.status = 'conflict'
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.artifact_collab_list_conflicts_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artifact_collab_list_conflicts_v1(uuid) TO authenticated, service_role;
