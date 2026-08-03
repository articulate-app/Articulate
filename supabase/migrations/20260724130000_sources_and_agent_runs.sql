begin;

-- =============================================================================
-- Generic sources: inputs may belong to a task, project, AI thread, or remain
-- unattached. created_by is ownership/audit metadata, not a required business
-- scope.
-- =============================================================================

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  task_id integer null references public.tasks(id) on delete set null,
  project_id integer null references public.projects(id) on delete set null,
  ai_thread_id uuid null references public.ai_threads(id) on delete set null,
  source_type text not null default 'pasted_text',
  title text not null default 'Untitled source',
  status text not null default 'ready',
  source_url text null,
  attachment_id uuid null references public.attachments(id) on delete set null,
  content_text text null,
  content_json jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text null,
  current_version integer not null default 0,
  created_by integer not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_type_check check (
    source_type in (
      'url','file','pasted_text','web_research','task_reference',
      'artifact_reference','note','dataset','other'
    )
  ),
  constraint sources_status_check check (status in ('pending','ready','failed','archived')),
  constraint sources_current_version_check check (current_version >= 0)
);

create table if not exists public.source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  change_source text not null default 'unknown',
  changed_by integer null references public.users(id),
  ai_message_id uuid null,
  ai_thread_id uuid null references public.ai_threads(id) on delete set null,
  change_summary text null,
  created_at timestamptz not null default now(),
  constraint source_versions_source_version_key unique (source_id, version_number),
  constraint source_versions_version_positive check (version_number > 0)
);

create index if not exists idx_sources_task on public.sources(task_id) where task_id is not null;
create index if not exists idx_sources_project on public.sources(project_id) where project_id is not null;
create index if not exists idx_sources_thread on public.sources(ai_thread_id) where ai_thread_id is not null;
create index if not exists idx_sources_created_by on public.sources(created_by, created_at desc);
create index if not exists idx_sources_attachment on public.sources(attachment_id) where attachment_id is not null;
create index if not exists idx_source_versions_source on public.source_versions(source_id, version_number desc);

create or replace function public.ai_source_snapshot_v1(p_source_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', s.id,
    'task_id', s.task_id,
    'project_id', s.project_id,
    'ai_thread_id', s.ai_thread_id,
    'source_type', s.source_type,
    'title', s.title,
    'status', s.status,
    'source_url', s.source_url,
    'attachment_id', s.attachment_id,
    'content_text', s.content_text,
    'content_json', s.content_json,
    'metadata', s.metadata,
    'content_hash', s.content_hash,
    'current_version', s.current_version,
    'created_by', s.created_by,
    'created_at', s.created_at,
    'updated_at', s.updated_at
  )
  from public.sources s
  where s.id = p_source_id;
$$;

