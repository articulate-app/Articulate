begin;

-- Canonical brand identity kit on projects (source + overrides + effective).
alter table public.projects
  add column if not exists brand_kit jsonb not null default '{}'::jsonb;

comment on column public.projects.brand_kit is
  'Versioned brand kit: schema_version, status, source/overrides/effective visual identity.';

create table if not exists public.project_brand_extract_runs (
  id uuid primary key default gen_random_uuid(),
  project_id integer not null references public.projects(id) on delete cascade,
  provider text not null default 'firecrawl',
  status text not null default 'queued',
  root_url text not null,
  raw_branding jsonb not null default '{}'::jsonb,
  normalized jsonb not null default '{}'::jsonb,
  error_code text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by integer null default current_user_id(),
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_brand_extract_runs_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed')
  )
);

create index if not exists idx_project_brand_extract_runs_project
  on public.project_brand_extract_runs(project_id, created_at desc);

create index if not exists idx_project_brand_extract_runs_status
  on public.project_brand_extract_runs(status)
  where status in ('queued', 'running');

alter table public.project_brand_extract_runs enable row level security;

drop policy if exists project_brand_extract_runs_editors_read on public.project_brand_extract_runs;
create policy project_brand_extract_runs_editors_read
  on public.project_brand_extract_runs
  for select
  to authenticated
  using (public.can_edit_project(project_id));

commit;
