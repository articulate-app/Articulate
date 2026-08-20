import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0"
import * as Y from "https://esm.sh/yjs@13.6.27"
import {
  isEditoriallyEquivalent,
  normalizePlainText,
  patchedContentToTipTapDoc,
  replaceYDocWithTipTapJson,
  resolveAiApplyDocument,
  tipTapJsonToHtml,
  tipTapJsonToPlainText,
  yXmlPlainText,
  yXmlToTipTapDoc,
} from "./tiptap-json-to-yxml.ts"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  bytes.forEach((value) => {
    binary += String.fromCharCode(value)
  })
  return btoa(binary)
}

export function aiApplyOriginTag(origin: {
  proposalId?: string | null
  agentId?: string | null
  runId?: string | null
  messageId?: string | null
  threadId?: string | null
  idempotencyKey: string
}): string {
  return [
    "ai",
    origin.idempotencyKey,
    origin.proposalId,
    origin.agentId,
    origin.runId,
    origin.messageId,
    origin.threadId,
  ].map((part) => String(part ?? "").trim()).filter(Boolean).join(":").slice(0, 80)
}

async function failProposal(
  supabase: SupabaseClient,
  artifactId: string,
  idempotencyKey: string,
  status: "failed" | "conflict",
  reason: string,
  extra?: Json,
) {
  await supabase.rpc("artifact_collab_fail_proposal_v1", {
    p_artifact_id: artifactId,
    p_idempotency_key: idempotencyKey,
    p_status: status,
    p_payload: { error: reason, ...extra },
  })
}

