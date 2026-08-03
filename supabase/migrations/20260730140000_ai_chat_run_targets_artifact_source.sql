-- Allow artifact and source run targets (frontend already sends these).
-- Also accept explicit_click / text_selection sources used by the composer.

ALTER TABLE public.ai_chat_run_targets
  ADD COLUMN IF NOT EXISTS artifact_id uuid,
  ADD COLUMN IF NOT EXISTS artifact_version_number integer,
  ADD COLUMN IF NOT EXISTS source_id uuid;

ALTER TABLE public.ai_chat_run_targets
  DROP CONSTRAINT IF EXISTS ai_chat_run_targets_target_kind_check;

ALTER TABLE public.ai_chat_run_targets
  ADD CONSTRAINT ai_chat_run_targets_target_kind_check
  CHECK (target_kind = ANY (ARRAY[
    'project'::text,
    'task'::text,
    'channel'::text,
    'component'::text,
    'output'::text,
    'user'::text,
    'attachment'::text,
    'artifact'::text,
    'source'::text
  ]));

ALTER TABLE public.ai_chat_run_targets
  DROP CONSTRAINT IF EXISTS ai_chat_run_targets_source_check;

ALTER TABLE public.ai_chat_run_targets
  ADD CONSTRAINT ai_chat_run_targets_source_check
  CHECK (source = ANY (ARRAY[
    'explicit_tag'::text,
    'explicit_selection'::text,
    'explicit_click'::text,
    'text_selection'::text,
    'message_resolution'::text,
    'ambient'::text,
    'user_confirmation'::text,
    'frontend'::text,
    'thread_read'::text
  ]));

ALTER TABLE public.ai_chat_run_targets
  DROP CONSTRAINT IF EXISTS ai_chat_run_targets_check;

ALTER TABLE public.ai_chat_run_targets
  ADD CONSTRAINT ai_chat_run_targets_check
  CHECK (
    (
      (target_kind = 'project'::text)
      AND (project_id IS NOT NULL)
      AND (task_id IS NULL)
      AND (user_id IS NULL)
      AND (artifact_id IS NULL)
      AND (source_id IS NULL)
    )
    OR (
      (target_kind = 'task'::text)
      AND (task_id IS NOT NULL)
      AND (user_id IS NULL)
      AND (artifact_id IS NULL)
      AND (source_id IS NULL)
    )
    OR (
      (target_kind = 'channel'::text)
      AND (task_id IS NOT NULL)
      AND (channel_id IS NOT NULL)
      AND (user_id IS NULL)
      AND (artifact_id IS NULL)
      AND (source_id IS NULL)
    )
    OR (
      (target_kind = 'component'::text)
      AND (task_id IS NOT NULL)
      AND (channel_id IS NOT NULL)
      AND (component_id IS NOT NULL)
      AND (user_id IS NULL)
      AND (artifact_id IS NULL)
      AND (source_id IS NULL)
    )
    OR (
      (target_kind = 'output'::text)
      AND (task_id IS NOT NULL)
      AND (channel_id IS NOT NULL)
      AND (output_id IS NOT NULL)
      AND (user_id IS NULL)
      AND (artifact_id IS NULL)
      AND (source_id IS NULL)
    )
    OR (
      (target_kind = 'user'::text)
      AND (user_id IS NOT NULL)
      AND (project_id IS NULL)
      AND (task_id IS NULL)
      AND (artifact_id IS NULL)
      AND (source_id IS NULL)
    )
    OR (
      (target_kind = 'attachment'::text)
      AND (attachment_id IS NOT NULL)
      AND (user_id IS NULL)
      AND (artifact_id IS NULL)
      AND (source_id IS NULL)
    )
    OR (
      (target_kind = 'artifact'::text)
      AND (artifact_id IS NOT NULL)
      AND (user_id IS NULL)
      AND (attachment_id IS NULL)
      AND (source_id IS NULL)
      AND (component_id IS NULL)
      AND (output_id IS NULL)
    )
    OR (
      (target_kind = 'source'::text)
      AND (source_id IS NOT NULL)
      AND (user_id IS NULL)
      AND (attachment_id IS NULL)
      AND (artifact_id IS NULL)
      AND (component_id IS NULL)
      AND (output_id IS NULL)
    )
  );

