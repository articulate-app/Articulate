-- Artifacts never carry channel_id (and chat-owned artifacts often lack task/project).
-- 1) v3: resolve generation scope from the work unit so project_templates / task context load.
-- 2) v4: load publication_policy from task_channels or project_channels (never artifact.channel_id).

create or replace function public.ai_get_artifact_generation_context_v3(
  p_build_id uuid,
  p_unit_id uuid,
  p_lease_token uuid,
  p_artifact_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor integer := public.current_user_id();
  v_job public.ai_build_jobs%rowtype;
  v_unit public.ai_build_work_units%rowtype;
  v_artifact public.artifacts%rowtype;
  v_id uuid;
  v_project_id integer;
  v_scope_task_id integer;
  v_task jsonb := '{}'::jsonb;
  v_project jsonb := '{}'::jsonb;
  v_source jsonb := null;
  v_siblings jsonb := '[]'::jsonb;
  v_task_channels jsonb := '[]'::jsonb;
  v_project_templates jsonb := '[]'::jsonb;
  v_publication_policy jsonb := null;
  v_artifact_channel jsonb := null;
  v_artifact_language jsonb := null;
  v_task_keywords jsonb := '{}'::jsonb;
  v_links jsonb := '[]'::jsonb;
  v_site_index jsonb := '{}'::jsonb;
  v_link_query text;
  v_language_code text;
  v_scope_project_id integer;
  v_scope_task jsonb;
  v_scope_language text;
begin
  select * into v_job from public.ai_build_jobs
  where id = p_build_id and (auth.role() = 'service_role' or created_by = v_actor) and status = 'running';
  if not found then raise exception using errcode = '55000', message = 'worker_lease_invalid_or_expired'; end if;

  select * into v_unit from public.ai_build_work_units
  where build_id = p_build_id and id = p_unit_id and status = 'running'
    and lease_token = p_lease_token and lease_expires_at >= now();
  if not found then raise exception using errcode = '55000', message = 'worker_lease_invalid_or_expired'; end if;

  v_id := coalesce(p_artifact_id, nullif(v_unit.input_snapshot->>'artifact_id', '')::uuid);
  if v_id is null or nullif(v_unit.input_snapshot->>'artifact_id', '')::uuid is distinct from v_id then
    raise exception using errcode = '42501', message = 'artifact_not_in_work_unit';
  end if;

  select * into v_artifact from public.artifacts where id = v_id;
  if not found then raise exception using errcode = '22023', message = 'artifact_not_found'; end if;

  if v_artifact.task_id is not null then
    perform public.ai_validate_task_scope(p_task_id => v_artifact.task_id, p_channel_id => null, p_require_write => true);
    select t.project_id_int, to_jsonb(t), t.language_code
      into v_project_id, v_task, v_language_code
    from public.tasks t where t.id = v_artifact.task_id and coalesce(t.is_deleted, false) = false;
    v_task_keywords := jsonb_strip_nulls(jsonb_build_object(
      'primary_keyword', nullif(trim(coalesce(v_task->>'keyword', '')), ''),
      'secondary_keywords', nullif(trim(coalesce(v_task->>'secondary_keywords', '')), ''),
      'meta_title', nullif(trim(coalesce(v_task->>'meta_title', '')), ''),
      'meta_description', nullif(trim(coalesce(v_task->>'meta_description', '')), '')
    ));
  elsif v_artifact.project_id is not null then
    v_project_id := v_artifact.project_id;
    if auth.role() <> 'service_role' and not public.can_edit_project(v_project_id) then
      raise exception using errcode = '42501', message = 'artifact_project_write_forbidden';
    end if;
  else
    if v_artifact.ai_thread_id is distinct from v_job.thread_id then
      raise exception using errcode = '42501', message = 'chat_artifact_not_in_build_thread';
    end if;
    if auth.role() <> 'service_role' and not public.ai_can_post_in_thread(v_artifact.ai_thread_id) then
      raise exception using errcode = '42501', message = 'artifact_thread_write_forbidden';
    end if;
  end if;

  -- Chat-owned artifacts do not store task/project/channel. Use the work unit scope.
  v_scope_task_id := coalesce(
    v_artifact.task_id,
    v_unit.task_id,
    nullif(v_unit.input_snapshot->>'task_id', '')::integer,
    nullif(v_unit.input_snapshot#>>'{artifact_spec,task_id}', '')::integer
  );

  if v_artifact.task_id is null and v_scope_task_id is not null then
    select t.project_id_int, to_jsonb(t), t.language_code
      into v_scope_project_id, v_scope_task, v_scope_language
    from public.tasks t
    where t.id = v_scope_task_id and coalesce(t.is_deleted, false) = false;

    if found then
      v_project_id := coalesce(v_project_id, v_scope_project_id);
      v_task := coalesce(v_scope_task, '{}'::jsonb);
      v_language_code := coalesce(v_language_code, v_scope_language);
      v_task_keywords := jsonb_strip_nulls(jsonb_build_object(
        'primary_keyword', nullif(trim(coalesce(v_task->>'keyword', '')), ''),
        'secondary_keywords', nullif(trim(coalesce(v_task->>'secondary_keywords', '')), ''),
        'meta_title', nullif(trim(coalesce(v_task->>'meta_title', '')), ''),
        'meta_description', nullif(trim(coalesce(v_task->>'meta_description', '')), '')
      ));
    end if;
  end if;

  if v_project_id is null then
    v_project_id := coalesce(
      v_unit.project_id,
      nullif(v_unit.input_snapshot->>'project_id', '')::integer,
      nullif(v_unit.input_snapshot#>>'{artifact_spec,project_id}', '')::integer
    );
    if v_project_id is not null
       and auth.role() <> 'service_role'
       and not public.can_edit_project(v_project_id)
    then
      raise exception using errcode = '42501', message = 'artifact_project_write_forbidden';
    end if;
  end if;

  if v_project_id is not null then
    select to_jsonb(p) into v_project from public.projects p where p.id = v_project_id;
  end if;

  if v_artifact.source_artifact_id is not null then
    if v_artifact.source_version_number is not null then
      select snapshot into v_source from public.artifact_versions
      where artifact_id = v_artifact.source_artifact_id and version_number = v_artifact.source_version_number;
    end if;
    if v_source is null then v_source := public.ai_artifact_snapshot_v2(v_artifact.source_artifact_id); end if;
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', a.id,
    'artifact_type', a.artifact_type,
    'artifact_role', a.artifact_role,
    'title', a.title,
    'status', a.status,
    'task_id', a.task_id,
    'project_id', a.project_id,
    'channel_id', a.channel_id,
    'language_id', a.language_id,
    'current_version', a.current_version,
    'content_preview', left(regexp_replace(coalesce(a.content_text, ''), '\s+', ' ', 'g'), 800),
    'source_artifact_id', a.source_artifact_id,
    'derivation_type', a.derivation_type,
    'updated_at', a.updated_at
  )) order by a.updated_at desc), '[]'::jsonb)
  into v_siblings
  from public.artifacts a
  where a.id <> v_artifact.id
    and (
      (v_artifact.task_id is not null and a.task_id = v_artifact.task_id)
      or (v_artifact.task_id is null and v_artifact.project_id is not null and a.project_id = v_artifact.project_id)
      or (v_artifact.task_id is null and v_artifact.project_id is null and a.ai_thread_id = v_artifact.ai_thread_id)
    );

  if v_scope_task_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.id), '[]'::jsonb)
    into v_task_channels
    from public.task_channels tc join public.channels c on c.id = tc.channel_id
    where tc.task_id = v_scope_task_id;
  end if;

  -- Artifacts never carry channel_id. publication_policy is filled by v4 from task/project channels.
  v_publication_policy := null;
  v_artifact_channel := null;

  if v_artifact.language_id is not null and to_regclass('public.languages') is not null then
    execute $q$
      select jsonb_strip_nulls(jsonb_build_object(
        'id', l.id,
        'name', coalesce(to_jsonb(l)->>'name', to_jsonb(l)->>'title', to_jsonb(l)->>'code', to_jsonb(l)->>'language_code', l.id::text),
        'code', coalesce(to_jsonb(l)->>'code', to_jsonb(l)->>'language_code')
      )) from public.languages l where l.id = $1
    $q$ into v_artifact_language using v_artifact.language_id;
    v_language_code := coalesce(v_artifact_language->>'code', v_language_code);
  end if;

  if v_project_id is not null and to_regclass('public.project_briefing_components') is not null then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'template_id', pbc.id,
      'title', pbc.title,
      'description', pbc.description,
      'rules', to_jsonb(pbc)->'rules',
      'metadata', to_jsonb(pbc) - array['id','project_id','title','description','rules']
    )) order by pbc.id), '[]'::jsonb)
    into v_project_templates
    from public.project_briefing_components pbc
    where pbc.project_id = v_project_id;
  end if;

  if v_project_id is not null and to_regprocedure('public.ai_search_project_site_pages_v1(integer,text,text,integer)') is not null then
    v_link_query := left(concat_ws(' ', v_job.request_text, v_artifact.title, v_artifact.artifact_role, v_task->>'title'), 3000);
    execute 'select public.ai_search_project_site_pages_v1($1,$2,$3,$4)'
      into v_links using v_project_id, v_link_query, nullif(v_language_code, ''), 20;
    if to_regclass('public.project_site_pages') is not null then
      select jsonb_build_object(
        'page_count', count(*) filter (where is_active),
        'project_url', v_project->>'project_url'
      ) into v_site_index
      from public.project_site_pages where project_id = v_project_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'build', jsonb_build_object(
      'id', v_job.id,
      'thread_id', v_job.thread_id,
      'ai_run_id', v_job.ai_run_id,
      'request_text', v_job.request_text,
      'shared_context', v_job.plan->>'shared_context',
      'created_by', v_job.created_by
    ),
    'unit', to_jsonb(v_unit),
    'task', coalesce(v_task, '{}'::jsonb),
    'project', coalesce(v_project, '{}'::jsonb),
    'artifact', public.ai_artifact_snapshot_v2(v_artifact.id),
    'source_artifact', v_source,
    'sibling_artifacts', v_siblings,
    'task_channels', v_task_channels,
    'artifact_channel', v_artifact_channel,
    'artifact_language', v_artifact_language,
    'publication_policy', v_publication_policy,
    'project_templates', v_project_templates,
    'task_keywords', v_task_keywords,
    'internal_link_candidates', coalesce(v_links, '[]'::jsonb),
    'site_index', coalesce(v_site_index, '{}'::jsonb),
    'chat_workspace', case when v_artifact.ai_thread_id is not null then jsonb_build_object('thread_id', v_artifact.ai_thread_id) else null end,
    'generation_scope', jsonb_strip_nulls(jsonb_build_object(
      'task_id', v_scope_task_id,
      'project_id', v_project_id,
      'source', case
        when v_artifact.task_id is not null then 'artifact_task'
        when v_artifact.project_id is not null then 'artifact_project'
        when v_scope_task_id is not null then 'work_unit_task'
        when v_project_id is not null then 'work_unit_project'
        else 'thread'
      end
    ))
  );
