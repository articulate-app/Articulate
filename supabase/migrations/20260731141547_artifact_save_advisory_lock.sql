-- Serialize concurrent writers per artifact so revision-conflict stampede
-- cannot exhaust the PostgREST connection pool.
-- ai_save_build_artifact_v2 calls this function, so one lock covers both paths.

CREATE OR REPLACE FUNCTION public.ai_save_workspace_artifact_v2(
  p_artifact_id uuid,
  p_expected_version integer,
  p_snapshot jsonb,
  p_change_source text DEFAULT 'ai'::text,
  p_changed_by integer DEFAULT NULL::integer,
  p_ai_message_id uuid DEFAULT NULL::uuid,
  p_ai_thread_id uuid DEFAULT NULL::uuid,
  p_ai_run_id uuid DEFAULT NULL::uuid,
  p_change_summary text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor integer := case
    when coalesce(auth.role(), '') = 'service_role' then coalesce(p_changed_by, public.current_user_id())
    else public.current_user_id()
  end;
  v_artifact public.artifacts%rowtype;
  v_next integer;
  v_snapshot jsonb := coalesce(p_snapshot, '{}'::jsonb);
  v_title text;
  v_status text;
  v_text text;
  v_json jsonb;
  v_assets jsonb;
  v_metadata jsonb;
begin
  if v_actor is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  -- Namespace 87 = artifact saves. Queues writers for the same artifact id
  -- before authorize / FOR UPDATE so pool slots are not held in a lock pile-up.
  perform pg_advisory_xact_lock(87, hashtext(p_artifact_id::text));

  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);
  select * into v_artifact from public.artifacts where id = p_artifact_id for update;

  if p_expected_version is not null and p_expected_version <> v_artifact.current_version then
    raise exception using errcode = '40001', message = 'artifact_revision_conflict',
      detail = jsonb_build_object(
        'expected_version', p_expected_version,
        'current_version', v_artifact.current_version
      )::text;
  end if;

  v_title := left(trim(coalesce(nullif(v_snapshot->>'title', ''), v_artifact.title)), 240);
  v_status := left(trim(coalesce(nullif(v_snapshot->>'status', ''), v_artifact.status, 'draft')), 50);
  v_text := coalesce(v_snapshot->>'content_text', v_artifact.content_text, '');
  v_json := case when v_snapshot ? 'content_json' then v_snapshot->'content_json' else v_artifact.content_json end;
  v_assets := case
    when v_snapshot ? 'asset_data' then coalesce(v_snapshot->'asset_data', '{}'::jsonb)
    else coalesce(v_artifact.asset_data, '{}'::jsonb)
  end;
  v_metadata := coalesce(v_artifact.metadata, '{}'::jsonb) || coalesce(v_snapshot->'metadata', '{}'::jsonb);
  v_next := v_artifact.current_version + 1;

  update public.artifacts
  set title = v_title,
      status = v_status,
      content_text = v_text,
      content_json = v_json,
      asset_data = v_assets,
      metadata = v_metadata,
      current_version = v_next,
      updated_at = now()
  where id = v_artifact.id;

  v_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'id', v_artifact.id,
    'task_id', v_artifact.task_id,
    'project_id', v_artifact.project_id,
    'ai_thread_id', v_artifact.ai_thread_id,
    'artifact_type', v_artifact.artifact_type,
    'artifact_role', v_artifact.artifact_role,
    'title', v_title,
    'status', v_status,
    'channel_id', v_artifact.channel_id,
    'language_id', v_artifact.language_id,
    'content_text', v_text,
    'content_json', v_json,
    'asset_data', v_assets,
    'source_artifact_id', v_artifact.source_artifact_id,
    'source_version_number', v_artifact.source_version_number,
    'derivation_type', v_artifact.derivation_type,
    'current_version', v_next,
    'metadata', v_metadata,
    'updated_at', now()
  ));

  insert into public.artifact_versions(
    artifact_id, version_number, snapshot, change_source, changed_by,
    ai_message_id, ai_thread_id, ai_run_id, change_summary, created_at
  ) values (
    v_artifact.id, v_next, v_snapshot,
    left(trim(coalesce(nullif(p_change_source, ''), 'unknown')), 100),
    v_actor, p_ai_message_id, p_ai_thread_id, p_ai_run_id,
    nullif(left(trim(coalesce(p_change_summary, '')), 1000), ''),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'artifact_id', v_artifact.id,
    'version_number', v_next,
    'snapshot', v_snapshot
  );
end;
$function$;

COMMENT ON FUNCTION public.ai_save_workspace_artifact_v2(
  uuid, integer, jsonb, text, integer, uuid, uuid, uuid, text
) IS
  'Optimistic artifact save with per-artifact advisory xact lock to prevent writer stampedes.';
