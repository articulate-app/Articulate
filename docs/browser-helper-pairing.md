# Local Browser Helper — pairing & authorization

## User flow

1. Install / start Articulate Browser Helper (LaunchAgent or packaged app).
2. Open Articulate.
3. Helper is detected via `GET 127.0.0.1:17321/health` (no secrets).
4. If unpaired → **Connect** → challenge/attest → paired.
5. Articulate backend mints short-lived JWT → helper verifies with public key.
6. Local interactive browser works. No `NEXT_PUBLIC_ARTICULATE_BRIDGE_TOKEN`.

## Secrets

Server-only (Supabase / Vercel env):

- `LOCAL_BROWSER_JWT_PRIVATE_KEY` — Ed25519 PKCS8 PEM
- `LOCAL_BROWSER_JWT_PUBLIC_KEY` — optional SPKI PEM

Public:

- `GET /api/browser-helper/jwks`

## Token

- Issuer: `articulate-local-browser`
- Audience: `articulate-browser-helper`
- TTL: 5 minutes
- Scopes: `local_browser:open|control|stream|close`

## Legacy

`ARTICULATE_BRIDGE_LEGACY_TOKEN=1` enables the old static token path (off by default).
