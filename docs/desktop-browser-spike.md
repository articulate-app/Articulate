# Articulate Desktop Browser

## Active providers

```text
Desktop available → articulate_desktop (Electron WebContentsView)
else / unattended → browser_use (Cloud)
```

Local Browser Bridge (`browser_use_local`) is **not** part of runtime resolution.

## Run

```bash
npm run desktop:dev
```

Production packaging and release: `docs/desktop-release.md`.

## Agent control

Human input stays native on the WebContentsView.

Agent control (main process only):

- `observe` — compact semantic page state
- `agentAction` — navigate/click/type/scroll/… with generation checks
- human interaction bumps `agentGeneration` and sets `controlOwner = human`

See `desktop/agent-controller.ts` and `app/lib/desktop-browser-provider.ts`.
