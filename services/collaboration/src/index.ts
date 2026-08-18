import { Server } from "@hocuspocus/server"
import * as Y from "yjs"
import { assertCollabDocumentSize } from "../../../app/lib/collaboration/limits"
import { parseArtifactCollaborationRoom } from "../../../app/lib/collaboration/room"
import {
  canCompleteYdocSeed,
  isYdocSeedFailed,
  isYdocSeedReady,
  shouldWaitForYdocSeed,
} from "../../../app/lib/collaboration/seed-policy"
import { CollaborationAuthError, resolveCollaborationAuth } from "./auth"
import { collabConfig } from "./config"
import {
  authorizeArtifactForToken,
  completeYdocSeed,
  createServiceSupabase,
  createUserSupabase,
  failYdocSeed,
  fetchOrClaimYdoc,
  loadArtifactContent,
  storeYdocSnapshot,
} from "./database"
import { applyEncodedUpdate, encodeYdocSnapshot, seedYdocFromArtifactContent } from "./seed"

const service = createServiceSupabase(collabConfig.supabaseUrl, collabConfig.supabaseServiceRoleKey)

const pendingFlush = new Set<string>()

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadOrSeedDocument(artifactId: string, document: Y.Doc): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const claim = await fetchOrClaimYdoc(service, artifactId)
    if (isYdocSeedReady(claim) && claim.snapshot_base64) {
      applyEncodedUpdate(document, claim.snapshot_base64)
      return
    }
    if (isYdocSeedFailed(claim)) {
      throw new Error(claim.seed_error || "ydoc_seed_failed")
    }
    if (shouldWaitForYdocSeed(claim)) {
      await wait(250)
      continue
    }
    if (!canCompleteYdocSeed(claim) || !claim.claim_token) {
      throw new Error("ydoc_seed_claim_failed")
    }
    try {
      const artifact = await loadArtifactContent(service, artifactId)
      const seeded = seedYdocFromArtifactContent({
        contentJson: artifact.content_json,
        contentText: artifact.content_text,
      })
      const encoded = encodeYdocSnapshot(seeded.document)
      assertCollabDocumentSize(encoded.byteSize, collabConfig.maxDocumentBytes)
      applyEncodedUpdate(document, encoded.snapshotBase64)
      const completed = await completeYdocSeed({
        service,
        artifactId,
        claimToken: claim.claim_token,
        snapshotBase64: encoded.snapshotBase64,
        stateVectorBase64: encoded.stateVectorBase64,
        seededFrom: seeded.seededFrom,
      })
      if (completed.ok === false) {
        throw new Error(completed.code || "seed_claim_mismatch")
      }
      return
    } catch (error) {
      await failYdocSeed({
        service,
        artifactId,
        claimToken: claim.claim_token,
        error: error instanceof Error ? error.message : "ydoc_seed_failed",
      }).catch(() => undefined)
      throw error
    }
  }
  throw new Error("ydoc_seed_timeout")
}

const server = Server.configure({
  name: "articulate-collaboration",
  address: collabConfig.host,
  port: collabConfig.port,
  timeout: 30_000,
  debounce: 2_000,
  maxDebounce: 10_000,
  async onAuthenticate(data) {
    const artifactId = parseArtifactCollaborationRoom(data.documentName)
    if (!artifactId) throw new CollaborationAuthError("invalid_room")
    const token = String(data.token ?? "").replace(/^Bearer\s+/i, "").trim()
    const userClient = createUserSupabase(collabConfig.supabaseUrl, collabConfig.supabaseAnonKey, token)
    const authorize = await authorizeArtifactForToken(userClient, artifactId)
    const resolved = resolveCollaborationAuth({
      documentName: data.documentName,
      token,
      authorize,
      envFlagEnabled: collabConfig.envFlagEnabled,
    })
    data.connection.readOnly = resolved.readOnly
    return {
      userId: resolved.userId,
      name: resolved.name,
      avatar: resolved.avatar,
      color: presenceColor(resolved.userId),
    }
  },
  async onLoadDocument(data) {
    const artifactId = parseArtifactCollaborationRoom(data.documentName)
    if (!artifactId) throw new Error("invalid_room")
    await loadOrSeedDocument(artifactId, data.document)
  },
  async onStoreDocument(data) {
    const artifactId = parseArtifactCollaborationRoom(data.documentName)
    if (!artifactId) return
    pendingFlush.add(artifactId)
    try {
      const encoded = encodeYdocSnapshot(data.document)
      assertCollabDocumentSize(encoded.byteSize, collabConfig.maxDocumentBytes)
      const stored = await storeYdocSnapshot({
        service,
        artifactId,
        snapshotBase64: encoded.snapshotBase64,
        stateVectorBase64: encoded.stateVectorBase64,
      })
      if (stored.ok === false) {
        console.error("[collab] store rejected", stored.code, artifactId)
      }
    } finally {
      pendingFlush.delete(artifactId)
    }
  },
  async onRequest(data) {
    const url = new URL(data.request.url ?? "/", "http://localhost")
    if (url.pathname === "/health") {
      data.response.writeHead(200, { "content-type": "application/json" })
      data.response.end(JSON.stringify({
        ok: true,
        service: "collaboration",
        pending_flush: pendingFlush.size,
      }))
      return
    }
    data.response.writeHead(404)
    data.response.end()
  },
})

function presenceColor(userId: number): string {
  const palette = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0f766e", "#b45309"]
  const index = Number.isInteger(userId) ? Math.abs(userId) % palette.length : 0
  return palette[index] ?? palette[0]
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[collab] ${signal} — flushing ${pendingFlush.size} document(s)`)
  try {
    await server.destroy()
  } finally {
    process.exit(0)
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
})
process.on("SIGINT", () => {
  void shutdown("SIGINT")
})

void server.listen().then(() => {
  console.log(`[collab] listening on ${collabConfig.host}:${collabConfig.port}`)
})
