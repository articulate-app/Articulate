# Generic Agentic Publishing (MVP)

Publish any artifact to an arbitrary external website by letting a browser agent operate a remote browser. There are **no native platform integrations** (LinkedIn, WordPress, Meta, etc.) in this MVP — every destination is just a start URL + persistent browser profile.

## Environment

### Supabase Edge secrets

`BROWSER_USE_API_KEY` is already configured in the Supabase project secrets. The edge function reads it only via:

```ts
const browserUseApiKey = Deno.env.get("BROWSER_USE_API_KEY")
```

Optional overrides (also edge-only):

```bash
# supabase secrets set BROWSER_USE_MODEL=minimax-m3
# supabase secrets set BROWSER_USE_BASE_URL=https://api.browser-use.com/api/v4
```

Default model is `minimax-m3` (works on the Browser Use free plan). Paid models like `grok-4.5` require credits; the provider retries once with `minimax-m3` if a free-plan 403 is returned.

Never put `BROWSER_USE_API_KEY` in `NEXT_PUBLIC_*` vars, the database, client code, or logs.

### Provider transport

Production uses the **Browser Use Cloud API V4 REST** client (`fetch`) inside `BrowserAgentProvider`, not the Cursor Browser Use MCP and not a separate Node service. The official `browser-use-sdk` npm package targets Node (dotenv/zod) and is not used in the Deno edge runtime for this MVP.

### Deploy

Migration + `agentic-publishing` edge function have been applied/deployed to the Articulate Supabase project. Redeploy after code changes with:

```bash
npx supabase functions deploy agentic-publishing --project-ref hlszgarnpleikfkwujph
```

## First end-to-end test

1. Open an artifact (project/task optional).
2. Click **Publish** → reuses one Browser tab titled by destination when possible.
3. Select destination → **Start publication** creates a `publication_run` with frozen `source_snapshot` immediately.
4. If the destination needs login: Live View opens (`needs_user`); sign in directly in the browser.
5. Click **I've signed in** → auth verify succeeds, then the **same** Browser Use `session_id` automatically resumes the pending publication (not another auth-only task).
6. If already connected: agent starts preparing immediately on the profile/session.
7. Agent creates/populates the draft and stops at `awaiting_publish_confirmation`.
8. **Confirm publication** → same-session final publish once → `published` / `uncertain`.

Live View embeds with `ui=false` (Browser Use tabs/chrome hidden). Articulate draws its own Cursor-like toolbar above the stream: back, forward, reload, URL field, and history. Navigation is driven server-side via CDP (`control_browser`) so CDP URLs never reach the client.

### Remote browser viewport vs Articulate viewer

These are independent:

1. **Remote Browser Use screen** — stable desktop session configuration (`browserSettings.screenWidth/Height` when a *new* browser is provisioned). Default is **1440×900** (`BROWSER_USE_SCREEN_WIDTH` / `BROWSER_USE_SCREEN_HEIGHT` in `app/lib/publishing/browser-viewport.ts`, mirrored in the edge function). Follow-up runs reuse the live browser and its dimensions. Pane resize / maximize must **not** recreate sessions or change remote screen size.
2. **Articulate viewer** — responsive Fit (default) / Fill modes that scale the Live View iframe inside the right pane (or chat preview) while preserving aspect ratio. Unused Fit space is Articulate UI background (`bg-gray-50`), not Browser Use black letterboxing. **Take control** and other interactive states default to Fit so the full remote screen stays reachable.

`allowResizing: false` keeps Live View from fighting the provisioned desktop size. Empty / loading / disconnect states use Articulate placeholders — never the provider’s dark interstitial. Recording defaults to `record: false` for the performance baseline.

### Destination browser region

Durable auth is `provider_profile_id` (Browser Use profile). Sessions are ephemeral per publication.

Proxy region is per-destination metadata:

```json
{ "browser_region": "pt", "proxy_country_code": "pt" }
```

Articulate Squarespace prefers `browser_region = "pt"`. Do **not** globally hard-code Portugal. When unset, Browser Use’s documented default (`us`) applies. Pass `null` to disable residential proxy for QA/internal sites.

**Free-plan note:** Browser Use free accounts may reject non-US proxies (`Proxy country 'PT' is not available on the free plan`). The Cloud provider retries once with `us` and logs `proxy_fallback_used`. Paid credits unlock country-specific residential proxies.

### Cloud vs Local

Cloud remains the zero-install default. The Local Browser spike stays available for comparison; do not require the Local Helper for Cloud mode.

### Future: Profile Sync (optional)

