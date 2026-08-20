CREATE OR REPLACE FUNCTION public.ai_list_artifact_versions_v1(
  p_artifact_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_artifact public.artifacts%rowtype;
  v_versions jsonb;
  v_total integer;
BEGIN
  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, false);

  SELECT count(*)::integer
  INTO v_total
  FROM public.artifact_versions v
  WHERE v.artifact_id = v_artifact.id;

  SELECT coalesce(jsonb_agg(item ORDER BY version_number DESC), '[]'::jsonb)
  INTO v_versions
  FROM (
    SELECT
      q.version_number,
      jsonb_strip_nulls(jsonb_build_object(
        'version_number', q.version_number,
        'change_source', q.change_source,
        'changed_by', q.changed_by,
        'ai_message_id', q.ai_message_id,
        'ai_thread_id', q.ai_thread_id,
        'ai_run_id', q.ai_run_id,
        'change_summary', q.change_summary,
        'created_at', q.created_at,
        'title', q.snapshot->>'title',
        'status', q.snapshot->>'status',
        'content_preview', left(regexp_replace(coalesce(q.snapshot->>'content_text', ''), '\s+', ' ', 'g'), 2000),
        'previous_content_preview', q.previous_content_preview,
        'insert_count', coalesce(NULLIF(q.diff_stats->>'insert_count', '')::integer, 0),
        'delete_count', coalesce(NULLIF(q.diff_stats->>'delete_count', '')::integer, 0),
        'diff_stats', q.diff_stats,
        'asset_count', CASE
          WHEN jsonb_typeof(q.snapshot->'asset_data'->'assets') = 'array'
            THEN jsonb_array_length(q.snapshot->'asset_data'->'assets')
          ELSE 0
        END,
        'is_current', q.version_number = v_artifact.current_version
      )) AS item
    FROM (
      SELECT
        v.*,
        left(
          regexp_replace(coalesce(lag(v.snapshot->>'content_text') OVER (ORDER BY v.version_number), ''), '\s+', ' ', 'g'),
          2000
        ) AS previous_content_preview
      FROM public.artifact_versions v
      WHERE v.artifact_id = v_artifact.id
    ) q
    ORDER BY q.version_number DESC
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
    OFFSET greatest(0, coalesce(p_offset, 0))
  ) listed;

  RETURN jsonb_build_object(
    'ok', true,
    'artifact_id', v_artifact.id,
    'current_version', v_artifact.current_version,
    'total', v_total,
    'limit', greatest(1, least(coalesce(p_limit, 50), 200)),
    'offset', greatest(0, coalesce(p_offset, 0)),
    'versions', v_versions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.artifact_collab_checkpoint_v1(
  p_artifact_id uuid,
  p_seq bigint,
  p_snapshot jsonb,
  p_change_source text DEFAULT 'manual',
  p_summary text DEFAULT NULL,
  p_diff_stats jsonb DEFAULT '{}'::jsonb,
  p_state_vector_base64 text DEFAULT NULL,
  p_ai_run_id uuid DEFAULT NULL,
  p_ai_message_id uuid DEFAULT NULL,
  p_ai_thread_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'collab'
AS $$
DECLARE
  v_actor integer := public.current_user_id();
  v_artifact public.artifacts%rowtype;
  v_doc collab.artifact_ydocs%rowtype;
  v_next integer;
  v_version_id uuid;
  v_vector bytea;
  v_source text := left(trim(coalesce(nullif(p_change_source, ''), 'manual')), 100);
  v_stored jsonb;
  v_actor_type text;
BEGIN
  IF v_actor IS NULL AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'authentication_required';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);
    IF NOT collab.is_enabled_for_artifact(p_artifact_id) THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'collab_disabled';
    END IF;
  ELSE
    SELECT * INTO v_artifact FROM public.artifacts WHERE id = p_artifact_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0002', message = 'artifact_not_found';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(87, hashtext(p_artifact_id::text));
  PERFORM pg_advisory_xact_lock(88, hashtext(p_artifact_id::text));

  SELECT * INTO v_artifact FROM public.artifacts WHERE id = p_artifact_id FOR UPDATE;
  SELECT * INTO v_doc FROM collab.artifact_ydocs WHERE artifact_id = p_artifact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'ydoc_missing';
  END IF;

  IF v_doc.last_checkpoint_seq = coalesce(p_seq, 0) AND coalesce(p_seq, 0) > 0 THEN
    SELECT id, version_number INTO v_version_id, v_next
    FROM public.artifact_versions
    WHERE artifact_id = p_artifact_id AND yjs_seq = p_seq
    ORDER BY version_number DESC
    LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'artifact_id', p_artifact_id,
      'version_id', v_version_id,
      'version_number', coalesce(v_next, v_artifact.current_version),
      'seq', p_seq
    );
  END IF;

  IF p_state_vector_base64 IS NOT NULL AND length(p_state_vector_base64) > 0 THEN
    v_vector := decode(p_state_vector_base64, 'base64');
  END IF;

  v_next := v_artifact.current_version + 1;
  v_stored := public.ai_hydrate_artifact_snapshot_v1(
    public.ai_artifact_snapshot_v2(p_artifact_id),
    coalesce(p_snapshot, '{}'::jsonb)
  ) || jsonb_build_object(
    'id', p_artifact_id,
    'current_version', v_next
  );
  INSERT INTO public.artifact_versions (
    artifact_id, version_number, snapshot, change_source, changed_by,
    ai_message_id, ai_thread_id, ai_run_id, change_summary, created_at,
    yjs_seq, yjs_state_vector, diff_stats
  ) VALUES (
    p_artifact_id, v_next, v_stored, v_source, v_actor,
    p_ai_message_id, p_ai_thread_id, p_ai_run_id,
    nullif(left(trim(coalesce(p_summary, '')), 1000), ''),
    now(), coalesce(p_seq, 0), v_vector, coalesce(p_diff_stats, '{}'::jsonb)
  )
  RETURNING id INTO v_version_id;

  UPDATE public.artifacts
  SET current_version = v_next,
      updated_at = now()
  WHERE id = p_artifact_id;

  UPDATE collab.artifact_ydocs
  SET last_checkpoint_seq = greatest(last_checkpoint_seq, coalesce(p_seq, 0)),
      updated_at = now()
  WHERE artifact_id = p_artifact_id;

  v_actor_type := CASE
    WHEN v_source = 'ai' THEN 'agent'
    WHEN v_source IN ('restore', 'system', 'publish') THEN 'system'
    ELSE 'user'
  END;

  INSERT INTO collab.artifact_change_groups (
    artifact_id, actor_type, actor_user_id, origin, summary, target,
    insert_count, delete_count, from_seq, to_seq, after_version_id
  ) VALUES (
    p_artifact_id,
    v_actor_type,
    v_actor,
    v_source,
    nullif(left(trim(coalesce(p_summary, '')), 1000), ''),
    jsonb_build_object('version_number', v_next, 'ai_run_id', p_ai_run_id, 'ai_thread_id', p_ai_thread_id),
    coalesce(NULLIF(p_diff_stats->>'insert_count', '')::integer, 0),
    coalesce(NULLIF(p_diff_stats->>'delete_count', '')::integer, 0),
    NULL,
    coalesce(p_seq, 0),
    v_version_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'artifact_id', p_artifact_id,
    'version_id', v_version_id,
    'version_number', v_next,
    'seq', coalesce(p_seq, 0)
  );
END;
$$;
