-- Publication runs may publish from an artifact OR inline AI content.
-- The run always operates from a frozen source_snapshot (never re-reads a mutable artifact).

alter table public.publication_runs
  alter column artifact_id drop not null;

alter table public.publication_runs
  add column if not exists source_type text not null default 'artifact';

alter table public.publication_runs
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb;

alter table public.publication_runs
  drop constraint if exists publication_runs_source_type_check;

alter table public.publication_runs
  add constraint publication_runs_source_type_check
  check (source_type in ('artifact', 'inline'));

alter table public.publication_runs
  drop constraint if exists publication_runs_source_snapshot_object;

alter table public.publication_runs
  add constraint publication_runs_source_snapshot_object
  check (jsonb_typeof(source_snapshot) = 'object');

alter table public.publication_runs
  drop constraint if exists publication_runs_source_presence_check;

alter table public.publication_runs
  add constraint publication_runs_source_presence_check
  check (
    (source_type = 'artifact' and artifact_id is not null)
    or (source_type = 'inline')
  );

-- Backfill existing rows from result.artifact when present.
update public.publication_runs
set
  source_type = case when artifact_id is null then 'inline' else 'artifact' end,
  source_snapshot = case
    when coalesce(source_snapshot, '{}'::jsonb) = '{}'::jsonb
      and jsonb_typeof(result -> 'artifact') = 'object'
      then result -> 'artifact'
    else source_snapshot
  end
where true;
