# Articulate Desktop

Native macOS application shell for Articulate.

- **Window**: Electron `BrowserWindow` loading the Articulate web app
- **Browser pane**: Chromium `WebContentsView` (native scrolling, selection, cookies)
- **Agent control**: main-process observe/act API (no screencast)
- **Updates**: `electron-updater` via GitHub Releases

## Development

```bash
npm run desktop:dev
```

Starts Next.js on `http://127.0.0.1:3010`, then opens Articulate Desktop.

## Packaging

```bash
npm run desktop:build     # local DMG + ZIP → desktop/release/
npm run desktop:release   # CI: sign, notarize, publish
```

See [docs/desktop-release.md](../docs/desktop-release.md) for identity, secrets,
notarization, and the `desktop-v*` release workflow.

## Identity

| | |
|--|--|
| Name | Articulate |
| Bundle ID | `com.whyarticulate.articulate` |
| Version | `desktop/package.json` |

## Architecture

```text
Articulate web app (production or local)
        +
thin Electron shell
  ├── BrowserWindow (app UI)
  └── WebContentsView (Browser tabs)
```

Business/UI logic stays in the web app. The shell provides native windowing,
Browser, safe IPC, and auto-update only.
