import type { SupabaseClient } from "@supabase/supabase-js"
import type * as Y from "yjs"
import { bytesToBase64 } from "./binary"
import { createArtifactCheckpoint } from "./checkpoints"
import { extractArtifactSeedHtml, extractArtifactSeedJson, htmlToTipTapJson, replaceYDocContent } from "./ydoc-content"
import { createIdempotencyKey } from "./sync-protocol"
import { peekArtifactCollabSession } from "./provider-registry"

export async function restoreArtifactCheckpoint(args: {
  supabase: SupabaseClient
  artifactId: string
  snapshot: { content_json?: unknown; content_text?: string | null }
  document?: Y.Doc | null
  lastSeq?: number
}): Promise<{ ok: boolean; error?: string }> {
  const session = peekArtifactCollabSession(args.artifactId)
  const document = args.document ?? session?.document
  if (!document) return { ok: false, error: "ydoc_not_open" }

  const json = extractArtifactSeedJson(args.snapshot.content_json)
    ?? htmlToTipTapJson(
      extractArtifactSeedHtml(args.snapshot.content_json)
      ?? String(args.snapshot.content_text ?? "<p></p>"),
    )
  const update = replaceYDocContent(document, json, "restore")
  const provider = session?.provider as { lastSeq?: number; flush?: () => Promise<void> } | null
  const { error } = await args.supabase.rpc("artifact_collab_persist_update_v1", {
    p_artifact_id: args.artifactId,
    p_update_base64: bytesToBase64(update),
    p_idempotency_key: createIdempotencyKey("restore"),
    p_origin: "restore",
    p_actor_type: "system",
  })
  if (error) return { ok: false, error: error.message }
  await provider?.flush?.()
  const seq = Number(provider?.lastSeq ?? args.lastSeq ?? 0)
  const checkpoint = await createArtifactCheckpoint({
    supabase: args.supabase,
    artifactId: args.artifactId,
    document,
    seq,
    changeSource: "restore",
    summary: "Restored editorial checkpoint",
  })
  if (!checkpoint.ok) return { ok: false, error: checkpoint.error }
  return { ok: true }
}