create or replace function public.ai_can_access_source_scope_v1(
  p_source_id uuid,
  p_require_write boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source public.sources%rowtype;
  v_actor integer := public.current_user_id();
begin
  if coalesce(auth.role(), '') = 'service_role' then return true; end if;
  if v_actor is null then return false; end if;

  select * into v_source from public.sources where id = p_source_id;
  if not found then return false; end if;
  if v_source.created_by = v_actor then return true; end if;

  if v_source.task_id is not null then
    begin
      perform public.ai_validate_task_scope(
        p_task_id => v_source.task_id,
        p_channel_id => null,
        p_require_write => p_require_write
      );
      return true;
    exception when others then
      null;
    end;
  end if;

  if v_source.project_id is not null and public.can_edit_project(v_source.project_id) then
    return true;
  end if;

  if v_source.ai_thread_id is not null and public.ai_can_post_in_thread(v_source.ai_thread_id) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.ai_authorize_source_v1(
  p_source_id uuid,
  p_require_write boolean default false
)
returns public.sources
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source public.sources%rowtype;
begin
  select * into v_source from public.sources where id = p_source_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'source_not_found';
  end if;
  if not public.ai_can_access_source_scope_v1(p_source_id, p_require_write) then
    raise exception using errcode = '42501', message = case when p_require_write then 'source_write_forbidden' else 'source_read_forbidden' end;
  end if;
  return v_source;
end;
$$;

create or replace function public.ai_create_source_v1(
  p_source_type text,
  p_title text,
  p_task_id integer default null,
  p_project_id integer default null,
  p_ai_thread_id uuid default null,
  p_source_url text default null,
  p_attachment_id uuid default null,
  p_content_text text default null,
  p_content_json jsonb default null,
  p_metadata jsonb default '{}'::jsonb,
  p_change_source text default 'user'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor integer := public.current_user_id();
  v_source public.sources%rowtype;
  v_version integer := 1;
  v_snapshot jsonb;
  v_project_from_task integer;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;

  if p_task_id is not null then
    perform public.ai_validate_task_scope(p_task_id => p_task_id, p_channel_id => null, p_require_write => true);
    select project_id_int into v_project_from_task from public.tasks where id = p_task_id and coalesce(is_deleted, false) = false;
    if v_project_from_task is null then raise exception using errcode = 'P0002', message = 'task_not_found'; end if;
    if p_project_id is not null and p_project_id is distinct from v_project_from_task then
      raise exception using errcode = '42501', message = 'source_task_project_mismatch';
    end if;
  elsif p_project_id is not null and not public.can_edit_project(p_project_id) then
    raise exception using errcode = '42501', message = 'source_project_write_forbidden';
  end if;

  if p_ai_thread_id is not null and not public.ai_can_post_in_thread(p_ai_thread_id) then
    raise exception using errcode = '42501', message = 'source_thread_write_forbidden';
  end if;

  if p_attachment_id is not null and not exists (select 1 from public.attachments where id = p_attachment_id) then
    raise exception using errcode = 'P0002', message = 'source_attachment_not_found';
  end if;

  insert into public.sources(
    task_id, project_id, ai_thread_id, source_type, title, status,
    source_url, attachment_id, content_text, content_json, metadata,
    current_version, created_by, created_at, updated_at
  ) values (
    p_task_id,
    case when p_task_id is null then p_project_id else null end,
    p_ai_thread_id,
    case when p_source_type in ('url','file','pasted_text','web_research','task_reference','artifact_reference','note','dataset','other') then p_source_type else 'other' end,
    left(coalesce(nullif(trim(p_title), ''), 'Untitled source'), 500),
    case when p_content_text is null and (nullif(trim(p_source_url), '') is not null or p_attachment_id is not null) then 'pending' else 'ready' end,
    nullif(trim(p_source_url), ''),
    p_attachment_id,
    p_content_text,
    p_content_json,
    coalesce(p_metadata, '{}'::jsonb),
    v_version,
    v_actor,
    now(),
    now()
  ) returning * into v_source;

  v_snapshot := public.ai_source_snapshot_v1(v_source.id);
  insert into public.source_versions(
    source_id, version_number, snapshot, change_source, changed_by,
    ai_thread_id, change_summary
  ) values (
    v_source.id, v_version, v_snapshot,
    left(coalesce(nullif(trim(p_change_source), ''), 'user'), 100),
    v_actor, p_ai_thread_id, 'Created source'
  );

  return jsonb_build_object('ok', true, 'source', v_snapshot, 'version_number', v_version);
end;
$$;

create or replace function public.ai_save_source_version_v1(
  p_source_id uuid,
  p_expected_version integer,
  p_snapshot jsonb,
  p_change_source text default 'user',
  p_change_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor integer := public.current_user_id();
  v_source public.sources%rowtype;
  v_next integer;
  v_snapshot jsonb;
begin
  if v_actor is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  v_source := public.ai_authorize_source_v1(p_source_id, true);
  if coalesce(p_expected_version, -1) is distinct from v_source.current_version then
    raise exception using errcode = '40001', message = 'source_revision_conflict';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception using errcode = '22023', message = 'source_snapshot_required';
  end if;

  v_next := v_source.current_version + 1;
  update public.sources set
    task_id = case when p_snapshot ? 'task_id' then nullif(p_snapshot->>'task_id', '')::integer else task_id end,
    project_id = case when p_snapshot ? 'project_id' then nullif(p_snapshot->>'project_id', '')::integer else project_id end,
    ai_thread_id = case when p_snapshot ? 'ai_thread_id' then nullif(p_snapshot->>'ai_thread_id', '')::uuid else ai_thread_id end,
    source_type = case when p_snapshot ? 'source_type' then left(coalesce(nullif(trim(p_snapshot->>'source_type'), ''), source_type), 100) else source_type end,
    title = case when p_snapshot ? 'title' then left(coalesce(nullif(trim(p_snapshot->>'title'), ''), title), 500) else title end,
    status = case when p_snapshot ? 'status' then left(coalesce(nullif(trim(p_snapshot->>'status'), ''), status), 50) else status end,
    source_url = case when p_snapshot ? 'source_url' then nullif(trim(p_snapshot->>'source_url'), '') else source_url end,
    attachment_id = case when p_snapshot ? 'attachment_id' then nullif(p_snapshot->>'attachment_id', '')::uuid else attachment_id end,
    content_text = case when p_snapshot ? 'content_text' then p_snapshot->>'content_text' else content_text end,
    content_json = case when p_snapshot ? 'content_json' then p_snapshot->'content_json' else content_json end,
    metadata = case when p_snapshot ? 'metadata' then coalesce(p_snapshot->'metadata', '{}'::jsonb) else metadata end,
    content_hash = case when p_snapshot ? 'content_hash' then nullif(p_snapshot->>'content_hash', '') else content_hash end,
    current_version = v_next,
    updated_at = now()
  where id = p_source_id;

  v_snapshot := public.ai_source_snapshot_v1(p_source_id);
  insert into public.source_versions(
    source_id, version_number, snapshot, change_source, changed_by,
    ai_thread_id, change_summary
  ) values (
    p_source_id, v_next, v_snapshot,
    left(coalesce(nullif(trim(p_change_source), ''), 'user'), 100),
    v_actor, nullif(v_snapshot->>'ai_thread_id', '')::uuid,
    left(nullif(trim(p_change_summary), ''), 1000)
  );

  return jsonb_build_object('ok', true, 'source', v_snapshot, 'version_number', v_next);
end;
$$;

create or replace function public.ai_get_source_v1(
  p_source_id uuid,
  p_version_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source public.sources%rowtype;
  v_snapshot jsonb;
begin
  v_source := public.ai_authorize_source_v1(p_source_id, false);
  if p_version_number is null or p_version_number = v_source.current_version then
    v_snapshot := public.ai_source_snapshot_v1(p_source_id);
  else
    select snapshot into v_snapshot from public.source_versions
    where source_id = p_source_id and version_number = p_version_number;
    if v_snapshot is null then raise exception using errcode = 'P0002', message = 'source_version_not_found'; end if;
  end if;
  return jsonb_build_object('ok', true, 'source', v_snapshot, 'version_number', coalesce(p_version_number, v_source.current_version));
end;
$$;

create or replace function public.ai_list_sources_v1(
  p_task_id integer default null,
  p_project_id integer default null,
  p_ai_thread_id uuid default null,
  p_unattached_only boolean default false,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rows jsonb;
begin
  if p_task_id is not null then
    perform public.ai_validate_task_scope(p_task_id => p_task_id, p_channel_id => null, p_require_write => false);
  end if;
  if p_project_id is not null and not public.can_edit_project(p_project_id) then
    raise exception using errcode = '42501', message = 'source_project_read_forbidden';
  end if;
  if p_ai_thread_id is not null and not public.ai_can_post_in_thread(p_ai_thread_id) then
    raise exception using errcode = '42501', message = 'source_thread_read_forbidden';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      s.created_at,
      jsonb_build_object(
        'id', s.id,
        'task_id', s.task_id,
        'project_id', s.project_id,
        'ai_thread_id', s.ai_thread_id,
        'source_type', s.source_type,
        'title', s.title,
        'status', s.status,
        'source_url', s.source_url,
        'attachment_id', s.attachment_id,
        'current_version', s.current_version,
        'content_preview', left(regexp_replace(coalesce(s.content_text, ''), '\s+', ' ', 'g'), 1500),
        'metadata', s.metadata,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'app_link', 'app://source/' || s.id::text
      ) as row_data
    from public.sources s
    where public.ai_can_access_source_scope_v1(s.id, false)
      and (p_task_id is null or s.task_id = p_task_id)
      and (p_project_id is null or s.project_id = p_project_id or exists (
        select 1 from public.tasks t where t.id = s.task_id and t.project_id_int = p_project_id
      ))
      and (p_ai_thread_id is null or s.ai_thread_id = p_ai_thread_id)
      and (
        not coalesce(p_unattached_only, false)
        or (s.task_id is null and s.project_id is null and s.ai_thread_id is null)
      )
    order by s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  ) q;

  return jsonb_build_object('ok', true, 'sources', v_rows);
end;
$$;

create or replace function public.ai_attach_source_scope_v1(
  p_source_id uuid,
  p_task_id integer default null,
  p_project_id integer default null,
  p_ai_thread_id uuid default null,
  p_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source public.sources%rowtype;
  v_snapshot jsonb;
  v_actor integer := public.current_user_id();
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  v_source := public.ai_authorize_source_v1(p_source_id, true);
  if p_task_id is not null then perform public.ai_validate_task_scope(p_task_id => p_task_id, p_channel_id => null, p_require_write => true); end if;
  if p_project_id is not null and not public.can_edit_project(p_project_id) then raise exception using errcode = '42501', message = 'source_project_write_forbidden'; end if;
  if p_ai_thread_id is not null and not public.ai_can_post_in_thread(p_ai_thread_id) then raise exception using errcode = '42501', message = 'source_thread_write_forbidden'; end if;

  update public.sources set
    task_id = case when p_replace then p_task_id else coalesce(p_task_id, task_id) end,
    project_id = case when p_replace then p_project_id else coalesce(p_project_id, project_id) end,
    ai_thread_id = case when p_replace then p_ai_thread_id else coalesce(p_ai_thread_id, ai_thread_id) end,
    updated_at = now()
  where id = p_source_id;

  v_snapshot := public.ai_source_snapshot_v1(p_source_id);
  return jsonb_build_object('ok', true, 'source', v_snapshot);
end;
$$;

-- Sources are read directly by the UI under RLS. Writes remain RPC-first.
alter table public.sources enable row level security;
alter table public.source_versions enable row level security;

drop policy if exists sources_select_policy on public.sources;
create policy sources_select_policy on public.sources
for select to authenticated
using (public.ai_can_access_source_scope_v1(id, false));

drop policy if exists source_versions_select_policy on public.source_versions;
create policy source_versions_select_policy on public.source_versions
for select to authenticated
using (public.ai_can_access_source_scope_v1(source_id, false));

revoke insert, update, delete on public.sources from authenticated;
revoke insert, update, delete on public.source_versions from authenticated;
grant select on public.sources, public.source_versions to authenticated;
grant all on public.sources, public.source_versions to service_role;

grant execute on function public.ai_source_snapshot_v1(uuid) to authenticated, service_role;
grant execute on function public.ai_can_access_source_scope_v1(uuid, boolean) to authenticated, service_role;
grant execute on function public.ai_authorize_source_v1(uuid, boolean) to authenticated, service_role;
grant execute on function public.ai_create_source_v1(text,text,integer,integer,uuid,text,uuid,text,jsonb,jsonb,text) to authenticated, service_role;
grant execute on function public.ai_save_source_version_v1(uuid,integer,jsonb,text,text) to authenticated, service_role;
grant execute on function public.ai_get_source_v1(uuid,integer) to authenticated, service_role;
grant execute on function public.ai_list_sources_v1(integer,integer,uuid,boolean,integer,integer) to authenticated, service_role;
grant execute on function public.ai_attach_source_scope_v1(uuid,integer,integer,uuid,boolean) to authenticated, service_role;

-- =============================================================================
-- Durable autonomous supervisor state. The supervisor selects a task, creates
-- an artifact plan, starts one normal artifact build, waits for terminal state,
-- and then selects the next task.
-- =============================================================================

create table if not exists public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  ai_thread_id uuid not null references public.ai_threads(id) on delete cascade,
  project_id integer null references public.projects(id) on delete cascade,
  created_by integer not null references public.users(id),
  request_text text not null,
  eligible_task_ids integer[] null,
  selection_policy jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  max_tasks integer not null default 20,
  task_concurrency integer not null default 1,
  artifact_concurrency integer not null default 4,
  selected_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  active_build_id uuid null references public.ai_build_jobs(id) on delete set null,
  current_task_id integer null references public.tasks(id) on delete set null,
  last_error jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint ai_agent_runs_status_check check (status in ('queued','running','paused','completed','failed','cancelled')),
  constraint ai_agent_runs_limits_check check (max_tasks between 1 and 1000 and task_concurrency between 1 and 8 and artifact_concurrency between 1 and 8)
);

create table if not exists public.ai_agent_run_tasks (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.ai_agent_runs(id) on delete cascade,
  task_id integer not null references public.tasks(id) on delete cascade,
  sequence_number integer not null,
  status text not null default 'selected',
  build_id uuid null references public.ai_build_jobs(id) on delete set null,
  selection_reason text null,
  artifact_plan jsonb null,
  error jsonb null,
  selected_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  constraint ai_agent_run_tasks_unique_task unique (agent_run_id, task_id),
  constraint ai_agent_run_tasks_unique_sequence unique (agent_run_id, sequence_number),
  constraint ai_agent_run_tasks_status_check check (status in ('selected','planning','building','completed','failed','skipped','cancelled'))
);

create index if not exists idx_ai_agent_runs_due on public.ai_agent_runs(status, updated_at);
create index if not exists idx_ai_agent_run_tasks_run on public.ai_agent_run_tasks(agent_run_id, sequence_number);

create or replace function public.ai_create_agent_run_v1(
  p_thread_id uuid,
  p_request_text text,
  p_project_id integer default null,
  p_task_ids integer[] default null,
  p_selection_policy jsonb default '{}'::jsonb,
  p_max_tasks integer default 20,
  p_artifact_concurrency integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor integer := public.current_user_id();
  v_id uuid;
  v_task integer;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if not public.ai_can_post_in_thread(p_thread_id) then raise exception using errcode = '42501', message = 'thread_post_forbidden'; end if;
  if nullif(trim(p_request_text), '') is null then raise exception using errcode = '22023', message = 'agent_request_required'; end if;
  if p_project_id is not null and not public.can_edit_project(p_project_id) then raise exception using errcode = '42501', message = 'project_write_forbidden'; end if;
  if p_task_ids is not null then
    foreach v_task in array p_task_ids loop
      perform public.ai_validate_task_scope(p_task_id => v_task, p_channel_id => null, p_require_write => true);
    end loop;
  end if;

  insert into public.ai_agent_runs(
    ai_thread_id, project_id, created_by, request_text, eligible_task_ids,
    selection_policy, max_tasks, artifact_concurrency, status
  ) values (
    p_thread_id, p_project_id, v_actor, trim(p_request_text),
    case when p_task_ids is null then null else array(select distinct x from unnest(p_task_ids) x where x is not null and x > 0) end,
    coalesce(p_selection_policy, '{}'::jsonb),
    greatest(1, least(coalesce(p_max_tasks, 20), 1000)),
    greatest(1, least(coalesce(p_artifact_concurrency, 4), 8)),
    'queued'
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'agent_run_id', v_id, 'status', 'queued', 'app_link', 'app://ai-agent-run/' || v_id::text);
end;
$$;

create or replace function public.ai_get_agent_run_v1(p_agent_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run public.ai_agent_runs%rowtype;
  v_tasks jsonb;
begin
  select * into v_run from public.ai_agent_runs where id = p_agent_run_id;
  if not found then raise exception using errcode = 'P0002', message = 'agent_run_not_found'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and v_run.created_by is distinct from public.current_user_id() then
    raise exception using errcode = '42501', message = 'agent_run_forbidden';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sequence_number), '[]'::jsonb)
  into v_tasks from public.ai_agent_run_tasks t where t.agent_run_id = p_agent_run_id;
  return jsonb_build_object('ok', true, 'run', to_jsonb(v_run), 'tasks', v_tasks, 'app_link', 'app://ai-agent-run/' || v_run.id::text);
end;
$$;

create or replace function public.ai_set_agent_run_state_v1(
  p_agent_run_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run public.ai_agent_runs%rowtype;
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  select * into v_run from public.ai_agent_runs where id = p_agent_run_id;
  if not found then raise exception using errcode = 'P0002', message = 'agent_run_not_found'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and v_run.created_by is distinct from public.current_user_id() then
    raise exception using errcode = '42501', message = 'agent_run_forbidden';
  end if;
  if v_status not in ('running','paused','cancelled') then raise exception using errcode = '22023', message = 'invalid_agent_run_state'; end if;
  update public.ai_agent_runs set
    status = v_status,
    completed_at = case when v_status = 'cancelled' then now() else completed_at end,
    updated_at = now()
  where id = p_agent_run_id;
  return public.ai_get_agent_run_v1(p_agent_run_id);
end;
$$;

alter table public.ai_agent_runs enable row level security;
alter table public.ai_agent_run_tasks enable row level security;

drop policy if exists ai_agent_runs_select_policy on public.ai_agent_runs;
create policy ai_agent_runs_select_policy on public.ai_agent_runs
for select to authenticated using (created_by = public.current_user_id());

drop policy if exists ai_agent_run_tasks_select_policy on public.ai_agent_run_tasks;
create policy ai_agent_run_tasks_select_policy on public.ai_agent_run_tasks
for select to authenticated using (exists (
  select 1 from public.ai_agent_runs r where r.id = agent_run_id and r.created_by = public.current_user_id()
));

revoke insert, update, delete on public.ai_agent_runs, public.ai_agent_run_tasks from authenticated;
grant select on public.ai_agent_runs, public.ai_agent_run_tasks to authenticated;
grant all on public.ai_agent_runs, public.ai_agent_run_tasks to service_role;
grant execute on function public.ai_create_agent_run_v1(uuid,text,integer,integer[],jsonb,integer,integer) to authenticated, service_role;
grant execute on function public.ai_get_agent_run_v1(uuid) to authenticated, service_role;
grant execute on function public.ai_set_agent_run_state_v1(uuid,text) to authenticated, service_role;

-- Enrich the existing generation context with source summaries. The agent can
-- call ai_read_source when it needs the complete canonical source.
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
  v_task_id integer;
  v_project_id integer;
  v_thread_id uuid;
  v_explicit_ids uuid[] := '{}'::uuid[];
  v_sources jsonb := '[]'::jsonb;
begin
  v_base := public.ai_get_artifact_generation_context_v3(p_build_id, p_unit_id, p_lease_token, p_artifact_id);
  if coalesce((v_base->>'ok')::boolean, true) is false then return v_base; end if;
  v_artifact := coalesce(v_base->'artifact', '{}'::jsonb);
  v_task_id := nullif(v_artifact->>'task_id', '')::integer;
  v_project_id := nullif(v_artifact->>'project_id', '')::integer;
  v_thread_id := nullif(v_artifact->>'ai_thread_id', '')::uuid;

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

  return v_base || jsonb_build_object('sources', v_sources);
end;
$$;

grant execute on function public.ai_get_artifact_generation_context_v4(uuid,uuid,uuid,uuid) to authenticated, service_role;


commit;
