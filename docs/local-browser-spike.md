# Local Browser — production local-first

## Status

Local browser is the **default** for interactive / immediate publishing when the
Articulate Browser Bridge is healthy on the user machine. Browser Use Cloud V4
remains the fallback and the only provider for unattended internal schedules.

## Architecture

```text
Publishing Engine (agentic-publishing)
        ↓
resolveBrowserProvider(...)
        ↓
┌─────────────────────────────┐
│ LocalBridgeProvider         │  BrowserUseProvider (Cloud V4)
│ default (interactive)       │  fallback / unattended
│ client ↔ Bridge :17321      │  api.browser-use.com
│ CDP isolated Chrome         │  Live View + profiles
└─────────────────────────────┘
```

Edge cannot reach `127.0.0.1`. Local runs are coordinated on the edge
(`LocalBridgeProvider` placeholders + `report_local_publication`) and driven by
the web client via the Bridge + `local-browser-agent`.

## Components

| Piece | Path |
|-------|------|
| Bridge | `tools/articulate-browser-bridge/` |
| Client bridge API | `app/lib/local-browser-bridge.ts` |
| Local publication driver | `app/lib/local-publication-driver.ts` |
| Provider resolver | `supabase/functions/_shared/browser-agent/resolve-browser-provider.ts` |
| Local provider | `supabase/functions/_shared/browser-agent/providers/local-bridge.ts` |
| Agent step (LLM) | `supabase/functions/local-browser-agent/` |
| Next proxy | `app/api/local-browser-agent/route.ts` |
| Probe UI | `/dev/local-browser` |

## Security

- Loopback bind (`127.0.0.1`) + Bearer token + Origin allowlist
- Durable profiles under `~/.articulate/browser-profiles/<key>` (not personal Chrome)
- No production LLM keys in the helper
- Password fields redacted in browser state

## How to run

```bash
cd tools/articulate-browser-bridge && npm start
# Local Browser spike notes (historical)

> **Production auth:** do not use `NEXT_PUBLIC_ARTICULATE_BRIDGE_TOKEN`.
> See `docs/browser-helper-pairing.md` for pairing + short-lived JWTs.
```

Then Publish now from the app. If the bridge is healthy, provider = local.

## Scheduling

- **Native/external (preferred while online):** local Chrome configures CMS schedule now; browser closes; no Cloud at publish time.
- **Internal:** parked `scheduled` run; cron executes later via **Cloud only**. Refuses to create if Cloud is unavailable.
