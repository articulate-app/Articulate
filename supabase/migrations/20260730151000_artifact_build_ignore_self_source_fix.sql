-- In-place artifact updates must not set source_artifact_id = id
-- (check constraint task_artifacts_source_not_self). Models often pass the
-- tagged artifact as both target and source when asked to "improve" it.
-- Also ignore self source_handle edges so dependency validation does not
-- treat an in-place update as a cycle.

create or replace function public.ai_sanitize_artifact_plan_self_sources_v1(p_artifacts jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_out jsonb := '[]'::jsonb;
  v_spec jsonb;
  v_handle text;
  v_artifact_id text;
  v_source_id text;
  v_source_handle text;
begin
  if jsonb_typeof(p_artifacts) is distinct from 'array' then
    return p_artifacts;
  end if;

  for v_spec in select value from jsonb_array_elements(p_artifacts)
  loop
    v_handle := nullif(trim(coalesce(v_spec->>'handle', '')), '');
    v_artifact_id := nullif(trim(coalesce(v_spec->>'artifact_id', '')), '');
    v_source_id := nullif(trim(coalesce(v_spec->>'source_artifact_id', '')), '');
    v_source_handle := nullif(trim(coalesce(v_spec->>'source_handle', '')), '');

    if v_source_id is not null and v_artifact_id is not null and v_source_id = v_artifact_id then
      v_spec := v_spec - 'source_artifact_id';
      v_spec := v_spec - 'source_version_number';
      if coalesce(v_spec->>'derivation_type', '') = '' then
        v_spec := v_spec - 'derivation_type';
      end if;
      v_source_id := null;
    end if;

    if v_source_handle is not null and v_handle is not null and v_source_handle = v_handle then
      v_spec := v_spec - 'source_handle';
      v_source_handle := null;
    end if;

    -- Drop self entries from depends_on_handles.
    if jsonb_typeof(v_spec->'depends_on_handles') = 'array' and v_handle is not null then
      v_spec := jsonb_set(
        v_spec,
        '{depends_on_handles}',
        coalesce((
          select jsonb_agg(to_jsonb(dep))
          from jsonb_array_elements_text(v_spec->'depends_on_handles') dep
          where trim(dep) <> '' and trim(dep) <> v_handle
        ), '[]'::jsonb),
        true
      );
    end if;

    v_out := v_out || jsonb_build_array(v_spec);
  end loop;

  return v_out;
end;
$function$;

create or replace function public.ai_validate_artifact_plan_dependencies_v1(p_artifacts jsonb)
returns void
language plpgsql
immutable
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_missing text;
  v_artifacts jsonb := public.ai_sanitize_artifact_plan_self_sources_v1(p_artifacts);
begin
  if jsonb_typeof(v_artifacts) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'artifact_plan_required';
  end if;

  if exists (
    select 1
    from (
      select trim(value->>'handle') as handle, count(*) as n
      from jsonb_array_elements(v_artifacts)
      group by trim(value->>'handle')
    ) d
    where coalesce(d.handle, '') = '' or d.n > 1
  ) then
    raise exception using errcode = '22023', message = 'artifact_handle_required_and_unique';
  end if;

  with handles as (
    select trim(value->>'handle') as handle
    from jsonb_array_elements(v_artifacts)
  ), refs as (
    select trim(spec->>'handle') as owner_handle, trim(dep.value) as referenced_handle
    from jsonb_array_elements(v_artifacts) spec
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(spec->'depends_on_handles') = 'array'
        then spec->'depends_on_handles' else '[]'::jsonb end
    ) dep
    union all
    select trim(spec->>'handle'), trim(spec->>'source_handle')
    from jsonb_array_elements(v_artifacts) spec
    where nullif(trim(coalesce(spec->>'source_handle', '')), '') is not null
  )
  select r.referenced_handle into v_missing
  from refs r
  left join handles h on h.handle = r.referenced_handle
  where h.handle is null
  limit 1;

  if v_missing is not null then
    raise exception using errcode = '22023', message = 'artifact_dependency_handle_not_found', detail = v_missing;
  end if;

  if exists (
    with recursive edges as (
      select trim(spec->>'handle') as source_handle, trim(dep.value) as target_handle
      from jsonb_array_elements(v_artifacts) spec
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(spec->'depends_on_handles') = 'array'
          then spec->'depends_on_handles' else '[]'::jsonb end
      ) dep
      union
      select trim(spec->>'handle'), trim(spec->>'source_handle')
      from jsonb_array_elements(v_artifacts) spec
      where nullif(trim(coalesce(spec->>'source_handle', '')), '') is not null
    ), walk(origin_handle, current_handle, path, cycle) as (
      select e.source_handle, e.target_handle, array[e.source_handle, e.target_handle], e.source_handle = e.target_handle
      from edges e
      union all
      select w.origin_handle,
             e.target_handle,
             w.path || e.target_handle,
             e.target_handle = any(w.path)
      from walk w
      join edges e on e.source_handle = w.current_handle
      where not w.cycle and cardinality(w.path) <= 102
    )
    select 1 from walk where cycle limit 1
  ) then
    raise exception using errcode = '22023', message = 'artifact_dependency_cycle';
  end if;