end;
$$;

create or replace function public.ai_get_artifact_generation_context_v4(
  p_build_id uuid,
  p_unit_id uuid,
  p_lease_token uuid,
  p_artifact_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_base jsonb;
  v_artifact jsonb;
  v_unit jsonb;
  v_task_id integer;
  v_project_id integer;
  v_thread_id uuid;
  v_explicit_ids uuid[] := '{}'::uuid[];
  v_sources jsonb := '[]'::jsonb;
  v_task_keywords jsonb := '{}'::jsonb;
  v_channel_ids integer[] := '{}'::integer[];
  v_channel_rows jsonb := '[]'::jsonb;
  v_publication_policy jsonb := null;
  v_project_templates jsonb := '[]'::jsonb;
  v_templates_enriched jsonb := '[]'::jsonb;
  v_channel_id integer;
  v_channel_name text;
  v_policy jsonb;
  v_policies_by_channel jsonb := '[]'::jsonb;
  v_required_all jsonb := '[]'::jsonb;
begin
  v_base := public.ai_get_artifact_generation_context_v3(p_build_id, p_unit_id, p_lease_token, p_artifact_id);
  if coalesce((v_base->>'ok')::boolean, true) is false then return v_base; end if;
  v_artifact := coalesce(v_base->'artifact', '{}'::jsonb);
  v_unit := coalesce(v_base->'unit', '{}'::jsonb);
  v_task_id := coalesce(
    nullif(v_base#>>'{generation_scope,task_id}', '')::integer,
    nullif(v_artifact->>'task_id', '')::integer,
    nullif(v_unit->>'task_id', '')::integer,
    nullif(v_unit#>>'{input_snapshot,task_id}', '')::integer,
    nullif(v_unit#>>'{input_snapshot,artifact_spec,task_id}', '')::integer
  );
  v_project_id := coalesce(
    nullif(v_base#>>'{generation_scope,project_id}', '')::integer,
    nullif(v_artifact->>'project_id', '')::integer,
    nullif(v_base#>>'{project,id}', '')::integer,
    nullif(v_base#>>'{task,project_id_int}', '')::integer,
    nullif(v_unit->>'project_id', '')::integer,
    nullif(v_unit#>>'{input_snapshot,project_id}', '')::integer,
    nullif(v_unit#>>'{input_snapshot,artifact_spec,project_id}', '')::integer
  );
  v_thread_id := nullif(v_artifact->>'ai_thread_id', '')::uuid;

  -- Normalize to keyword-only shape regardless of older v3 payload contents.
  v_task_keywords := jsonb_strip_nulls(jsonb_build_object(
    'primary_keyword', nullif(trim(coalesce(
      v_base#>>'{task_keywords,primary_keyword}',
      v_base#>>'{task,keyword}',
      ''
    )), ''),
    'secondary_keywords', nullif(trim(coalesce(
      v_base#>>'{task_keywords,secondary_keywords}',
      v_base#>>'{task,secondary_keywords}',
      ''
    )), '')
  ));

  if jsonb_typeof(v_base#>'{unit,input_snapshot,artifact_spec,source_ids}') = 'array' then
    select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_explicit_ids
    from jsonb_array_elements_text(v_base#>'{unit,input_snapshot,artifact_spec,source_ids}')
    where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;

  select coalesce(jsonb_agg(row_data order by explicit_first desc, updated_at desc), '[]'::jsonb)
  into v_sources
  from (
    select
      (s.id = any(v_explicit_ids)) as explicit_first,
      s.updated_at,
      jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'source_type', s.source_type,
        'source_url', s.source_url,
        'attachment_id', s.attachment_id,
        'task_id', s.task_id,
        'project_id', s.project_id,
        'ai_thread_id', s.ai_thread_id,
        'current_version', s.current_version,
        'content_preview', left(regexp_replace(coalesce(s.content_text, ''), '\s+', ' ', 'g'), 5000),
        'metadata', s.metadata,
        'app_link', 'app://source/' || s.id::text
      ) as row_data
    from public.sources s
    where public.ai_can_access_source_scope_v1(s.id, false)
      and (
        s.id = any(v_explicit_ids)
        or (v_task_id is not null and s.task_id = v_task_id)
        or (v_project_id is not null and s.project_id = v_project_id)
        or (v_thread_id is not null and s.ai_thread_id = v_thread_id)
      )
    order by explicit_first desc, s.updated_at desc
    limit 50
  ) q;

  -- Channel set for policies: never from artifact.channel_id.
  if v_task_id is not null then
    select
      coalesce(array_agg(tc.channel_id order by tc.channel_id), '{}'::integer[]),
      coalesce(
        jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.id),
        '[]'::jsonb
      )
    into v_channel_ids, v_channel_rows
    from public.task_channels tc
    join public.channels c on c.id = tc.channel_id
    where tc.task_id = v_task_id;
  end if;

  if (v_channel_ids is null or cardinality(v_channel_ids) = 0) and v_project_id is not null then
    select
      coalesce(array_agg(pc.channel_id order by pc.channel_id), '{}'::integer[]),
      coalesce(
        jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.id),
        '[]'::jsonb
      )
    into v_channel_ids, v_channel_rows
    from public.project_channels pc
    join public.channels c on c.id = pc.channel_id
    where pc.project_id = v_project_id
      and coalesce(pc.is_enabled, true) = true;
  end if;

  -- Optional explicit channel hints from the work-unit spec (still not artifact.channel_id).
  if jsonb_typeof(v_unit#>'{input_snapshot,artifact_spec,channel_ids}') = 'array' then
    select coalesce(array_agg(distinct value::integer), v_channel_ids)
    into v_channel_ids
    from (
      select unnest(coalesce(v_channel_ids, '{}'::integer[])) as value
      union
      select value::integer
      from jsonb_array_elements_text(v_unit#>'{input_snapshot,artifact_spec,channel_ids}')
      where value ~ '^[0-9]+$'
    ) q;
  elsif nullif(v_unit#>>'{input_snapshot,artifact_spec,channel_id}', '') ~ '^[0-9]+$' then
    v_channel_ids := array(
      select distinct x
      from unnest(
        coalesce(v_channel_ids, '{}'::integer[])
        || array[nullif(v_unit#>>'{input_snapshot,artifact_spec,channel_id}', '')::integer]
      ) as x
      where x is not null
    );
  end if;

  if v_project_id is not null
     and v_channel_ids is not null
     and cardinality(v_channel_ids) > 0
     and to_regprocedure('public.ai_get_effective_channel_component_policy_v1(integer,integer)') is not null
  then
    foreach v_channel_id in array v_channel_ids loop
      begin
        v_policy := public.ai_get_effective_channel_component_policy_v1(v_project_id, v_channel_id);
      exception when others then
        v_policy := jsonb_build_object(
          'ok', false,
          'project_id', v_project_id,
          'channel_id', v_channel_id,
          'error', SQLERRM
        );
      end;

      select c.name into v_channel_name from public.channels c where c.id = v_channel_id;
      v_policies_by_channel := v_policies_by_channel || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'channel_id', v_channel_id,
          'channel_name', v_channel_name,
          'ok', coalesce((v_policy->>'ok')::boolean, false),
          'policies', coalesce(v_policy->'policies', '[]'::jsonb),
          'required_components', coalesce(v_policy->'required_components', '[]'::jsonb),
          'excluded_components', coalesce(v_policy->'excluded_components', '[]'::jsonb)
        ))
      );

      if jsonb_typeof(v_policy->'required_components') = 'array' then
        select coalesce(jsonb_agg(value), '[]'::jsonb)
        into v_required_all
        from (
          select value
          from jsonb_array_elements(coalesce(v_required_all, '[]'::jsonb))
          union all
          select value || jsonb_build_object(
            'channel_id', v_channel_id,
            'channel_name', v_channel_name
          )
          from jsonb_array_elements(v_policy->'required_components')
        ) q;
      end if;
    end loop;

    v_publication_policy := jsonb_build_object(
      'ok', true,
      'project_id', v_project_id,
      'source', case when v_task_id is not null then 'task_channels' else 'project_channels' end,
      'channels', coalesce(v_channel_rows, '[]'::jsonb),
      'by_channel', v_policies_by_channel,
      'required_components', coalesce(v_required_all, '[]'::jsonb),
      'policy_version', 2
    );
  end if;

  -- Annotate flat project templates with channel policies (required/optional/excluded).
  v_project_templates := coalesce(v_base->'project_templates', '[]'::jsonb);
  if jsonb_typeof(v_project_templates) = 'array'
     and jsonb_array_length(v_project_templates) = 0
     and v_project_id is not null
     and to_regclass('public.project_briefing_components') is not null
  then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'template_id', pbc.id,
      'title', pbc.title,
      'description', pbc.description,
      'rules', to_jsonb(pbc)->'rules',
      'metadata', to_jsonb(pbc) - array['id','project_id','title','description','rules']
    )) order by pbc.id), '[]'::jsonb)
    into v_project_templates
    from public.project_briefing_components pbc
    where pbc.project_id = v_project_id;
  end if;

  if jsonb_typeof(v_project_templates) = 'array' and jsonb_typeof(v_policies_by_channel) = 'array' then
    select coalesce(jsonb_agg(
      tmpl || jsonb_build_object(
        'channel_policies', coalesce((
          select jsonb_agg(jsonb_build_object(
            'channel_id', ch->>'channel_id',
            'channel_name', ch->>'channel_name',
            'policy', pol->>'policy',
            'guidance', pol->'guidance',
            'rules', pol->'rules'
          ) order by (ch->>'channel_id')::integer)
          from jsonb_array_elements(v_policies_by_channel) ch
          cross join lateral jsonb_array_elements(coalesce(ch->'policies', '[]'::jsonb)) pol
          where (
            (tmpl ? 'template_id' and pol->>'project_component_id' = tmpl->>'template_id')
            or (tmpl ? 'title' and pol->>'title' = tmpl->>'title')
          )
        ), '[]'::jsonb)
      )
      order by (tmpl->>'template_id')
    ), v_project_templates)
    into v_templates_enriched
    from jsonb_array_elements(v_project_templates) tmpl;
  else
    v_templates_enriched := v_project_templates;
  end if;

  return v_base || jsonb_strip_nulls(jsonb_build_object(
    'task_keywords', v_task_keywords,
    'sources', v_sources,
    'task_channels', case
      when v_task_id is not null then coalesce(v_channel_rows, v_base->'task_channels')
      else v_base->'task_channels'
    end,
    'project_channels', case
      when v_task_id is null then coalesce(v_channel_rows, '[]'::jsonb)
      else null
    end,
    'publication_policy', coalesce(v_publication_policy, v_base->'publication_policy'),
    'project_templates', v_templates_enriched
  ));
end;
$$;

grant execute on function public.ai_get_artifact_generation_context_v3(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.ai_get_artifact_generation_context_v4(uuid, uuid, uuid, uuid) to authenticated, service_role;
