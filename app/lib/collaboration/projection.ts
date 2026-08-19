import type { SupabaseClient } from "@supabase/supabase-js"
import type * as Y from "yjs"
import { bytesToBase64 } from "./binary"
import { isYDocEditoriallyEmpty, shouldProjectCollaborativeYDoc } from "./empty-ydoc"
import { artifactHasExistingEditorContent } from "./seed-from-html"
import {
  buildProjectedContentJson,
  encodeYDocSnapshot,
  yDocToHtml,
  yDocToPlainText,
  yDocToTipTapJson,
} from "./ydoc-content"

export const PROJECTION_DEBOUNCE_MS = 800

export type ProjectionStatus = "idle" | "pending" | "projected" | "error"

export async function projectYDocToArtifact(args: {
  supabase: SupabaseClient
  artifactId: string
  document: Y.Doc
  seq: number
  previousContentJson?: unknown
  previousContentText?: string | null
}): Promise<{ ok: boolean; projectedSeq: number; error?: string }> {
  if (!shouldProjectCollaborativeYDoc({
    ydocEmpty: isYDocEditoriallyEmpty(args.document),
    hasExistingProjectedContent: artifactHasExistingEditorContent({
      contentJson: args.previousContentJson,
      contentText: args.previousContentText,
    }),
  })) {
    return { ok: false, projectedSeq: args.seq, error: "empty_ydoc_overwrite_blocked" }
  }

  const html = yDocToHtml(args.document)
  const text = yDocToPlainText(args.document).trim()
  const tiptap = yDocToTipTapJson(args.document)
  const encoded = encodeYDocSnapshot(args.document)
  const { data, error } = await args.supabase.rpc("artifact_collab_project_v1", {
    p_artifact_id: args.artifactId,
    p_seq: args.seq,
    p_content_json: buildProjectedContentJson({
      previous:
        args.previousContentJson && typeof args.previousContentJson === "object" && !Array.isArray(args.previousContentJson)
          ? args.previousContentJson as Record<string, unknown>
          : null,
      html,
      text,
      tiptap,
    }),
    p_content_text: text,
    p_state_vector_base64: bytesToBase64(encoded.stateVector),
  })
  if (error) return { ok: false, projectedSeq: args.seq, error: error.message }
  const row = data && typeof data === "object" ? data as { projected_seq?: number } : {}
  return { ok: true, projectedSeq: Number(row.projected_seq ?? args.seq) }
}

export function createDebouncedProjection(args: {
  debounceMs?: number
  project: () => Promise<void>
}): { schedule: () => void; flush: () => Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  let inFlight: Promise<void> | null = null

  const run = async () => {
    pending = false
    inFlight = args.project()
    try {
      await inFlight
    } finally {
      inFlight = null
      if (pending) void run()
    }
  }

  return {
    schedule() {
      pending = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void run()
      }, args.debounceMs ?? PROJECTION_DEBOUNCE_MS)
    },
    async flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (inFlight) await inFlight
      if (pending) await run()
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = false
    },
  }
}
