-- Artifacts: display order + soft delete + reorder

alter table public.artifacts
  add column if not exists sort_order integer not null default 0;

comment on column public.artifacts.sort_order is
  'Manual display order within the owning task/project/thread scope (lower first).';

-- Backfill existing rows per ownership scope by created_at
with ranked as (
  select
    id,
    row_number() over (
      partition by
        coalesce(task_id::text, ''),
        coalesce(project_id::text, ''),
        coalesce(ai_thread_id::text, '')
      order by created_at asc nulls last, id asc
    ) as rn
  from public.artifacts
  where coalesce(sort_order, 0) = 0
)
update public.artifacts a
set sort_order = ranked.rn
from ranked
where a.id = ranked.id;

create index if not exists artifacts_task_sort_order_idx
  on public.artifacts (task_id, sort_order)
  where task_id is not null and lower(coalesce(status, '')) <> 'archived';

create index if not exists artifacts_project_sort_order_idx
  on public.artifacts (project_id, sort_order)
  where project_id is not null and lower(coalesce(status, '')) <> 'archived';

create index if not exists artifacts_thread_sort_order_idx
  on public.artifacts (ai_thread_id, sort_order)
  where ai_thread_id is not null and lower(coalesce(status, '')) <> 'archived';

-- Default sort_order on insert: append within ownership scope
create or replace function public.artifacts_default_sort_order_trg()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_max integer;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  if coalesce(new.sort_order, 0) > 0 then
    return new;
  end if;

  if new.task_id is not null then
    select coalesce(max(sort_order), 0) into v_max
    from public.artifacts
    where task_id = new.task_id
      and lower(coalesce(status, '')) <> 'archived';
  elsif new.project_id is not null then
    select coalesce(max(sort_order), 0) into v_max
    from public.artifacts
    where project_id = new.project_id
      and task_id is null
      and lower(coalesce(status, '')) <> 'archived';
  elsif new.ai_thread_id is not null then
    select coalesce(max(sort_order), 0) into v_max
    from public.artifacts
    where ai_thread_id = new.ai_thread_id
      and lower(coalesce(status, '')) <> 'archived';
  else
    v_max := 0;
  end if;

  new.sort_order := v_max + 1;
  return new;
end;
$function$;

drop trigger if exists trg_artifacts_default_sort_order on public.artifacts;
create trigger trg_artifacts_default_sort_order
  before insert on public.artifacts
  for each row
  execute function public.artifacts_default_sort_order_trg();