end;
$function$;


-- Patch ai_create_artifact_build_v2 to sanitize plans and ignore self-sources.
do $patch_v2$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ai_create_artifact_build_v2'
  order by p.oid
  limit 1;

  if v_def is null then
    raise exception 'ai_create_artifact_build_v2 not found';
  end if;

  if position('ai_sanitize_artifact_plan_self_sources_v1' in v_def) = 0 then
    v_next := replace(
      v_def,
      'perform public.ai_validate_artifact_plan_dependencies_v1(p_plan->''artifacts'');',
      $frag$p_plan := jsonb_set(
    coalesce(p_plan, '{}'::jsonb),
    '{artifacts}',
    public.ai_sanitize_artifact_plan_self_sources_v1(coalesce(p_plan->'artifacts', '[]'::jsonb)),
    true
  );
  perform public.ai_validate_artifact_plan_dependencies_v1(p_plan->'artifacts');$frag$
    );
    if v_next is not distinct from v_def then
      raise exception 'failed to inject sanitize call into ai_create_artifact_build_v2';
    end if;
    v_def := v_next;
  end if;

  if position('In-place updates must not set source_artifact_id' in v_def) = 0 then
    v_next := replace(
      v_def,
      $frag$if v_source_handle is not null then v_source_id := (v_handle_map->>v_source_handle)::uuid; end if;
    if v_source_id is not null then$frag$,
      $frag$if v_source_handle is not null then v_source_id := (v_handle_map->>v_source_handle)::uuid; end if;
    -- In-place updates must not set source_artifact_id = id (task_artifacts_source_not_self).
    if v_source_id is not null and v_source_id = v_artifact_id then
      v_source_id := null;
    end if;
    if v_source_id is not null then$frag$
    );
    if v_next is not distinct from v_def then
      raise exception 'failed to inject self-source skip into ai_create_artifact_build_v2';
    end if;
    v_def := v_next;
  end if;

  if position('v_source_handle is distinct from trim(coalesce(v_spec' in v_def) = 0 then
    v_next := replace(
      v_def,
      $frag$v_source_handle := nullif(trim(coalesce(v_spec->>'source_handle', '')), '');
    if v_source_handle is not null and not (v_unit_map->>v_source_handle = any(v_depends)) then
      v_depends := array_append(v_depends, v_unit_map->>v_source_handle);
    end if;$frag$,
      $frag$v_source_handle := nullif(trim(coalesce(v_spec->>'source_handle', '')), '');
    if v_source_handle is not null
       and v_source_handle is distinct from trim(coalesce(v_spec->>'handle', ''))
       and not (v_unit_map->>v_source_handle = any(v_depends)) then
      v_depends := array_append(v_depends, v_unit_map->>v_source_handle);
    end if;$frag$
    );
    if v_next is not distinct from v_def then
      raise exception 'failed to inject self-dependency skip into ai_create_artifact_build_v2';
    end if;
    v_def := v_next;
  end if;

  execute v_def;
end;
$patch_v2$;

-- Same self-source skip for legacy v1.
do $patch_v1$
declare
  v_def text;
  v_next text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ai_create_artifact_build_v1'
  order by p.oid
  limit 1;

  if v_def is null then
    raise notice 'ai_create_artifact_build_v1 not found — skipped';
    return;
  end if;

  if position('ai_sanitize_artifact_plan_self_sources_v1' in v_def) = 0 then
    v_next := replace(
      v_def,
      'perform public.ai_validate_artifact_plan_dependencies_v1(p_plan->''artifacts'');',
      $frag$p_plan := jsonb_set(
    coalesce(p_plan, '{}'::jsonb),
    '{artifacts}',
    public.ai_sanitize_artifact_plan_self_sources_v1(coalesce(p_plan->'artifacts', '[]'::jsonb)),
    true
  );
  perform public.ai_validate_artifact_plan_dependencies_v1(p_plan->'artifacts');$frag$
    );
    if v_next is not distinct from v_def then
      raise exception 'failed to inject sanitize call into ai_create_artifact_build_v1';
    end if;
    v_def := v_next;
  end if;

  if position('In-place updates must not set source_artifact_id' in v_def) = 0 then
    v_next := replace(
      v_def,
      $frag$if v_source_artifact_id is not null then
      select a.task_id, a.current_version
      into v_source_task_id, v_source_current_version
      from public.artifacts a
      where a.id = v_source_artifact_id;$frag$,
      $frag$-- In-place updates must not set source_artifact_id = id (task_artifacts_source_not_self).
    if v_source_artifact_id is not null and v_source_artifact_id = v_artifact_id then
      v_source_artifact_id := null;
    end if;
    if v_source_artifact_id is not null then
      select a.task_id, a.current_version
      into v_source_task_id, v_source_current_version
      from public.artifacts a
      where a.id = v_source_artifact_id;$frag$
    );
    if v_next is not distinct from v_def then
      raise exception 'failed to inject self-source skip into ai_create_artifact_build_v1';
    end if;
    v_def := v_next;
  end if;

  execute v_def;
end;
$patch_v1$;

