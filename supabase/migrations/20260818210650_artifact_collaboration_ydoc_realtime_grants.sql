-- Applied remotely as 20260818210650 artifact_collaboration_ydoc_realtime_grants. Do not edit; this is the recorded history SQL.

DROP POLICY IF EXISTS artifact_collab_receive ON realtime.messages;
DROP POLICY IF EXISTS artifact_collab_send ON realtime.messages;

CREATE POLICY artifact_collab_receive
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  coalesce(realtime.messages.private, true) = true
  AND realtime.messages.extension IN ('broadcast', 'presence')
  AND public.artifact_collab_topic_access_v1((SELECT realtime.topic()), false)
);

CREATE POLICY artifact_collab_send
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  coalesce(realtime.messages.private, true) = true
  AND (
    (
      realtime.messages.extension = 'presence'
      AND public.artifact_collab_topic_access_v1((SELECT realtime.topic()), false)
    )
    OR (
      realtime.messages.extension = 'broadcast'
      AND public.artifact_collab_topic_access_v1((SELECT realtime.topic()), true)
    )
  )
);

REVOKE ALL ON FUNCTION collab.resolve_editor_kind(public.artifacts) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.is_rich_text_editor_kind(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.is_enabled_for_artifact(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.try_authorize_artifact(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.compact_ydoc(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.collab_compact_ydoc_v1(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION collab.resolve_editor_kind(public.artifacts) TO service_role;
GRANT EXECUTE ON FUNCTION collab.is_rich_text_editor_kind(text) TO service_role;
GRANT EXECUTE ON FUNCTION collab.is_enabled_for_artifact(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION collab.try_authorize_artifact(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION collab.compact_ydoc(uuid, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.collab_compact_ydoc_v1(uuid, bigint, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.artifact_collab_topic_access_v1(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_authorize_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_persist_update_v1(uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_load_document_v1(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_claim_seed_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artifact_collab_complete_seed_v1(uuid, uuid, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.artifact_collab_topic_access_v1(text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_authorize_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artifact_collab_persist_update_v1(uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_load_document_v1(uuid, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_claim_seed_v1(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artifact_collab_complete_seed_v1(uuid, uuid, text, text, text) TO authenticated, service_role;

COMMENT ON SCHEMA collab IS 'Private Yjs snapshots/updates. Not exposed on the Data API.';
