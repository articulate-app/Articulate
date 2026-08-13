-- Paired local Articulate Browser Helper devices (user-owned).
-- Device private keys never leave the helper machine.

create table if not exists public.browser_helper_devices (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  device_id text not null,
  device_public_key text not null,
  device_name text null,
  platform text null,
  helper_version text null,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint browser_helper_devices_device_id_unique unique (device_id)
);

create index if not exists browser_helper_devices_user_id_idx
  on public.browser_helper_devices (user_id);

create index if not exists browser_helper_devices_user_active_idx
  on public.browser_helper_devices (user_id)
  where revoked_at is null;

-- One-time pairing challenges (short-lived).
create table if not exists public.browser_helper_pairing_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id integer not null references public.users(id) on delete cascade,
  device_id text null,
  challenge text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists browser_helper_pairing_challenges_user_idx
  on public.browser_helper_pairing_challenges (user_id, expires_at);

alter table public.browser_helper_devices enable row level security;
alter table public.browser_helper_pairing_challenges enable row level security;

drop policy if exists "read own browser helper devices" on public.browser_helper_devices;
create policy "read own browser helper devices"
  on public.browser_helper_devices
  for select
  using (user_id = public.current_user_id());

drop policy if exists "update own browser helper devices" on public.browser_helper_devices;
create policy "update own browser helper devices"
  on public.browser_helper_devices
  for update
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- Inserts go through service role / API after cryptographic verification.
drop policy if exists "insert own browser helper devices" on public.browser_helper_devices;
create policy "insert own browser helper devices"
  on public.browser_helper_devices
  for insert
  with check (user_id = public.current_user_id());

drop policy if exists "read own pairing challenges" on public.browser_helper_pairing_challenges;
create policy "read own pairing challenges"
  on public.browser_helper_pairing_challenges
  for select
  using (user_id = public.current_user_id());

drop policy if exists "insert own pairing challenges" on public.browser_helper_pairing_challenges;
create policy "insert own pairing challenges"
  on public.browser_helper_pairing_challenges
  for insert
  with check (user_id = public.current_user_id());

drop policy if exists "update own pairing challenges" on public.browser_helper_pairing_challenges;
create policy "update own pairing challenges"
  on public.browser_helper_pairing_challenges
  for update
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

grant select, insert, update on public.browser_helper_devices to authenticated;
grant select, insert, update on public.browser_helper_pairing_challenges to authenticated;
grant all on public.browser_helper_devices to service_role;
grant all on public.browser_helper_pairing_challenges to service_role;
