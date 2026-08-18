-- Collaborative Y.Doc persistence for rich-text artifacts.
-- Private `collab` schema is backend-only (service_role). Feature flags
-- default off so the existing snapshot editor remains the live path.

CREATE SCHEMA IF NOT EXISTS collab;

REVOKE ALL ON SCHEMA collab FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA collab TO service_role;
GRANT ALL ON SCHEMA collab TO postgres, service_role;

CREATE TABLE collab.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL
    CHECK (scope_type IN ('global', 'project', 'artifact_type', 'artifact')),
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
  schema_version integer NOT NULL DEFAULT 1,
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
  byte_size integer NOT NULL DEFAULT 0
    CHECK (byte_size >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX artifact_ydocs_seed_status_idx
  ON collab.artifact_ydocs (seed_status, updated_at DESC);

CREATE TABLE collab.artifact_ydoc_updates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  artifact_id uuid NOT NULL REFERENCES collab.artifact_ydocs(artifact_id) ON DELETE CASCADE,
  update_bin bytea NOT NULL,
  byte_size integer NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artifact_ydoc_updates_artifact_created_idx
  ON collab.artifact_ydoc_updates (artifact_id, created_at);

ALTER TABLE collab.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab.artifact_ydocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE collab.artifact_ydoc_updates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA collab FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA collab TO postgres, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA collab TO service_role;

-- Default: collaboration is off. Allowed types for the first rollout.
INSERT INTO collab.feature_flags (scope_type, scope_key, enabled)
VALUES
  ('global', '', false),
  ('artifact_type', 'document', true),
  ('artifact_type', 'article', true)
ON CONFLICT (scope_type, scope_key) DO NOTHING;

CREATE OR REPLACE FUNCTION collab.is_rich_text_artifact_type(p_artifact_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(p_artifact_type, ''))) IN ('document', 'article', 'post', 'caption');
$$;

