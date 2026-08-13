-- Generic Agentic Publishing MVP
-- Destinations + publication runs (Browser Use Cloud behind a provider abstraction).
-- Idempotent: safe if tables already exist.

create table if not exists public.publishing_destinations (
  id uuid primary key default gen_random_uuid(),
  project_id integer not null references public.projects(id) on delete cascade,
  name text not null,
  start_url text not null,
  provider text not null default 'browser_use',
  provider_profile_id text null,
  status text not null default 'disconnected',
  created_by integer null default public.current_user_id() references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_connected_at timestamptz null,
  last_verified_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint publishing_destinations_name_check check (char_length(trim(name)) > 0),
  constraint publishing_destinations_start_url_check check (char_length(trim(start_url)) > 0),
  constraint publishing_destinations_provider_check check (
    provider in ('browser_use', 'browserbase_stagehand', 'browserbase_computer_use', 'other')
  ),
  constraint publishing_destinations_status_check check (
    status in ('disconnected', 'connecting', 'connected', 'needs_login', 'error')
  ),
  constraint publishing_destinations_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_publishing_destinations_project
  on public.publishing_destinations(project_id, status, name);

create table if not exists public.publication_runs (
  id uuid primary key default gen_random_uuid(),
  project_id integer not null references public.projects(id) on delete cascade,
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  destination_id uuid not null references public.publishing_destinations(id) on delete restrict,
  started_by integer null default public.current_user_id() references public.users(id),
  provider text not null default 'browser_use',
  provider_run_id text null,
  provider_session_id text null,
  provider_browser_id text null,
  provider_workspace_id text null,
  status text not null default 'queued',
  live_view_url text null,
  external_url text null,
  external_id text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  error_code text null,
  error_message text null,
  result jsonb not null default '{}'::jsonb,
  activity jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_runs_provider_check check (
    provider in ('browser_use', 'browserbase_stagehand', 'browserbase_computer_use', 'other')
  ),
  constraint publication_runs_status_check check (
    status in (
      'queued',
      'starting',
      'running',
      'needs_user',
      'awaiting_publish_confirmation',
      'publishing',
      'verifying',
      'published',
      'failed',
      'cancelled',
      'uncertain'
    )
  ),
  constraint publication_runs_result_object check (jsonb_typeof(result) = 'object'),
  constraint publication_runs_activity_array check (jsonb_typeof(activity) = 'array'),
  constraint publication_runs_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_publication_runs_artifact
  on public.publication_runs(artifact_id, created_at desc);

create index if not exists idx_publication_runs_project
  on public.publication_runs(project_id, created_at desc);

create index if not exists idx_publication_runs_destination
  on public.publication_runs(destination_id, created_at desc);

create index if not exists idx_publication_runs_status
  on public.publication_runs(status)
  where status not in ('published', 'failed', 'cancelled', 'uncertain');

alter table public.publishing_destinations enable row level security;
alter table public.publication_runs enable row level security;

drop policy if exists publishing_destinations_select on public.publishing_destinations;
create policy publishing_destinations_select
  on public.publishing_destinations for select to authenticated
  using (public.can_edit_project(project_id));

drop policy if exists publishing_destinations_insert on public.publishing_destinations;
create policy publishing_destinations_insert
  on public.publishing_destinations for insert to authenticated
  with check (public.can_edit_project(project_id));

drop policy if exists publishing_destinations_update on public.publishing_destinations;
create policy publishing_destinations_update
  on public.publishing_destinations for update to authenticated
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

drop policy if exists publishing_destinations_delete on public.publishing_destinations;
create policy publishing_destinations_delete
  on public.publishing_destinations for delete to authenticated
  using (public.can_edit_project(project_id));

-- Runs are readable by project editors; mutations go through the edge function (service role).
drop policy if exists publication_runs_select on public.publication_runs;
create policy publication_runs_select
  on public.publication_runs for select to authenticated
  using (public.can_edit_project(project_id));

revoke insert, update, delete on public.publication_runs from authenticated;
grant select on public.publication_runs to authenticated;

grant select, insert, update, delete on public.publishing_destinations to authenticated;
