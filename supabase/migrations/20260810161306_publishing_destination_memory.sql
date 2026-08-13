-- Lightweight publishing destination memory (entry points + guidance).
-- Belongs on publishing_destinations — not project metadata.
-- Does not store selectors, click paths, or provider profile internals.

alter table public.publishing_destinations
  add column if not exists memory jsonb not null default '{}'::jsonb;

alter table public.publishing_destinations
  drop constraint if exists publishing_destinations_memory_object;

alter table public.publishing_destinations
  add constraint publishing_destinations_memory_object
  check (jsonb_typeof(memory) = 'object');

comment on column public.publishing_destinations.memory is
  'Semantic publishing memory: entry_points, guidance, last successful URLs. No selectors or scripts.';
