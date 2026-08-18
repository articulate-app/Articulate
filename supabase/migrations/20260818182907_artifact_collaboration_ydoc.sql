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

CREATE OR REPLACE FUNCTION collab.resolve_editor_kind(
  p_artifact public.artifacts
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind', '')))
      IN ('html_email', 'media', 'code', 'image', 'video', 'audio')
      THEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind')))
    WHEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format', '')))
      IN ('html_email', 'html', 'email', 'code', 'image', 'video', 'audio')
      THEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format')))
    WHEN lower(trim(coalesce(p_artifact.metadata->>'editor_kind', p_artifact.content_json->>'editor_kind', '')))
      IN ('rich_text', 'tiptap', 'tiptap_json')
      THEN 'rich_text'
    WHEN lower(trim(coalesce(p_artifact.metadata->>'content_format', p_artifact.content_json->>'content_format', '')))
      IN ('tiptap_json', 'rich_text')
      THEN 'rich_text'
    ELSE 'rich_text'
  END;
$$;

CREATE OR REPLACE FUNCTION collab.is_rich_text_editor_kind(p_editor_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $$
  SELECT lower(trim(coalesce(p_editor_kind, ''))) IN ('rich_text', 'tiptap', 'tiptap_json');
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
  IF NOT collab.is_rich_text_editor_kind(collab.resolve_editor_kind(v_artifact)) THEN
    RETURN false;
  END IF;

  SELECT enabled INTO v_flag
  FROM collab.feature_flags
  WHERE scope_type = 'artifact' AND scope_key = p_artifact_id::text;
  IF FOUND THEN
    RETURN v_flag;
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

CREATE OR REPLACE FUNCTION collab.try_authorize_artifact(
  p_artifact_id uuid,
  p_require_write boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  PERFORM public.ai_authorize_artifact_v2(p_artifact_id, p_require_write);
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_topic_access_v1(
  p_topic text,
  p_require_write boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_artifact_id uuid;
BEGIN
  IF public.current_user_id() IS NULL THEN
    RETURN false;
  END IF;
  IF p_topic IS NULL OR p_topic !~* '^artifact:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_artifact_id := substring(p_topic from 10)::uuid;
  IF NOT collab.is_enabled_for_artifact(v_artifact_id) THEN
    RETURN false;
  END IF;
  RETURN collab.try_authorize_artifact(v_artifact_id, p_require_write);
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
  v_editor_kind text;
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
      RETURN jsonb_build_object('ok', false, 'code', SQLERRM, 'artifact_id', p_artifact_id);
  END;

  BEGIN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
    v_can_write := true;
  EXCEPTION
    WHEN OTHERS THEN
      v_can_write := false;
  END;

  SELECT * INTO v_user FROM public.users WHERE id = v_actor;
  v_editor_kind := collab.resolve_editor_kind(v_artifact);

  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', v_artifact.id,
    'can_read', v_can_read,
    'can_write', v_can_write,
    'collab_enabled', collab.is_enabled_for_artifact(v_artifact.id),
    'editor_kind', v_editor_kind,
    'room', 'artifact:' || v_artifact.id::text,
    'user_id', v_actor,
    'full_name', v_user.full_name,
    'photo', v_user.photo,
    'project_id', v_artifact.project_id,
    'task_id', v_artifact.task_id,
    'current_version', v_artifact.current_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_persist_update_v1(
  p_artifact_id uuid,
  p_update_base64 text,
  p_idempotency_key text,
  p_client_id text DEFAULT NULL,
  p_origin text DEFAULT 'user',
  p_actor_type text DEFAULT 'user'
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
  VALUES (p_artifact_id, 'ready', now())
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

  SELECT coalesce(max(seq), 0) + 1
  INTO v_seq
  FROM collab.artifact_ydoc_updates
  WHERE artifact_id = p_artifact_id;

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

CREATE OR REPLACE FUNCTION public.artifact_collab_load_document_v1(
  p_artifact_id uuid,
  p_after_seq bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_doc collab.artifact_ydocs%rowtype;
  v_updates jsonb;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, false);
  END IF;

  SELECT * INTO v_doc FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'missing',
      'artifact_id', p_artifact_id,
      'last_included_seq', 0,
      'updates', '[]'::jsonb
    );
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'seq', u.seq,
    'update_base64', encode(u.update_bin, 'base64'),
    'idempotency_key', u.idempotency_key,
    'client_id', u.client_id,
    'created_at', u.created_at
  ) ORDER BY u.seq), '[]'::jsonb)
  INTO v_updates
  FROM collab.artifact_ydoc_updates u
  WHERE u.artifact_id = p_artifact_id
    AND u.seq > greatest(coalesce(p_after_seq, 0), v_doc.last_included_seq);

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_doc.seed_status,
    'artifact_id', p_artifact_id,
    'snapshot_base64', CASE WHEN v_doc.ydoc_snapshot IS NULL THEN NULL ELSE encode(v_doc.ydoc_snapshot, 'base64') END,
    'state_vector_base64', CASE WHEN v_doc.state_vector IS NULL THEN NULL ELSE encode(v_doc.state_vector, 'base64') END,
    'last_included_seq', v_doc.last_included_seq,
    'schema_version', v_doc.schema_version,
    'seed_error', v_doc.seed_error,
    'updates', v_updates
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_claim_seed_v1(p_artifact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_row collab.artifact_ydocs%rowtype;
  v_claim uuid := gen_random_uuid();
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));
  SELECT * INTO v_row FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;

  IF FOUND AND v_row.seed_status = 'ready' AND v_row.ydoc_snapshot IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ready',
      'artifact_id', p_artifact_id,
      'snapshot_base64', encode(v_row.ydoc_snapshot, 'base64'),
      'last_included_seq', v_row.last_included_seq
    );
  END IF;
  IF FOUND AND v_row.seed_status = 'failed' THEN
    RETURN jsonb_build_object('status', 'failed', 'artifact_id', p_artifact_id, 'seed_error', v_row.seed_error);
  END IF;
  IF FOUND AND v_row.seed_status = 'seeding'
     AND v_row.seeding_started_at IS NOT NULL
     AND v_row.seeding_started_at > now() - interval '30 seconds' THEN
    RETURN jsonb_build_object('status', 'seeding', 'artifact_id', p_artifact_id);
  END IF;

  IF FOUND THEN
    UPDATE collab.artifact_ydocs
    SET seed_status = 'seeding', claim_token = v_claim, seeding_started_at = now(), seed_error = NULL, updated_at = now()
    WHERE artifact_id = p_artifact_id;
  ELSE
    INSERT INTO collab.artifact_ydocs (artifact_id, seed_status, claim_token, seeding_started_at, updated_at)
    VALUES (p_artifact_id, 'seeding', v_claim, now(), now());
  END IF;

  RETURN jsonb_build_object('status', 'claimed', 'artifact_id', p_artifact_id, 'claim_token', v_claim);
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_complete_seed_v1(
  p_artifact_id uuid,
  p_claim_token uuid,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL,
  p_seeded_from text DEFAULT 'content_json'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_snapshot bytea;
  v_vector bytea;
  v_size integer;
BEGIN
  IF public.current_user_id() IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public.ai_authorize_artifact_v2(p_artifact_id, true);
  END IF;

  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));
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
      seed_error = NULL,
      claim_token = NULL,
      seeded_at = now(),
      last_compacted_at = now(),
      byte_size = v_size,
      updated_at = now()
  WHERE artifact_id = p_artifact_id
    AND claim_token = p_claim_token
    AND seed_status = 'seeding';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'seed_claim_mismatch');
  END IF;
  RETURN jsonb_build_object('ok', true, 'artifact_id', p_artifact_id, 'byte_size', v_size);
