-- Allow local Articulate Browser Bridge as a per-run provider.
-- Destinations remain provider-agnostic (usually browser_use); execution chooses local vs cloud.

alter table public.publishing_destinations
  drop constraint if exists publishing_destinations_provider_check;

alter table public.publishing_destinations
  add constraint publishing_destinations_provider_check
  check (
    provider in (
      'browser_use',
      'browser_use_local',
      'browserbase_stagehand',
      'browserbase_computer_use',
      'other'
    )
  );

alter table public.publication_runs
  drop constraint if exists publication_runs_provider_check;

alter table public.publication_runs
  add constraint publication_runs_provider_check
  check (
    provider in (
      'browser_use',
      'browser_use_local',
      'browserbase_stagehand',
      'browserbase_computer_use',
      'other'
    )
  );

comment on column public.publication_runs.provider is
  'Per-run browser provider: browser_use (Cloud) or browser_use_local (Articulate Browser Bridge).';
