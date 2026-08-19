-- Applied remotely as 20260819090222 artifact_collaboration_runtime_schema. Do not edit; this is the recorded history SQL.
ALTER TABLE collab.artifact_ydocs ADD COLUMN IF NOT EXISTS projected_seq bigint NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS projected_state_vector bytea, ADD COLUMN IF NOT EXISTS projected_at timestamptz, ADD COLUMN IF NOT EXISTS projection_error text, ADD COLUMN IF NOT EXISTS last_manual_edit_at timestamptz, ADD COLUMN IF NOT EXISTS last_checkpoint_seq bigint NOT NULL DEFAULT 0;
ALTER TABLE public.artifact_versions ADD COLUMN IF NOT EXISTS yjs_seq bigint, ADD COLUMN IF NOT EXISTS yjs_state_vector bytea, ADD COLUMN IF NOT EXISTS diff_stats jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS collab.artifact_ai_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'streaming' CHECK (status IN ('streaming', 'ready', 'applying', 'applied', 'conflict', 'rejected', 'failed')),
  idempotency_key text NOT NULL,
  actor_type text NOT NULL DEFAULT 'agent',
  actor_user_id integer, ai_run_id uuid, ai_message_id uuid, ai_thread_id uuid,
  base_seq bigint, base_content_text text, expected_text text,
  target jsonb NOT NULL DEFAULT '{}'::jsonb, proposed_content jsonb, conflict jsonb, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS collab.artifact_change_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_user_id integer, origin text, summary text,
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  insert_count integer NOT NULL DEFAULT 0, delete_count integer NOT NULL DEFAULT 0,
  from_seq bigint, to_seq bigint, before_version_id uuid, after_version_id uuid,
  proposal_id uuid REFERENCES collab.artifact_ai_proposals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS artifact_ai_proposals_artifact_status_idx ON collab.artifact_ai_proposals (artifact_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS artifact_change_groups_artifact_idx ON collab.artifact_change_groups (artifact_id, created_at DESC);
ALTER TABLE collab.artifact_ai_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab.artifact_change_groups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE collab.artifact_ai_proposals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE collab.artifact_change_groups FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE collab.artifact_ai_proposals TO postgres, service_role;
GRANT ALL ON TABLE collab.artifact_change_groups TO postgres, service_role;
DROP POLICY IF EXISTS collab_ai_proposals_no_direct ON collab.artifact_ai_proposals;
CREATE POLICY collab_ai_proposals_no_direct ON collab.artifact_ai_proposals FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS collab_change_groups_no_direct ON collab.artifact_change_groups;
CREATE POLICY collab_change_groups_no_direct ON collab.artifact_change_groups FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
