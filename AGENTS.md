# AGENTS.md

## Cursor Cloud specific instructions

This is a Next.js 14 (App Router) + Supabase app (branded "Articulate"; the
`package.json` name is `task-management-app`). It uses **npm** (`package-lock.json`),
TypeScript, Tailwind + Radix/shadcn UI, TanStack Query, and Supabase for auth,
Postgres, storage and edge functions. Standard scripts live in `package.json`
(`dev`, `build`, `start`, `lint`).

### Services

| Service | Required | How to run |
| --- | --- | --- |
| Next.js dev server | Yes | `npm run dev` (serves on `http://localhost:3000`) |
| Local Supabase stack (Postgres/Auth/Storage/Studio/Inbucket) | Yes for anything auth/data related | `npx supabase start` (needs Docker) |
| Supabase Edge Functions | Optional (AI chat, keyword/SEO, `task-*-bootstrap`) | `npx supabase functions serve` |
| Typesense, Google Ads, DataForSEO | Optional, external creds required | see `docs/keyword-planner-setup.md` |

Local Supabase ports (`supabase/config.toml`): API `54321`, DB `54322`, Studio
`54323`, Inbucket `54324`.

### Environment variables (create `.env.local`, it is gitignored)

The repo ships **no `.env` example**. The app needs at minimum:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`
(same set CI injects). For a local stack, point them at
`http://127.0.0.1:54321` and use the anon/service keys that `npx supabase start`
prints. For full production-schema data, point them at the hosted Supabase
project instead (add the values as secrets).

- **Env precedence gotcha:** Next.js (`@next/env`) does NOT override variables
  already present in the shell environment, so when the 5 vars above are injected
  as Cloud secrets the app targets the **hosted** project even if a `.env.local`
  exists. To use a local Supabase stack instead, unset those shell vars (or run
  in a shell without them) so `.env.local` takes effect. Restart `npm run dev`
  after changing which backend you target.
- Data pages are **RLS-filtered per user/team**, so a brand-new account (or one
  created via the local stack) sees empty lists ("No results found") even against
  the populated hosted DB. Viewing real data in the UI requires logging in as an
  existing hosted user.

### IMPORTANT gotchas (non-obvious)

- **Docker is required for local Supabase and is not preinstalled.** Install
  Docker CE, then (Docker 29 in this VM) configure `/etc/docker/daemon.json`
  with `"storage-driver": "fuse-overlayfs"` and `"features": { "containerd-snapshotter": false }`,
  switch to `iptables-legacy`, and start the daemon with `sudo dockerd` (no
  systemd in this container). Give the `ubuntu` user socket access
  (`sudo chmod 666 /var/run/docker.sock`) so the Supabase CLI can talk to it.
- **`supabase/migrations/` are incremental patches on top of a pre-existing
  production schema — there is NO base schema in the repo.** So a from-scratch
  `npx supabase start` / `supabase db reset` FAILS while applying migrations
  (e.g. `relation "public.threads" does not exist`). Two ways forward:
  (1) point the env vars at the hosted Supabase project (recommended for real
  data), or (2) for auth-only local testing, temporarily move
  `supabase/migrations/*` aside so the stack boots with an empty `public`
  schema, then restore them (do not commit that change). With an empty public
  schema, auth/signup/login work fully; data-backed pages just render empty
  ("No results found").
- **`npm run lint` is effectively a no-op.** There is no committed ESLint config,
  so `next lint` prints the interactive "How would you like to configure ESLint?"
  prompt and exits 0 without linting (this is what CI does too). It "passes"
  but does not actually check anything.
- **`npm run build` needs the env vars above.** During build a page may log
  `Database connection error: DATABASE_URL ... required`; that is non-fatal and
  the build still succeeds (matches CI).
- Auth flow: unauthenticated requests are redirected by `middleware.ts` to
  `/auth`. Email confirmation is disabled locally (`enable_confirmations = false`),
  so a sign-up immediately creates an active account; the UI still shows
  "Check your email for the confirmation link!" — just switch to "Sign in" and
  log in. `/test-ssr-auth` prints the server-side session JSON and is handy to
  verify auth end-to-end.
