import type { SupabaseClient } from "@supabase/supabase-js"
import type * as Y from "yjs"
import { loadYdocFromPersisted } from "./apply-ai-proposal"
import { base64ToBytes, bytesToBase64 } from "./binary"
import { createArtifactCheckpoint } from "./checkpoints"
import { projectYDocToArtifact } from "./projection"
import { peekArtifactCollabSession } from "./provider-registry"
import { createIdempotencyKey } from "./sync-protocol"
import {
  extractArtifactSeedHtml,
  extractArtifactSeedJson,
  htmlToTipTapJson,
  replaceYDocContent,
} from "./ydoc-content"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

async function loadPersistedYdoc(
  supabase: SupabaseClient,
  artifactId: string,
): Promise<Y.Doc | null> {
  const loaded = await supabase.rpc("artifact_collab_load_document_v1", {
    p_artifact_id: artifactId,
    p_after_seq: 0,
  })
  if (loaded.error) return null
  const row = asRecord(loaded.data) ?? {}
  const updates = Array.isArray(row.updates) ? row.updates : []
  return loadYdocFromPersisted({
    snapshot: typeof row.snapshot_base64 === "string" && row.snapshot_base64
      ? base64ToBytes(row.snapshot_base64)
      : null,
    updates: updates.flatMap((item) => {
      const rec = asRecord(item)
      const encoded = typeof rec?.update_base64 === "string" ? rec.update_base64 : ""
      if (!encoded) return []
      return [{
        update: base64ToBytes(encoded),
        idempotencyKey: String(rec?.idempotency_key ?? ""),
        seq: Number(rec?.seq ?? 0),
      }]
    }),
  })
}

export async function restoreArtifactCheckpoint(args: {
  supabase: SupabaseClient
  artifactId: string
  snapshot: {
    title?: string | null
    content_json?: unknown
    content_text?: string | null
  }
  document?: Y.Doc | null
  lastSeq?: number
  summary?: string | null
}): Promise<{ ok: boolean; versionNumber?: number; error?: string }> {
  const session = peekArtifactCollabSession(args.artifactId)
  const liveDocument = args.document ?? session?.document ?? null
  const document = liveDocument ?? await loadPersistedYdoc(args.supabase, args.artifactId)
  if (!document) return { ok: false, error: "ydoc_not_open" }

  const json = extractArtifactSeedJson(args.snapshot.content_json)
    ?? htmlToTipTapJson(
      extractArtifactSeedHtml(args.snapshot.content_json)
      ?? String(args.snapshot.content_text ?? "<p></p>"),
    )
  const update = replaceYDocContent(document, json, "restore")

  const provider = session?.provider as {
    lastSeq?: number
    flush?: () => Promise<void>
    readOnly?: boolean
  } | null

  let seq = 0
  if (provider?.flush && provider.readOnly !== true) {
    await provider.flush()
    seq = Number(provider.lastSeq ?? 0)
  } else {
    const idempotencyKey = createIdempotencyKey("restore")
    const persist = await args.supabase.rpc("artifact_collab_persist_update_v1", {
      p_artifact_id: args.artifactId,
      p_update_base64: bytesToBase64(update),
      p_idempotency_key: idempotencyKey,
      p_client_id: idempotencyKey,
      p_origin: "restore",
      p_actor_type: "user",
    })
    if (persist.error) return { ok: false, error: persist.error.message }
    seq = Number(asRecord(persist.data)?.seq ?? args.lastSeq ?? 0)
  }
  if (!Number.isFinite(seq) || seq <= 0) {
    return { ok: false, error: "restore_seq_missing" }
  }

  const projected = await projectYDocToArtifact({
    supabase: args.supabase,
    artifactId: args.artifactId,
    document,
    seq,
    previousContentJson: args.snapshot.content_json,
    previousContentText: args.snapshot.content_text,
  })
  if (!projected.ok) return { ok: false, error: projected.error ?? "projection_failed" }

  const title = String(args.snapshot.title ?? "").trim().slice(0, 240) || null
  if (title) {
    await args.supabase.from("artifacts").update({ title }).eq("id", args.artifactId)
  }

  const checkpoint = await createArtifactCheckpoint({
    supabase: args.supabase,
    artifactId: args.artifactId,
    document,
    seq,
    changeSource: "restore",
    summary: args.summary ?? "Restored editorial checkpoint",
    title,
  })
  if (!checkpoint.ok) return { ok: false, error: checkpoint.error }
  return { ok: true, versionNumber: checkpoint.versionNumber }
}