-- Soft-delete (archive) artifact
create or replace function public.ai_delete_artifact_v1(p_artifact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_artifact public.artifacts%rowtype;
begin
  if public.current_user_id() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  v_artifact := public.ai_authorize_artifact_v2(p_artifact_id, true);

  if lower(coalesce(v_artifact.status, '')) = 'archived' then
    return jsonb_build_object('ok', true, 'artifact_id', v_artifact.id, 'already_archived', true);
  end if;

  update public.artifacts
  set status = 'archived',
      updated_at = now()
  where id = v_artifact.id;

  return jsonb_build_object('ok', true, 'artifact_id', v_artifact.id, 'status', 'archived');
end;
$function$;

revoke all on function public.ai_delete_artifact_v1(uuid) from public;
grant execute on function public.ai_delete_artifact_v1(uuid) to authenticated, service_role;

-- Reorder artifacts (authorized write on each id)
create or replace function public.ai_reorder_artifacts_v1(p_ordered_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_id uuid;
  v_pos integer := 0;
  v_updated integer := 0;
begin
  if public.current_user_id() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if p_ordered_ids is null or cardinality(p_ordered_ids) = 0 then
    raise exception using errcode = '22023', message = 'artifact_reorder_ids_required';
  end if;

  foreach v_id in array p_ordered_ids loop
    v_pos := v_pos + 1;
    perform public.ai_authorize_artifact_v2(v_id, true);

    update public.artifacts
    set sort_order = v_pos,
        updated_at = now()
    where id = v_id
      and sort_order is distinct from v_pos;

    if found then
      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'count', cardinality(p_ordered_ids),
    'updated', v_updated
  );
end;
$function$;

revoke all on function public.ai_reorder_artifacts_v1(uuid[]) from public;
grant execute on function public.ai_reorder_artifacts_v1(uuid[]) to authenticated, service_role;

-- List RPCs: exclude archived, order by sort_order, include sort_order
create or replace function public.ai_list_task_artifacts_v1(
  p_task_id integer,
  p_include_content boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_items jsonb;
  v_project_id integer;
  v_task_title text;
  v_channels jsonb := '[]'::jsonb;
  v_languages jsonb := '[]'::jsonb;
begin
  if public.current_user_id() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform public.ai_validate_task_scope(p_task_id => p_task_id, p_channel_id => null, p_require_write => false);

  select t.project_id_int, t.title into v_project_id, v_task_title
  from public.tasks t
  where t.id = p_task_id and coalesce(t.is_deleted, false) = false;
  if not found then raise exception using errcode = '22023', message = 'artifact_task_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'channel_id', c.id,
    'name', c.name,
    'attached', exists(select 1 from public.task_channels tc where tc.task_id = p_task_id and tc.channel_id = c.id)
  ) order by c.name, c.id), '[]'::jsonb)
  into v_channels
  from public.project_channels pc
  join public.channels c on c.id = pc.channel_id
  where pc.project_id = v_project_id;

  if to_regclass('public.project_languages') is not null and to_regclass('public.languages') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'language_id', l.id,
        'name', coalesce(
          to_jsonb(l)->>'name',
          to_jsonb(l)->>'title',
          to_jsonb(l)->>'code',
          to_jsonb(l)->>'language_code',
          l.id::text
        ),
        'code', coalesce(to_jsonb(l)->>'code', to_jsonb(l)->>'language_code'),
        'is_primary', coalesce(pl.is_primary, false)
      )) order by coalesce(pl.is_primary, false) desc, l.id), '[]'::jsonb)
      from public.project_languages pl
      join public.languages l on l.id = pl.language_id
      where pl.project_id = $1 and coalesce(pl.is_deleted, false) = false
    $q$ into v_languages using v_project_id;
  end if;

  select coalesce(
    jsonb_agg(
      item
      order by coalesce((item->>'sort_order')::integer, 0) asc,
               (item->>'updated_at')::timestamptz desc nulls last
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', a.id,
      'task_id', a.task_id,
      'project_id', a.project_id,
      'ai_thread_id', a.ai_thread_id,
      'artifact_type', a.artifact_type,
      'artifact_role', a.artifact_role,
      'title', a.title,
      'status', a.status,
      'sort_order', a.sort_order,
      'channel_id', a.channel_id,
      'language_id', a.language_id,
      'current_version', a.current_version,
      'source_artifact_id', a.source_artifact_id,
      'source_version_number', a.source_version_number,
      'derivation_type', a.derivation_type,
      'metadata', coalesce(a.metadata, '{}'::jsonb),
      'content_text', case when p_include_content then a.content_text else null end,
      'content_json', case when p_include_content then a.content_json else null end,
      'asset_data', case when p_include_content then coalesce(a.asset_data, '{}'::jsonb) else null end,
      'content_preview', case when p_include_content then null else left(regexp_replace(coalesce(a.content_text, ''), '\s+', ' ', 'g'), 800) end,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    )) item
    from public.artifacts a
    where a.task_id = p_task_id
      and lower(coalesce(a.status, '')) <> 'archived'
    order by a.sort_order asc, a.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) q;

  return jsonb_build_object(
    'ok', true,
    'task_id', p_task_id,
    'task_title', v_task_title,
    'project_id', v_project_id,
    'available_channels', v_channels,
    'available_languages', v_languages,
    'artifacts', v_items
  );