DROP INDEX IF EXISTS public.ai_chat_run_targets_identity_uniq;

CREATE UNIQUE INDEX ai_chat_run_targets_identity_uniq
  ON public.ai_chat_run_targets
  USING btree (
    run_id,
    target_kind,
    COALESCE(project_id, 0),
    COALESCE(task_id, 0),
    COALESCE(channel_id, 0),
    COALESCE(component_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(output_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(user_id, 0),
    COALESCE(attachment_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(artifact_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS ai_chat_run_targets_artifact_idx
  ON public.ai_chat_run_targets USING btree (run_id, artifact_id);

CREATE INDEX IF NOT EXISTS ai_chat_run_targets_source_idx
  ON public.ai_chat_run_targets USING btree (run_id, source_id);

CREATE OR REPLACE FUNCTION public.ai_register_chat_run_targets(p_run_id uuid, p_targets jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor integer := current_user_id();
  v_run public.ai_chat_runs%rowtype;
  v_item jsonb;
  v_kind text;
  v_source text;
  v_project_id integer;
  v_task_id integer;
  v_channel_id integer;
  v_component_id uuid;
  v_output_id uuid;
  v_user_id integer;
  v_attachment_id uuid;
  v_artifact_id uuid;
  v_artifact_version_number integer;
  v_source_id uuid;
  v_allow_write boolean;
  v_allow_descendants boolean;
  v_expected_output_id uuid;
  v_expected_revision timestamptz;
  v_validated jsonb;
  v_existing_id uuid;
  v_registered jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_artifact public.artifacts%rowtype;
  v_source_row public.sources%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_run_id is null or jsonb_typeof(coalesce(p_targets, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_run_targets';
  end if;

  select * into strict v_run
  from public.ai_chat_runs
  where id = p_run_id and created_by = v_actor
  for update;

  if v_run.status not in ('accepted', 'running') then
    raise exception using errcode = '55000', message = 'run_not_active';
  end if;
  if jsonb_array_length(p_targets) > 200 then
    raise exception using errcode = '22023', message = 'too_many_run_targets';
  end if;

  for v_item in select value from jsonb_array_elements(p_targets)
  loop
    v_count := v_count + 1;
    v_kind := nullif(v_item->>'target_kind', '');
    v_source := coalesce(nullif(v_item->>'source', ''), 'frontend');
    if v_source not in (
      'explicit_tag',
      'explicit_selection',
      'explicit_click',
      'text_selection',
      'message_resolution',
      'ambient',
      'user_confirmation',
      'frontend',
      'thread_read'
    ) then
      raise exception using errcode = '22023', message = 'invalid_target_source';
    end if;
    if v_kind not in (
      'project',
      'task',
      'channel',
      'component',
      'output',
      'user',
      'attachment',
      'artifact',
      'source'
    ) then
      raise exception using errcode = '22023', message = 'invalid_target_kind';
    end if;

    v_project_id := nullif(v_item->>'project_id', '')::integer;
    if v_project_id is not null and v_project_id <= 0 then v_project_id := null; end if;
    v_task_id := nullif(v_item->>'task_id', '')::integer;
    if v_task_id is not null and v_task_id <= 0 then v_task_id := null; end if;
    v_channel_id := nullif(v_item->>'channel_id', '')::integer;
    if v_channel_id is not null and v_channel_id <= 0 then v_channel_id := null; end if;
    v_component_id := nullif(v_item->>'component_id', '')::uuid;
    v_output_id := nullif(coalesce(v_item->>'output_id', v_item->>'task_component_output_id'), '')::uuid;
    v_user_id := nullif(v_item->>'user_id', '')::integer;
    if v_user_id is not null and v_user_id <= 0 then v_user_id := null; end if;
    v_attachment_id := nullif(v_item->>'attachment_id', '')::uuid;
    v_artifact_id := nullif(v_item->>'artifact_id', '')::uuid;
    v_artifact_version_number := nullif(v_item->>'artifact_version_number', '')::integer;
    if v_artifact_version_number is not null and v_artifact_version_number <= 0 then
      v_artifact_version_number := null;
    end if;
    v_source_id := nullif(v_item->>'source_id', '')::uuid;
    v_allow_write := coalesce((v_item->>'allow_write')::boolean, false) and v_source <> 'thread_read';
    v_allow_descendants := coalesce((v_item->>'allow_descendants')::boolean, false) and v_kind = 'project';
    v_expected_output_id := null;
    v_expected_revision := null;

    if v_kind = 'project' then
      if v_project_id is null or not public.ai_can_read_project(v_project_id) then
        raise exception using errcode = '42501', message = 'project_read_forbidden';
      end if;
      if v_allow_write and not public.can_edit_project(v_project_id) then
        raise exception using errcode = '42501', message = 'project_write_forbidden';
      end if;
      v_task_id := null; v_channel_id := null; v_component_id := null; v_output_id := null;
      v_user_id := null; v_attachment_id := null; v_artifact_id := null; v_artifact_version_number := null; v_source_id := null;
    elsif v_kind in ('task', 'channel', 'component', 'output') then
      v_validated := public.ai_validate_task_scope(
        v_task_id,
        case when v_kind in ('channel', 'component', 'output') then v_channel_id else null end,
        case when v_kind in ('component', 'output') then v_component_id else null end,
        case when v_kind = 'output' then v_output_id else null end,
        v_allow_write
      );
      v_project_id := (v_validated->>'project_id')::integer;
      v_task_id := (v_validated->>'task_id')::integer;
      v_expected_output_id := nullif(v_validated->>'task_component_output_id', '')::uuid;
      v_expected_revision := nullif(v_validated->>'output_revision', '')::timestamptz;
      if v_kind in ('channel', 'component', 'output') then v_channel_id := (v_validated->>'channel_id')::integer; else v_channel_id := null; end if;
      if v_kind in ('component', 'output') then v_component_id := nullif(v_validated->>'component_id', '')::uuid; else v_component_id := null; end if;
      if v_kind = 'output' then v_output_id := nullif(v_validated->>'task_component_output_id', '')::uuid; else v_output_id := null; end if;
      v_user_id := null; v_attachment_id := null; v_artifact_id := null; v_artifact_version_number := null; v_source_id := null;
    elsif v_kind = 'user' then
      if v_user_id is null or not public.ai_can_read_user(v_user_id) then
        raise exception using errcode = '42501', message = 'user_read_forbidden';
      end if;
      if v_allow_write and not public.ai_can_write_user(v_user_id) then
        raise exception using errcode = '42501', message = 'user_write_forbidden';
      end if;
      v_project_id := null; v_task_id := null; v_channel_id := null; v_component_id := null; v_output_id := null;
      v_attachment_id := null; v_artifact_id := null; v_artifact_version_number := null; v_source_id := null;
    elsif v_kind = 'artifact' then
      if v_artifact_id is null then
        raise exception using errcode = '22023', message = 'artifact_id_required';
      end if;
      v_artifact := public.ai_authorize_artifact_v2(v_artifact_id, v_allow_write);
      v_project_id := v_artifact.project_id;
      v_task_id := v_artifact.task_id;
      if v_artifact_version_number is null then
        v_artifact_version_number := nullif(v_artifact.current_version, 0);
      end if;
      v_channel_id := null; v_component_id := null; v_output_id := null;
      v_user_id := null; v_attachment_id := null; v_source_id := null;
    elsif v_kind = 'source' then
      if v_source_id is null then
        raise exception using errcode = '22023', message = 'source_id_required';
      end if;
      v_source_row := public.ai_authorize_source_v1(v_source_id, v_allow_write);
      v_project_id := v_source_row.project_id;
      v_task_id := v_source_row.task_id;
      v_channel_id := null; v_component_id := null; v_output_id := null;
      v_user_id := null; v_attachment_id := null; v_artifact_id := null; v_artifact_version_number := null;
    else
      if v_attachment_id is null or not exists (
        select 1 from public.attachments a
        where a.id = v_attachment_id
          and (
            a.uploaded_by = v_actor
            or (
              a.table_name in ('tasks', 'task')
              and a.record_id ~ '^[0-9]+$'
              and public.ai_can_read_task(a.record_id::integer)
            )
            or (
              a.table_name in ('projects', 'project')
              and a.record_id ~ '^[0-9]+$'
              and public.ai_can_read_project(a.record_id::integer)
            )
            or (a.table_name = 'ai_messages' and exists (
              select 1 from public.ai_messages m
              join public.ai_threads th on th.id = m.thread_id
              where m.id::text = a.record_id and public.ai_can_read_thread(th.id)
            ))
          )
      ) then
        raise exception using errcode = '42501', message = 'attachment_read_forbidden';
      end if;
      v_allow_write := false;
      v_project_id := null; v_task_id := null; v_channel_id := null; v_component_id := null; v_output_id := null;
      v_user_id := null; v_artifact_id := null; v_artifact_version_number := null; v_source_id := null;
    end if;

    select id into v_existing_id
    from public.ai_chat_run_targets t
    where t.run_id = p_run_id
      and t.target_kind = v_kind
      and t.project_id is not distinct from v_project_id
      and t.task_id is not distinct from v_task_id
      and t.channel_id is not distinct from v_channel_id
      and t.component_id is not distinct from v_component_id
      and t.output_id is not distinct from v_output_id
      and t.user_id is not distinct from v_user_id
      and t.attachment_id is not distinct from v_attachment_id
      and t.artifact_id is not distinct from v_artifact_id
      and t.source_id is not distinct from v_source_id
    limit 1;

    if v_existing_id is null then
      insert into public.ai_chat_run_targets (
        run_id, target_kind, project_id, task_id, channel_id, component_id, output_id,
        user_id, attachment_id, artifact_id, artifact_version_number, source_id,
        source, allow_read, allow_write, allow_descendants,
        expected_output_id, expected_revision, label, created_by
      ) values (
        p_run_id, v_kind, v_project_id, v_task_id, v_channel_id, v_component_id, v_output_id,
        v_user_id, v_attachment_id, v_artifact_id, v_artifact_version_number, v_source_id,
        v_source, true, v_allow_write, v_allow_descendants,
        v_expected_output_id, v_expected_revision, nullif(v_item->>'label', ''), v_actor
      ) returning id into v_existing_id;
    else
      update public.ai_chat_run_targets
      set allow_write = allow_write or v_allow_write,
          allow_descendants = allow_descendants or v_allow_descendants,
          expected_output_id = coalesce(expected_output_id, v_expected_output_id),
          expected_revision = coalesce(expected_revision, v_expected_revision),
          artifact_version_number = coalesce(artifact_version_number, v_artifact_version_number),
          source = case when source = 'thread_read' then v_source else source end,
          label = coalesce(nullif(v_item->>'label', ''), label),
          updated_at = now()
      where id = v_existing_id;
    end if;

    v_registered := v_registered || jsonb_build_array(jsonb_build_object(
      'id', v_existing_id,
      'target_kind', v_kind,
      'project_id', v_project_id,
      'task_id', v_task_id,
      'channel_id', v_channel_id,
      'component_id', v_component_id,
      'output_id', v_output_id,
      'user_id', v_user_id,
      'attachment_id', v_attachment_id,
      'artifact_id', v_artifact_id,
      'artifact_version_number', v_artifact_version_number,
      'source_id', v_source_id,
      'source', v_source,
      'allow_write', v_allow_write,
      'allow_descendants', v_allow_descendants,
      'expected_output_id', v_expected_output_id,
      'expected_revision', v_expected_revision
    ));
  end loop;

  return jsonb_build_object('run_id', p_run_id, 'registered_count', v_count, 'targets', v_registered);
end;
$function$;
