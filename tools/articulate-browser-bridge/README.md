# Articulate Browser Helper

Local loopback helper that drives an isolated Chrome/Chromium profile for Articulate.

## Production auth (no frontend env token)

The helper does **not** use `NEXT_PUBLIC_ARTICULATE_BRIDGE_TOKEN`.

1. Helper generates a durable Ed25519 **device identity** (Keychain on macOS when available).
2. Articulate user clicks **Connect** once.
3. Backend issues a short-lived EdDSA JWT after pairing.
4. Frontend uses that JWT for HTTP/WS browser control.

### Server secrets (Supabase / Next env — never `NEXT_PUBLIC_*`)

| Secret | Purpose |
|---|---|
| `LOCAL_BROWSER_JWT_PRIVATE_KEY` | Ed25519 PKCS8 PEM — signs short-lived local-browser JWTs |
| `LOCAL_BROWSER_JWT_PUBLIC_KEY` | Optional SPKI PEM (derived if omitted) |

Dev fallback: keys auto-created under `~/.articulate/browser-helper-signing/` when env secrets are absent.

### Helper env

| Variable | Purpose |
|---|---|
| `ARTICULATE_APP_ORIGIN` | Articulate origin for JWKS fetch (default `http://127.0.0.1:3000`) |
| `ARTICULATE_BRIDGE_ORIGINS` | Comma-separated allowed browser Origins |
| `ARTICULATE_BRIDGE_LEGACY_TOKEN=1` + `ARTICULATE_BRIDGE_TOKEN` | **Migration only**, disabled by default |

## macOS install (background)

```bash
cd tools/articulate-browser-bridge
npm install
chmod +x scripts/install-macos-launchagent.sh
./scripts/install-macos-launchagent.sh
```

Then open Articulate → **Connect** when prompted.

## Dev start

```bash
npm start
```

## Security invariants

- Bind `127.0.0.1` only
- Strict Origin allowlist (no `*`)
- Device private key never leaves the machine
- Control requires short-lived JWT bound to `device_id` + scopes
- No LLM / Cloud API credentials in the helper