end;
$function$;

create or replace function public.ai_list_project_artifacts_v1(
  p_project_id integer,
  p_include_content boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_items jsonb;
  v_project_name text;
begin
  if public.current_user_id() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and not public.can_edit_project(p_project_id) then
    raise exception using errcode = '42501', message = 'project_artifacts_forbidden';
  end if;
  select name into v_project_name from public.projects where id = p_project_id;
  if not found then raise exception using errcode = '22023', message = 'project_not_found'; end if;

  select coalesce(
    jsonb_agg(
      item
      order by coalesce((item->>'sort_order')::integer, 0) asc,
               (item->>'updated_at')::timestamptz desc nulls last
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', a.id,
      'task_id', a.task_id,
      'project_id', a.project_id,
      'ai_thread_id', a.ai_thread_id,
      'artifact_type', a.artifact_type,
      'artifact_role', a.artifact_role,
      'title', a.title,
      'status', a.status,
      'sort_order', a.sort_order,
      'channel_id', a.channel_id,
      'language_id', a.language_id,
      'current_version', a.current_version,
      'source_artifact_id', a.source_artifact_id,
      'source_version_number', a.source_version_number,
      'derivation_type', a.derivation_type,
      'metadata', coalesce(a.metadata, '{}'::jsonb),
      'content_text', case when p_include_content then a.content_text else null end,
      'content_json', case when p_include_content then a.content_json else null end,
      'asset_data', case when p_include_content then coalesce(a.asset_data, '{}'::jsonb) else null end,
      'content_preview', case when p_include_content then null else left(regexp_replace(coalesce(a.content_text, ''), '\s+', ' ', 'g'), 800) end,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    )) item
    from public.artifacts a
    where a.project_id = p_project_id
      and lower(coalesce(a.status, '')) <> 'archived'
    order by a.sort_order asc, a.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) q;

  return jsonb_build_object(
    'ok', true,
    'project_id', p_project_id,
    'project_name', v_project_name,
    'artifacts', v_items
  );
end;
$function$;

create or replace function public.ai_list_ai_thread_artifacts_v1(
  p_thread_id uuid,
  p_include_content boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_items jsonb;
begin
  if not public.ai_can_read_thread(p_thread_id) and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'thread_read_forbidden';
  end if;
  select coalesce(
    jsonb_agg(
      item
      order by coalesce((item->>'sort_order')::integer, 0) asc,
               (item->>'updated_at')::timestamptz desc nulls last
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select jsonb_strip_nulls(jsonb_build_object(
      'id', a.id,
      'task_id', a.task_id,
      'project_id', a.project_id,
      'ai_thread_id', a.ai_thread_id,
      'artifact_type', a.artifact_type,
      'artifact_role', a.artifact_role,
      'title', a.title,
      'status', a.status,
      'sort_order', a.sort_order,
      'channel_id', a.channel_id,
      'language_id', a.language_id,
      'current_version', a.current_version,
      'source_artifact_id', a.source_artifact_id,
      'source_version_number', a.source_version_number,
      'derivation_type', a.derivation_type,
      'metadata', coalesce(a.metadata, '{}'::jsonb),
      'content_text', case when p_include_content then a.content_text else null end,
      'content_json', case when p_include_content then a.content_json else null end,
      'asset_data', case when p_include_content then coalesce(a.asset_data, '{}'::jsonb) else null end,
      'content_preview', case when p_include_content then null else left(regexp_replace(coalesce(a.content_text,''), '\s+', ' ', 'g'), 400) end,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    )) item
    from public.artifacts a
    where a.ai_thread_id = p_thread_id
      and lower(coalesce(a.status, '')) <> 'archived'
    order by a.sort_order asc, a.updated_at desc
    limit greatest(1, least(coalesce(p_limit,100),500))
  ) q;
  return jsonb_build_object('ok', true, 'thread_id', p_thread_id, 'artifacts', v_items);
end;
$function$;
