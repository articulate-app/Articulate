-- Track when a publication actually completed successfully (delay inspection).
alter table public.publication_runs
  add column if not exists published_at timestamptz null;

comment on column public.publication_runs.published_at is
  'When status became published (verified success). Used with scheduled_at/execution_started_at for delay inspection.';