CREATE OR REPLACE FUNCTION collab.is_enabled_for_artifact(p_artifact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
DECLARE
  v_artifact public.artifacts%rowtype;
  v_flag boolean;
BEGIN
  SELECT * INTO v_artifact FROM public.artifacts WHERE id = p_artifact_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT collab.is_rich_text_artifact_type(v_artifact.artifact_type) THEN
    RETURN false;
  END IF;

  IF coalesce(v_artifact.metadata->>'content_format', '') = 'html_email' THEN
    RETURN false;
  END IF;

  SELECT enabled INTO v_flag
  FROM collab.feature_flags
  WHERE scope_type = 'artifact' AND scope_key = p_artifact_id::text;
  IF FOUND THEN
    RETURN v_flag;
  END IF;

  SELECT enabled INTO v_flag
  FROM collab.feature_flags
  WHERE scope_type = 'artifact_type' AND scope_key = lower(trim(v_artifact.artifact_type));
  IF FOUND AND v_flag IS FALSE THEN
    RETURN false;
  END IF;

  IF v_artifact.project_id IS NOT NULL THEN
    SELECT enabled INTO v_flag
    FROM collab.feature_flags
    WHERE scope_type = 'project' AND scope_key = v_artifact.project_id::text;
    IF FOUND THEN
      RETURN v_flag;
    END IF;
  END IF;

  SELECT enabled INTO v_flag
  FROM collab.feature_flags
  WHERE scope_type = 'global' AND scope_key = '';
  RETURN coalesce(v_flag, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_authorize_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_actor integer := public.current_user_id();
  v_artifact public.artifacts%rowtype;
  v_can_read boolean := false;
  v_can_write boolean := false;
  v_user public.users%rowtype;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'user_jwt_required';
  END IF;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;

  BEGIN
    v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, false);
    v_can_read := true;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', SQLERRM,
        'artifact_id', p_artifact_id
      );
  END;

  BEGIN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
    v_can_write := true;
  EXCEPTION
    WHEN OTHERS THEN
      v_can_write := false;
  END;

  SELECT * INTO v_user FROM public.users WHERE id = v_actor;

  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', v_artifact.id,
    'can_read', v_can_read,
    'can_write', v_can_write,
    'collab_enabled', collab.is_enabled_for_artifact(v_artifact.id),
    'room', 'artifact:' || v_artifact.id::text,
    'user_id', v_actor,
    'full_name', v_user.full_name,
    'photo', v_user.photo,
    'artifact_type', v_artifact.artifact_type,
    'project_id', v_artifact.project_id,
    'task_id', v_artifact.task_id,
    'current_version', v_artifact.current_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.artifact_collab_authorize_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artifact_collab_authorize_v1(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION collab.fetch_or_claim_ydoc(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
DECLARE
  v_row collab.artifact_ydocs%rowtype;
  v_claim uuid := gen_random_uuid();
  v_stale interval := interval '30 seconds';
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));

  SELECT * INTO v_row FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;

  IF FOUND AND v_row.seed_status = 'ready' AND v_row.ydoc_snapshot IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ready',
      'artifact_id', p_artifact_id,
      'snapshot_base64', encode(v_row.ydoc_snapshot, 'base64'),
      'state_vector_base64', CASE
        WHEN v_row.state_vector IS NULL THEN NULL
        ELSE encode(v_row.state_vector, 'base64')
      END,
      'schema_version', v_row.schema_version,
      'byte_size', v_row.byte_size
    );
  END IF;

  IF FOUND AND v_row.seed_status = 'failed' THEN
    RETURN jsonb_build_object(
      'status', 'failed',
      'artifact_id', p_artifact_id,
      'seed_error', v_row.seed_error
    );
  END IF;

  IF FOUND AND v_row.seed_status = 'seeding'
     AND v_row.seeding_started_at IS NOT NULL
     AND v_row.seeding_started_at > now() - v_stale THEN
    RETURN jsonb_build_object(
      'status', 'seeding',
      'artifact_id', p_artifact_id,
      'seeding_started_at', v_row.seeding_started_at
    );
  END IF;

  IF FOUND THEN
    UPDATE collab.artifact_ydocs
    SET seed_status = 'seeding',
        claim_token = v_claim,
        seeding_started_at = now(),
        seed_error = NULL,
        updated_at = now()
    WHERE artifact_id = p_artifact_id;
  ELSE
    INSERT INTO collab.artifact_ydocs (
      artifact_id, seed_status, claim_token, seeding_started_at, updated_at
    ) VALUES (
      p_artifact_id, 'seeding', v_claim, now(), now()
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'artifact_id', p_artifact_id,
    'claim_token', v_claim
  );
END;
$$;

CREATE OR REPLACE FUNCTION collab.complete_ydoc_seed(
  p_artifact_id uuid,
  p_claim_token uuid,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL,
  p_seeded_from text DEFAULT 'content_json',
  p_schema_version integer DEFAULT 1
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
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));

  IF p_snapshot_base64 IS NULL OR length(p_snapshot_base64) = 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'snapshot_required';
  END IF;

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
      schema_version = coalesce(p_schema_version, 1),
      seed_error = NULL,
      claim_token = NULL,
      seeded_at = now(),
      updated_at = now(),
      last_compacted_at = now(),
      byte_size = v_size
  WHERE artifact_id = p_artifact_id
    AND claim_token = p_claim_token
    AND seed_status = 'seeding';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'seed_claim_mismatch');
  END IF;

  RETURN jsonb_build_object('ok', true, 'artifact_id', p_artifact_id, 'byte_size', v_size);
END;
$$;

CREATE OR REPLACE FUNCTION collab.fail_ydoc_seed(
  p_artifact_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));

  UPDATE collab.artifact_ydocs
  SET seed_status = 'failed',
      seed_error = nullif(left(trim(coalesce(p_error, '')), 1000), ''),
      claim_token = NULL,
      updated_at = now()
  WHERE artifact_id = p_artifact_id
    AND claim_token = p_claim_token
    AND seed_status = 'seeding';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'seed_claim_mismatch');
  END IF;

  RETURN jsonb_build_object('ok', true, 'artifact_id', p_artifact_id, 'status', 'failed');
END;
$$;

