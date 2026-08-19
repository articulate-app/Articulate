-- Applied remotely as 20260818210548 artifact_collaboration_ydoc. Do not edit; this is the recorded history SQL.
-- Collaborative Y.Doc persistence over Supabase (Broadcast + Presence + Postgres).
-- Private `collab` schema is backend-only. Feature flags default off.

CREATE SCHEMA IF NOT EXISTS collab;

REVOKE ALL ON SCHEMA collab FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA collab TO service_role;
GRANT ALL ON SCHEMA collab TO postgres, service_role;

CREATE TABLE collab.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('global', 'project', 'artifact')),
  scope_key text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_key)
);

CREATE TABLE collab.artifact_ydocs (
  artifact_id uuid PRIMARY KEY REFERENCES public.artifacts(id) ON DELETE CASCADE,
  ydoc_snapshot bytea,
  state_vector bytea,
  last_included_seq bigint NOT NULL DEFAULT 0,
  schema_version integer NOT NULL DEFAULT 1,
  editor_kind text NOT NULL DEFAULT 'rich_text',
  seeded_from text
    CHECK (seeded_from IS NULL OR seeded_from IN ('content_json', 'html', 'empty')),
  seed_status text NOT NULL DEFAULT 'pending'
    CHECK (seed_status IN ('pending', 'seeding', 'ready', 'failed')),
  seed_error text,
  claim_token uuid,
  seeding_started_at timestamptz,
  seeded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_compacted_at timestamptz,
  byte_size integer NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  update_count integer NOT NULL DEFAULT 0 CHECK (update_count >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE collab.artifact_ydoc_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES collab.artifact_ydocs(artifact_id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  update_bin bytea NOT NULL,
  byte_size integer NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_user_id integer,
  client_id text,
  origin text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, seq),
  UNIQUE (artifact_id, idempotency_key)
);

CREATE INDEX artifact_ydoc_updates_artifact_seq_idx
  ON collab.artifact_ydoc_updates (artifact_id, seq);
CREATE INDEX artifact_ydocs_seed_status_idx
  ON collab.artifact_ydocs (seed_status, updated_at DESC);

ALTER TABLE collab.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab.artifact_ydocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab.artifact_ydoc_updates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA collab FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA collab TO postgres, service_role;

CREATE POLICY collab_feature_flags_no_direct
ON collab.feature_flags
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY collab_artifact_ydocs_no_direct
ON collab.artifact_ydocs
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY collab_artifact_ydoc_updates_no_direct
ON collab.artifact_ydoc_updates
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

INSERT INTO collab.feature_flags (scope_type, scope_key, enabled)
VALUES ('global', '', false)
ON CONFLICT (scope_type, scope_key) DO NOTHING;
