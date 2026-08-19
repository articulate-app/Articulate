import type { SupabaseClient } from "@supabase/supabase-js"
import type * as Y from "yjs"
import { bytesToBase64 } from "./binary"
import { encodeYDocSnapshot, yDocToHtml, yDocToPlainText, yDocToTipTapJson } from "./ydoc-content"

export const CHECKPOINT_IDLE_MS = 25_000

export type CheckpointSource = "manual" | "ai" | "restore" | "system" | "publish"

export async function createArtifactCheckpoint(args: {
  supabase: SupabaseClient
  artifactId: string
  document: Y.Doc
  seq: number
  changeSource?: CheckpointSource
  summary?: string | null
  insertCount?: number
  deleteCount?: number
  aiRunId?: string | null
  aiMessageId?: string | null
  aiThreadId?: string | null
}): Promise<{ ok: boolean; versionId?: string; versionNumber?: number; error?: string }> {
  const encoded = encodeYDocSnapshot(args.document)
  const html = yDocToHtml(args.document)
  const text = yDocToPlainText(args.document).trim()
  const { data, error } = await args.supabase.rpc("artifact_collab_checkpoint_v1", {
    p_artifact_id: args.artifactId,
    p_seq: args.seq,
    p_snapshot: {
      title: null,
      content_text: text,
      content_json: {
        version: 1,
        editor_kind: "rich_text",
        content_format: "tiptap_json",
        tiptap: yDocToTipTapJson(args.document),
        blocks: [{ id: "body", type: "rich_text", html, text }],
      },
    },
    p_change_source: args.changeSource ?? "manual",
    p_summary: args.summary ?? null,
    p_diff_stats: {
      insert_count: args.insertCount ?? 0,
      delete_count: args.deleteCount ?? 0,
    },
    p_state_vector_base64: bytesToBase64(encoded.stateVector),
    p_ai_run_id: args.aiRunId ?? null,
    p_ai_message_id: args.aiMessageId ?? null,
    p_ai_thread_id: args.aiThreadId ?? null,
  })
  if (error) return { ok: false, error: error.message }
  const row = data && typeof data === "object" ? data as Record<string, unknown> : {}
  return {
    ok: row.ok === true,
    versionId: typeof row.version_id === "string" ? row.version_id : undefined,
    versionNumber: typeof row.version_number === "number" ? row.version_number : undefined,
  }
}

export function createIdleCheckpointScheduler(args: {
  idleMs?: number
  onIdle: () => void
}): { touch: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    touch() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        args.onIdle()
      }, args.idleMs ?? CHECKPOINT_IDLE_MS)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