export async function applyReadyAiProposalOnWorker(args: {
  supabase: SupabaseClient
  artifactId: string
  idempotencyKey: string
  expectedText?: string | null
  patchedHtml: string
  patchedJson?: unknown
  title?: string | null
  summary?: string | null
  requireExactCurrent?: boolean
  replacements?: Array<{ from: string; to: string }>
  origin: {
    proposalId?: string | null
    agentId?: string | null
    runId?: string | null
    messageId?: string | null
    threadId?: string | null
    idempotencyKey: string
  }
  broadcast?: (payload: { update: Uint8Array; seq: number; key: string }) => Promise<void>
}): Promise<{ ok: true; status: "applied"; seq: number; duplicate?: boolean; versionNumber?: number | null } | { ok: false; status: "conflict" | "failed" | "applying"; reason: string }> {
  const claimed = await args.supabase.rpc("artifact_collab_claim_proposal_v1", {
    p_artifact_id: args.artifactId,
    p_idempotency_key: args.idempotencyKey,
  })
  if (claimed.error) return { ok: false, status: "failed", reason: claimed.error.message }
  const claim = asRecord(claimed.data)
  if (claim?.status === "applied") return { ok: true, status: "applied", seq: 0, duplicate: true }
  if (claim?.ok !== true || claim.status !== "applying") {
    return { ok: false, status: claim?.status === "conflict" ? "conflict" : "failed", reason: String(claim?.error ?? claim?.code ?? "proposal_not_ready") }
  }
  if (claim.in_flight === true) return { ok: false, status: "applying", reason: "proposal_in_flight" }

  try {
    const loaded = await args.supabase.rpc("artifact_collab_load_document_v1", {
      p_artifact_id: args.artifactId,
      p_after_seq: 0,
    })
    if (loaded.error) {
      await failProposal(args.supabase, args.artifactId, args.idempotencyKey, "failed", loaded.error.message)
      return { ok: false, status: "failed", reason: loaded.error.message }
    }

    const row = asRecord(loaded.data) ?? {}
    const ydoc = new Y.Doc()
    if (typeof row.snapshot_base64 === "string" && row.snapshot_base64) {
      Y.applyUpdate(ydoc, base64ToBytes(row.snapshot_base64))
    }
    for (const item of Array.isArray(row.updates) ? row.updates : []) {
      const rec = asRecord(item)
      const encoded = typeof rec?.update_base64 === "string" ? rec.update_base64 : ""
      if (encoded) Y.applyUpdate(ydoc, base64ToBytes(encoded))
    }

    const currentText = yXmlPlainText(ydoc)
    const patchedJson = patchedContentToTipTapDoc({
      contentJson: args.patchedJson,
      html: args.patchedHtml,
    })
    const patchedText = normalizePlainText(tipTapJsonToPlainText(patchedJson))
    const resolved = resolveAiApplyDocument({
      liveDoc: yXmlToTipTapDoc(ydoc),
      patchedDoc: patchedJson,
      expectedText: args.expectedText,
      requireExactCurrent: args.requireExactCurrent,
      replacements: args.replacements,
    })
    if (!resolved.ok) {
      await failProposal(args.supabase, args.artifactId, args.idempotencyKey, "conflict", "expected_text_mismatch", {
        conflict: {
          kind: "span_conflict",
          current: resolved.conflict.current,
          incoming: resolved.conflict.incoming,
          expected: resolved.conflict.expected ?? null,
          expected_text: resolved.conflict.expected ?? null,
          current_text: resolved.conflict.current,
          resolvable: true,
        },
      })
      return { ok: false, status: "conflict", reason: "expected_text_mismatch" }
    }

    const json = resolved.doc
    const usedLiveReplace = resolved.mode !== "full"
    const update = replaceYDocWithTipTapJson(ydoc, json, aiApplyOriginTag(args.origin))
    const afterText = yXmlPlainText(ydoc)
    const expectedAfter = usedLiveReplace
      ? normalizePlainText(tipTapJsonToPlainText(json))
      : patchedText
    if (expectedAfter && !isEditoriallyEquivalent(afterText, expectedAfter)) {
      await failProposal(args.supabase, args.artifactId, args.idempotencyKey, "failed", "ydoc_conversion_mismatch", {
        conflict: {
          kind: "ydoc_conversion_mismatch",
          expected_text: expectedAfter,
          current_text: afterText,
          resolvable: true,
        },
      })
      return { ok: false, status: "failed", reason: "ydoc_conversion_mismatch" }
    }

    const persistKey = `ai:${args.idempotencyKey}`
    const persist = await args.supabase.rpc("artifact_collab_persist_update_v1", {
      p_artifact_id: args.artifactId,
      p_update_base64: bytesToBase64(update),
      p_idempotency_key: persistKey,
      p_client_id: args.origin.idempotencyKey,
      p_origin: aiApplyOriginTag(args.origin),
      p_actor_type: "agent",
    })
    if (persist.error) {
      await failProposal(args.supabase, args.artifactId, args.idempotencyKey, "failed", persist.error.message)
      return { ok: false, status: "failed", reason: persist.error.message }
    }
    const persisted = asRecord(persist.data)
    const seq = Number(persisted?.seq ?? 0)
    try {
      await args.broadcast?.({ update, seq, key: persistKey })
    } catch {
      // Reconnect replays from Postgres.
    }

    const html = usedLiveReplace ? tipTapJsonToHtml(json) : args.patchedHtml
    const text = (usedLiveReplace ? expectedAfter : patchedText)
      || normalizePlainText(html.replace(/<[^>]+>/g, " "))
    const stateVector = Y.encodeStateVector(ydoc)
    const title = String(args.title ?? "").trim().slice(0, 240) || null
    const contentJson = {
      version: 1,
      editor_kind: "rich_text",
      content_format: "tiptap_json",
      tiptap: json,
      blocks: [{ id: "body", type: "rich_text", html, text }],
    }
    const projected = await args.supabase.rpc("artifact_collab_project_v1", {
      p_artifact_id: args.artifactId,
      p_seq: seq,
      p_content_json: contentJson,
      p_content_text: text,
      p_state_vector_base64: bytesToBase64(stateVector),
    })
    if (projected.error) {
      await failProposal(args.supabase, args.artifactId, args.idempotencyKey, "failed", projected.error.message)
      return { ok: false, status: "failed", reason: projected.error.message }
    }

    if (title) {
      await args.supabase.from("artifacts").update({ title }).eq("id", args.artifactId)
    }

    const checkpointed = await args.supabase.rpc("artifact_collab_checkpoint_v1", {
      p_artifact_id: args.artifactId,
      p_seq: seq,
      p_snapshot: {
        title,
        content_text: text,
        content_json: contentJson,
      },
      p_change_source: "ai",
      p_summary: String(args.summary ?? "").slice(0, 1000) || null,
      p_diff_stats: (() => {
        const before = currentText.split(/\s+/).filter(Boolean)
        const next = text.split(/\s+/).filter(Boolean)
        const beforeCounts = new Map<string, number>()
        const nextCounts = new Map<string, number>()
        for (const word of before) beforeCounts.set(word, (beforeCounts.get(word) ?? 0) + 1)
        for (const word of next) nextCounts.set(word, (nextCounts.get(word) ?? 0) + 1)
        let insert_count = 0
        let delete_count = 0
        for (const key of new Set([...beforeCounts.keys(), ...nextCounts.keys()])) {
          const left = beforeCounts.get(key) ?? 0
          const right = nextCounts.get(key) ?? 0
          if (right > left) insert_count += right - left
          if (left > right) delete_count += left - right
        }
        return { insert_count, delete_count }
      })(),
      p_state_vector_base64: bytesToBase64(stateVector),
      p_ai_run_id: args.origin.runId ?? null,
      p_ai_message_id: args.origin.messageId ?? null,
      p_ai_thread_id: args.origin.threadId ?? null,
    })
    const versionNumber = Number(asRecord(checkpointed.data)?.version_number ?? 0) || null

    const completed = await args.supabase.rpc("artifact_collab_complete_proposal_v1", {
      p_artifact_id: args.artifactId,
      p_idempotency_key: args.idempotencyKey,
      p_payload: {},
    })
    if (completed.error) {
      await failProposal(args.supabase, args.artifactId, args.idempotencyKey, "failed", completed.error.message)
      return { ok: false, status: "failed", reason: completed.error.message }
    }
    return { ok: true, status: "applied", seq, duplicate: persisted?.duplicate === true, versionNumber }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "ai_apply_failed"
    await failProposal(args.supabase, args.artifactId, args.idempotencyKey, "failed", reason)
    return { ok: false, status: "failed", reason }
  }
}