CREATE OR REPLACE FUNCTION collab.store_ydoc_snapshot(
  p_artifact_id uuid,
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
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));

  IF p_snapshot_base64 IS NULL OR length(p_snapshot_base64) = 0 THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'snapshot_required';
  END IF;

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
      updated_at = now(),
      last_compacted_at = now(),
      byte_size = v_size
  WHERE artifact_id = p_artifact_id
    AND seed_status = 'ready';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ydoc_not_ready');
  END IF;

  RETURN jsonb_build_object('ok', true, 'artifact_id', p_artifact_id, 'byte_size', v_size);
END;
$$;

CREATE OR REPLACE FUNCTION collab.get_ydoc_snapshot(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
DECLARE
  v_row collab.artifact_ydocs%rowtype;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
  END IF;

  SELECT * INTO v_row FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ydoc_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', p_artifact_id,
    'status', v_row.seed_status,
    'snapshot_base64', CASE
      WHEN v_row.ydoc_snapshot IS NULL THEN NULL
      ELSE encode(v_row.ydoc_snapshot, 'base64')
    END,
    'state_vector_base64', CASE
      WHEN v_row.state_vector IS NULL THEN NULL
      ELSE encode(v_row.state_vector, 'base64')
    END,
    'byte_size', v_row.byte_size,
    'schema_version', v_row.schema_version,
    'seed_error', v_row.seed_error
  );
END;
$$;

-- PostgREST only exposes `public`. These wrappers keep tables private
-- while allowing the Hocuspocus service-role client to persist Y.Docs.
CREATE OR REPLACE FUNCTION public.collab_fetch_or_claim_ydoc_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
  SELECT collab.fetch_or_claim_ydoc(p_artifact_id);
$$;

CREATE OR REPLACE FUNCTION public.collab_complete_ydoc_seed_v1(
  p_artifact_id uuid,
  p_claim_token uuid,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL,
  p_seeded_from text DEFAULT 'content_json',
  p_schema_version integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
  SELECT collab.complete_ydoc_seed(
    p_artifact_id, p_claim_token, p_snapshot_base64,
    p_state_vector_base64, p_seeded_from, p_schema_version
  );
$$;

CREATE OR REPLACE FUNCTION public.collab_fail_ydoc_seed_v1(
  p_artifact_id uuid,
  p_claim_token uuid,
  p_error text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
  SELECT collab.fail_ydoc_seed(p_artifact_id, p_claim_token, p_error);
$$;

CREATE OR REPLACE FUNCTION public.collab_store_ydoc_snapshot_v1(
  p_artifact_id uuid,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
  SELECT collab.store_ydoc_snapshot(p_artifact_id, p_snapshot_base64, p_state_vector_base64);
$$;

CREATE OR REPLACE FUNCTION public.collab_get_ydoc_snapshot_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
  SELECT collab.get_ydoc_snapshot(p_artifact_id);
$$;

REVOKE ALL ON FUNCTION public.collab_fetch_or_claim_ydoc_v1(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.collab_complete_ydoc_seed_v1(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.collab_fail_ydoc_seed_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.collab_store_ydoc_snapshot_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.collab_get_ydoc_snapshot_v1(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.collab_fetch_or_claim_ydoc_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.collab_complete_ydoc_seed_v1(uuid, uuid, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.collab_fail_ydoc_seed_v1(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.collab_store_ydoc_snapshot_v1(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.collab_get_ydoc_snapshot_v1(uuid) TO service_role;

REVOKE ALL ON FUNCTION collab.is_rich_text_artifact_type(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.is_enabled_for_artifact(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.fetch_or_claim_ydoc(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.complete_ydoc_seed(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.fail_ydoc_seed(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.store_ydoc_snapshot(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION collab.get_ydoc_snapshot(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION collab.is_rich_text_artifact_type(text) TO service_role;
GRANT EXECUTE ON FUNCTION collab.is_enabled_for_artifact(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION collab.fetch_or_claim_ydoc(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION collab.complete_ydoc_seed(uuid, uuid, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION collab.fail_ydoc_seed(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION collab.store_ydoc_snapshot(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION collab.get_ydoc_snapshot(uuid) TO service_role;

COMMENT ON SCHEMA collab IS
  'Private collaboration store for Y.Docs. Not exposed on the Data API.';
COMMENT ON FUNCTION public.artifact_collab_authorize_v1(uuid) IS
  'Validates the caller JWT against existing artifact ACL and reports collab read/write.';
