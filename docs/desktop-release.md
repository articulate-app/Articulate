# Articulate Desktop — release guide

Articulate Desktop is a thin Electron shell around the production web app at
`https://app.whyarticulate.com`, plus a native Browser (`WebContentsView`).

Ordinary web deploys do **not** require a new DMG. Ship a Desktop release only
when native shell code changes (main/preload/browser manager/agent/updater/
Electron version/security).

## Local development

```bash
npm run desktop:dev
```

Loads `http://127.0.0.1:3010` (Next.js). No Apple credentials required.

Override URL:

```bash
ARTICULATE_DESKTOP_URL=http://127.0.0.1:3010/auth npm run desktop:electron
```

## Local packaged build (verification)

```bash
npm run desktop:build
```

Produces unsigned (or ad-hoc signed) Universal artifacts under:

```text
desktop/release/Articulate.dmg
desktop/release/Articulate-<version>-mac.zip
desktop/release/latest-mac.yml
```

On a Mac without a Developer ID certificate, Gatekeeper will warn — expected
for local verification only.

Open the DMG → drag **Articulate** to **Applications** → launch from Applications.

## Universal vs arch-specific

Default release builds produce a **Universal** macOS binary (`arm64` + `x64`) in one
DMG/ZIP. No native Node addons are packaged with the shell, so Universal is safe.

If Universal ever fails in CI, fall back temporarily to separate artifacts and
document why — do not ship a broken merge.

## Identity

| Field | Value |
|-------|--------|
| productName | Articulate |
| appId / bundle id | `com.whyarticulate.articulate` |
| Desktop version | `desktop/package.json` → `version` |
| Production URL | `https://app.whyarticulate.com/auth` |

Do not change `appId` after production releases begin.

## Versioning

Desktop version is independent of the web app (`package.json` root `0.1.0`).

Bump `desktop/package.json` `version` when releasing native changes, then tag:

```text
desktop-v1.0.0
desktop-v1.0.1
desktop-v1.1.0-beta.1
```

## Production release (CI)

1. Commit Desktop changes and bump `desktop/package.json` version.
2. Push to `main` (or your release branch).
3. Create and push the tag:

```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

4. GitHub Actions workflow `.github/workflows/desktop-release.yml`:
   - installs deps
   - builds the shell (`desktop:compile:prod`)
   - signs with Developer ID
   - notarizes with App Store Connect API key
   - publishes DMG + ZIP + `latest-mac.yml` to a GitHub Release

Users on older Desktop builds receive the update via `electron-updater`.

## Required GitHub Actions secrets

| Secret | Description |
|--------|-------------|
| `MACOS_CERTIFICATE_BASE64` | Developer ID Application `.p12` encoded as base64 |
| `MACOS_CERTIFICATE_PASSWORD` | Password for that `.p12` |
| `KEYCHAIN_PASSWORD` | Temporary CI keychain password (any strong random value) |
| `APPLE_API_KEY_BASE64` | App Store Connect API `.p8` private key, base64 |
| `APPLE_API_KEY_ID` | Key ID (e.g. `AB12CD34EF`) |
| `APPLE_API_ISSUER` | Issuer UUID from App Store Connect |
| `APPLE_TEAM_ID` | Apple Team ID (e.g. `P2XHQTH423`) |

`GITHUB_TOKEN` is provided automatically for publishing Releases.

Optional repository variable:

| Variable | Default |
|----------|---------|
| (none required) | Production URL is hard-set in the workflow to `https://app.whyarticulate.com/auth` |

### Encode secrets locally

```bash
base64 -i DeveloperID.p12 | pbcopy   # → MACOS_CERTIFICATE_BASE64
base64 -i AuthKey_XXXXX.p8 | pbcopy  # → APPLE_API_KEY_BASE64
```

Never commit `.p12`, `.p8`, or passwords.

## Apple Developer one-time setup

1. Enroll in the [Apple Developer Program](https://developer.apple.com).
2. Create a **Developer ID Application** certificate (not Apple Distribution / iPhone).
3. Export it from Keychain as `.p12` with a password.
4. In App Store Connect → Users and Access → Integrations → **App Store Connect API**:
   - Create a key with **Developer** (or Admin) access
   - Download the `.p8` once
   - Note Key ID + Issuer ID
5. Confirm Team ID in the membership page.
6. Add all secrets above to the GitHub repo.

## Signing & notarization verification (after first CI release)

```bash
codesign --verify --deep --strict --verbose=2 /Applications/Articulate.app
spctl --assess --type execute --verbose /Applications/Articulate.app
xcrun stapler validate /Applications/Articulate.app
```

Gatekeeper should accept a notarized Developer ID build without right-click workarounds.

## Auto-update

- Host: GitHub Releases (`articulate-app/Articulate`)
- Client: `electron-updater` in the Desktop shell
- Behavior: check shortly after launch + every 4 hours; download in background;
  install on quit (or user chooses **Restart now**)
- Metadata file: `latest-mac.yml` (published with the ZIP)

Do not force-quit active browser/publishing sessions; prefer install-on-quit.

### Channels

- **stable**: tags like `desktop-v1.0.0` → normal GitHub Release
- **beta**: versions containing `-` (e.g. `1.0.1-beta.1`); set
  `ARTICULATE_DESKTOP_CHANNEL=beta` for clients that should accept prereleases
  (optional; default clients stay on stable)

## Rollback

1. Do not delete the previous GitHub Release assets.
2. Re-publish or re-tag a known-good Desktop version as the newest release, **or**
   push a new patch (`desktop-v1.0.2`) that restores prior shell behavior.
3. Users auto-update to the newest published version on their channel.

## Secrets must not ship in the DMG

The packaged app is a thin shell. It must not contain:

- `SUPABASE_SERVICE_ROLE_KEY`
- OpenAI / Browser Use / Apple / GitHub private keys

Only public frontend configuration lives in the web app deployment.

## Web ↔ Desktop compatibility

`window.articulateDesktop.getInfo()` returns:

```text
desktopVersion
capabilities[]  # browser, desktop_browser_provider, agent_control, auto_update, …
```

If the web app needs a newer shell capability, show:

> A newer Articulate Desktop version is required for this feature.

Helpers: `app/lib/articulate-desktop.ts` → `desktopHasCapability`, `isDesktopVersionAtLeast`.

## Commands summary

| Script | Purpose |
|--------|---------|
| `npm run desktop:dev` | Dev shell + local Next |
| `npm run desktop:compile` | Build main/preload (dev) |
| `npm run desktop:compile:prod` | Build main/preload (production URL) |
| `npm run desktop:build` | Local DMG/ZIP (no publish) |
| `npm run desktop:release` | Sign/notarize/publish (CI) |