Browser Use supports [syncing local cookies into a cloud profile](https://docs.browser-use.com/cloud/guides/profile-sync). This is **not** enabled. If Google/SSO continues to challenge fresh cloud logins, Profile Sync can be offered later as an **explicit user action** — never automatic cookie import.

The main AI can also start the same flow via `list_publishing_destinations` + `publish_content` (artifact **or** inline content). Active runs are controlled from chat via `get_publication_state`, `continue_publication`, `confirm_publication`, and `cancel_publication`. AI-initiated runs render a compact Live View preview in chat; **Open** focuses the same Browser peer tab / same `publication_run`.

### Destination memory

`publishing_destinations.memory` (JSONB) stores lightweight semantic memory — not selectors or scripts:

- `entry_points` (per content type)
- `guidance`
- `last_successful_entry_url`
- `last_successful_publication_url`

Navigation priority when starting a publication:

1. content-type entry point
2. last successful entry (same content type when known)
3. destination `start_url`

Successful editor/publish URLs are learned heuristically after `awaiting_publish_confirmation` / `published`. Generic login/homepage/Live View URLs are rejected. Destination guidance can auto-answer Browser Use collection clarifications before interrupting the user.

Manage destinations under Project settings → **Publishing**.

The main AI can also create/configure destinations conversationally via `configure_publishing_destination` (same rows as Settings). A missing destination is treated as a solvable dependency: when the user provides a platform/URL, the AI configures it, opens the browser for sign-in, and continues the original publish request via `pending_publication` without sending the user to Settings.

## Architecture

| Layer | Path |
|-------|------|
| Tables | `publishing_destinations` (+ `memory`), `publication_runs` (`source_type`, `source_snapshot`, nullable `artifact_id`, scheduling columns) |
| Provider abstraction | `supabase/functions/_shared/browser-agent/` |
| Browser Use V4 | `.../providers/browser-use.ts` |
| Publishing core | `supabase/functions/_shared/publishing/` |
| Edge API | `supabase/functions/agentic-publishing/` |
| AI tools | `publish_content`, `list_publishing_destinations`, `configure_publishing_destination`, `get_publication_state`, `continue_publication`, `confirm_publication`, `cancel_publication`, `list_scheduled_publications`, `reschedule_publication`, `cancel_scheduled_publication`, `publish_scheduled_now` |
| Right-pane Browser tabs | `app/store/right-pane-tabs.ts`, `features/artifacts/browser-session-pane.tsx` |
| AI chat preview | `features/ai-chat/PublicationBrowserPreviewCard.tsx` |
| Publish UI | `features/artifacts/artifact-publish-menu.tsx`, `schedule-publication-dialog.tsx` |
| Destination settings | `app/components/projects/project-publishing-destinations-settings.tsx` |
| Client service | `app/lib/services/agentic-publishing.ts` |

Future providers (Browserbase + Stagehand, Computer Use) plug into `createBrowserAgentProvider` without changing the UI or run lifecycle.

## Scheduled publishing (one-time)

Supports **Publish now** or **Schedule for later**. Recurring schedules are out of scope.

### Model

`publication_runs` scheduling fields:

| Column | Meaning |
|--------|---------|
| `publish_mode` | `now` \| `scheduled` |
| `scheduled_at` | UTC instant (`timestamptz`) |
| `schedule_timezone` | IANA zone used for display/interpretation (e.g. `Europe/Lisbon`) |
| `schedule_strategy` | `external` (CMS native schedule) \| `internal` (Articulate cron) |
| `scheduled_external_at` | Confirmed external CMS schedule instant when strategy is external |
| `execution_started_at` | When an internal schedule was claimed |
| `published_at` | When verified `published` (with `scheduled_at` / `execution_started_at` for delay inspection) |

Lifecycle reuses the existing status machine and adds `scheduled` (parked). There is no second status machine.

### Strategies

1. **External/native (preferred when discoverable)** — Browser Use prepares content, configures the CMS schedule UI, stops before committing, user confirms once, then the agent commits and verifies. Session closes afterward; the CMS owns publish time.
2. **Internal (fallback)** — After schedule confirmation, the run parks at `status=scheduled` with frozen `source_snapshot`. No browser stays open. At due time, pg_cron dispatches `agentic-publishing` → atomic claim → new Browser Use session + destination profile/memory → publish/verify.

Stale internal schedules older than `SCHEDULE_STALE_HOURS` (default **24**) become `needs_user` instead of auto-publishing.

### Cron / claim

- Job: `dispatch-scheduled-publications` (`* * * * *`) → `POST agentic-publishing` `action=dispatch_scheduled_publications`
- Claim RPC: `claim_scheduled_publication_run(p_run_id, p_stale_hours)` — single-winner `scheduled` → `queued` (or `needs_user` if stale)

### AI / UI

- `publish_content` accepts `publish_mode`, `scheduled_at`, `timezone` (natural language resolved by the main model before the tool call).
- Management tools: list / reschedule / cancel / publish-now for scheduled runs.
- Artifact **Publish ▾** menu: per destination **Publish now** / **Schedule…** + compact date/time dialog.

## Local browser execution (spike)

Cloud Browser Use stays intact. LOCAL execution uses a localhost helper + server-side agent reasoning:

| Piece | Path |
|-------|------|
| Local helper | `tools/articulate-browser-bridge/` |
| Dev probe UI | `/dev/local-browser` |
| Client | `app/lib/local-browser-bridge.ts` |
| Agent step (LLM) | `supabase/functions/local-browser-agent/` |
| Provider stub | `browser_use_local` in `.../providers/local-bridge.ts` |
| Notes | `docs/local-browser-spike.md` |

Phase 2 architecture: edge LLM proposes actions → frontend relay → Bridge CDP → same isolated Chrome. No production model keys in the helper. Target routing (not production UI yet): `browser_execution_mode = local | cloud | auto`.
