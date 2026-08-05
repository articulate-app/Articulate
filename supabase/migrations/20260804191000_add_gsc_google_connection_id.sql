-- Ensure GSC properties can link to per-project Google OAuth connections.
-- Needed when competitive content tables were created after the OAuth migration.

alter table public.project_search_console_properties
  add column if not exists google_connection_id bigint null
    references public.project_google_oauth_connections(id) on delete set null;

create index if not exists idx_project_search_console_properties_connection
  on public.project_search_console_properties(google_connection_id)
  where google_connection_id is not null;
