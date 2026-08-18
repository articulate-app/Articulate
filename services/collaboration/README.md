# Articulate collaboration server

Self-hosted [Hocuspocus](https://github.com/ueberdosis/hocuspocus) (MIT) + [Yjs](https://github.com/yjs/yjs) (MIT) WebSocket server. TipTap Cloud / Liveblocks are not used.

## Local

```bash
cp services/collaboration/.env.example services/collaboration/.env
# fill SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
cd services/collaboration
npm install
npm run dev
```

Health: `GET http://127.0.0.1:1234/health`

Rooms: `artifact:{artifact_uuid}`

The client sends the Supabase access token. The server validates it and calls `artifact_collab_authorize_v1`. Never send `userId` as a trusted input. Never expose the service-role key to the browser.

Collaboration stays off until `collab.feature_flags` (global) is enabled, or `ARTIFACT_COLLAB_ENABLED=true` for local override. First-wave types: `document`, `article`. HTML email / media types stay on the snapshot editor.

## Production

Run this Node process on a host with persistent WebSockets (Fly, Render, Railway, or a VM). Do not deploy it as a Supabase Edge Function.

Required env:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COLLAB_PORT` (default `1234`)

Apply `supabase/migrations/20260818182907_artifact_collaboration_ydoc.sql` before pointing the server at a database.

Rollback: set `collab.feature_flags` global `enabled = false`. Clients keep the existing snapshot editor.
