-- A publishing destination describes the automation target, not where a
-- particular run executes. Desktop runs are driven by the Electron client;
-- server/cloud runs remain Browser Use (or future server providers).

alter table public.publication_runs
  add column if not exists execution_location text not null default 'server';

alter table public.publication_runs
  drop constraint if exists publication_runs_execution_location_check;

alter table public.publication_runs
  add constraint publication_runs_execution_location_check
  check (execution_location in ('client', 'server'));

alter table public.publication_runs
  drop constraint if exists publication_runs_provider_check;

alter table public.publication_runs
  add constraint publication_runs_provider_check
  check (
    provider in (
      'browser_use',
      'articulate_desktop',
      'browser_use_local',
      'browserbase_stagehand',
      'browserbase_computer_use',
      'other'
    )
  );

update public.publication_runs
set execution_location = case
  when provider = 'articulate_desktop' then 'client'
  else 'server'
end
where execution_location is null
   or (provider = 'articulate_desktop' and execution_location <> 'client');

comment on column public.publication_runs.provider is
  'Per-run execution provider. Destinations remain provider-agnostic.';

comment on column public.publication_runs.execution_location is
  'Execution locality: client for Articulate Desktop WebContents, server for Cloud/unattended providers.';