END;
$$;

CREATE OR REPLACE FUNCTION collab.compact_ydoc(
  p_artifact_id uuid,
  p_closed_seq bigint,
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
  v_deleted integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'service_role_required';
  END IF;
  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));

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
      last_included_seq = greatest(last_included_seq, p_closed_seq),
      last_compacted_at = now(),
      byte_size = v_size,
      updated_at = now()
  WHERE artifact_id = p_artifact_id
    AND seed_status = 'ready';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ydoc_not_ready');
  END IF;

  DELETE FROM collab.artifact_ydoc_updates
  WHERE artifact_id = p_artifact_id
    AND seq <= p_closed_seq;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  UPDATE collab.artifact_ydocs
  SET update_count = (
    SELECT count(*) FROM collab.artifact_ydoc_updates WHERE artifact_id = p_artifact_id
  )
  WHERE artifact_id = p_artifact_id;

  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', p_artifact_id,
    'closed_seq', p_closed_seq,
    'deleted', v_deleted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.collab_compact_ydoc_v1(
  p_artifact_id uuid,
  p_closed_seq bigint,
  p_snapshot_base64 text,
  p_state_vector_base64 text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'collab', 'public'
AS $$
  SELECT collab.compact_ydoc(p_artifact_id, p_closed_seq, p_snapshot_base64, p_state_vector_base64);
$$;

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
