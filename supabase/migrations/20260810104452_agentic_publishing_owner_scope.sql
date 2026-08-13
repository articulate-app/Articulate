-- Allow owner-scoped publishing destinations/runs (no project/task required).
-- Project-scoped rows keep can_edit_project RLS; owner rows use created_by / started_by.

alter table public.publishing_destinations
  alter column project_id drop not null;

alter table public.publication_runs
  alter column project_id drop not null;

alter table public.publishing_destinations
  drop constraint if exists publishing_destinations_scope_check;

alter table public.publishing_destinations
  add constraint publishing_destinations_scope_check
  check (project_id is not null or created_by is not null);

alter table public.publication_runs
  drop constraint if exists publication_runs_scope_check;

alter table public.publication_runs
  add constraint publication_runs_scope_check
  check (project_id is not null or started_by is not null);

create index if not exists idx_publishing_destinations_owner
  on public.publishing_destinations(created_by, status, name)
  where project_id is null;

create index if not exists idx_publication_runs_owner
  on public.publication_runs(started_by, created_at desc)
  where project_id is null;

drop policy if exists publishing_destinations_select on public.publishing_destinations;
create policy publishing_destinations_select
  on public.publishing_destinations for select to authenticated
  using (
    (project_id is not null and public.can_edit_project(project_id))
    or (project_id is null and created_by = public.current_user_id())
  );

drop policy if exists publishing_destinations_insert on public.publishing_destinations;
create policy publishing_destinations_insert
  on public.publishing_destinations for insert to authenticated
  with check (
    (project_id is not null and public.can_edit_project(project_id))
    or (
      project_id is null
      and created_by = public.current_user_id()
    )
  );

drop policy if exists publishing_destinations_update on public.publishing_destinations;
create policy publishing_destinations_update
  on public.publishing_destinations for update to authenticated
  using (
    (project_id is not null and public.can_edit_project(project_id))
    or (project_id is null and created_by = public.current_user_id())
  )
  with check (
    (project_id is not null and public.can_edit_project(project_id))
    or (project_id is null and created_by = public.current_user_id())
  );

drop policy if exists publishing_destinations_delete on public.publishing_destinations;
create policy publishing_destinations_delete
  on public.publishing_destinations for delete to authenticated
  using (
    (project_id is not null and public.can_edit_project(project_id))
    or (project_id is null and created_by = public.current_user_id())
  );

drop policy if exists publication_runs_select on public.publication_runs;
create policy publication_runs_select
  on public.publication_runs for select to authenticated
  using (
    (project_id is not null and public.can_edit_project(project_id))
    or (project_id is null and started_by = public.current_user_id())
  );
