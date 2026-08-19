import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0"
import * as Y from "https://esm.sh/yjs@13.6.27"

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

function normalize(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

function yXmlPlainText(document: Y.Doc): string {
  const fragment = document.getXmlFragment("default")
  const walk = (node: unknown): string => {
    if (!node) return ""
    if (typeof (node as { toString?: () => string }).toString === "function" && (node as { nodeName?: string }).nodeName == null) {
      const text = String(node)
      return text
    }
    const anyNode = node as { toString?: () => string; length?: number; get?: (i: number) => unknown }
    if (typeof anyNode.length === "number" && typeof anyNode.get === "function") {
      let out = ""
      for (let i = 0; i < anyNode.length; i += 1) out += walk(anyNode.get(i))
      return out
    }
    return typeof anyNode.toString === "function" ? anyNode.toString() : ""
  }
  return normalize(walk(fragment).replace(/<[^>]+>/g, " "))
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
    origin.proposalId,
    origin.agentId,
    origin.runId,
    origin.messageId,
    origin.threadId,
    origin.idempotencyKey,
  ].map((part) => String(part ?? "").trim()).filter(Boolean).join(":").slice(0, 80)
}

export async function applyReadyAiProposalOnWorker(args: {
  supabase: SupabaseClient
  artifactId: string
  idempotencyKey: string
  expectedText?: string | null
  patchedHtml: string
  origin: {
    proposalId?: string | null
    agentId?: string | null
    runId?: string | null
    messageId?: string | null
    threadId?: string | null
    idempotencyKey: string
  }
  broadcast?: (payload: { update: Uint8Array; seq: number; key: string }) => Promise<void>
}): Promise<{ ok: true; status: "applied"; seq: number; duplicate?: boolean } | { ok: false; status: "conflict" | "failed" | "applying"; reason: string }> {
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

  const loaded = await args.supabase.rpc("artifact_collab_load_document_v1", {
    p_artifact_id: args.artifactId,
    p_after_seq: 0,
  })
  if (loaded.error) {
    await args.supabase.rpc("artifact_collab_fail_proposal_v1", {
      p_artifact_id: args.artifactId,
      p_idempotency_key: args.idempotencyKey,
      p_status: "failed",
      p_payload: { error: loaded.error.message },
    })
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

  const expected = normalize(String(args.expectedText ?? ""))
  const currentText = yXmlPlainText(ydoc)
  if (expected && !currentText.includes(expected) && !normalize(args.patchedHtml.replace(/<[^>]+>/g, " ")).includes(expected)) {
    await args.supabase.rpc("artifact_collab_fail_proposal_v1", {
      p_artifact_id: args.artifactId,
      p_idempotency_key: args.idempotencyKey,
      p_status: "conflict",
      p_payload: {
        error: "expected_text_mismatch",
        conflict: {
          kind: "expected_text_mismatch",
          expected_text: args.expectedText ?? null,
          current_text: currentText,
          resolvable: true,
        },
      },
    })
    return { ok: false, status: "conflict", reason: "expected_text_mismatch" }
  }

  const { generateJSON } = await import("https://esm.sh/@tiptap/html@2.27.2?bundle")
  const StarterKit = (await import("https://esm.sh/@tiptap/starter-kit@2.27.2?bundle")).default
  const { Node } = await import("https://esm.sh/@tiptap/pm/model?bundle")
  const { getSchema } = await import("https://esm.sh/@tiptap/core@2.27.2?bundle")
  const { prosemirrorToYXmlFragment } = await import("https://esm.sh/y-prosemirror@1.3.7?bundle")
  const extensions = [StarterKit.configure({ heading: { levels: [1, 2, 3] }, history: false })]
  const json = generateJSON(args.patchedHtml || "<p></p>", extensions)
  const schema = getSchema(extensions)
  const pmNode = Node.fromJSON(schema, json)
  const before = Y.encodeStateVector(ydoc)
  const fragment = ydoc.getXmlFragment("default")
  ydoc.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length)
    prosemirrorToYXmlFragment(pmNode, fragment)
  }, aiApplyOriginTag(args.origin))
  const update = Y.encodeStateAsUpdate(ydoc, before)
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
    await args.supabase.rpc("artifact_collab_fail_proposal_v1", {
      p_artifact_id: args.artifactId,
      p_idempotency_key: args.idempotencyKey,
      p_status: "failed",
      p_payload: { error: persist.error.message },
    })
    return { ok: false, status: "failed", reason: persist.error.message }
  }
  const persisted = asRecord(persist.data)
  const seq = Number(persisted?.seq ?? 0)
  try {
    await args.broadcast?.({ update, seq, key: persistKey })
  } catch {
    // Reconnect replays from Postgres.
  }

  const html = args.patchedHtml
  const text = normalize(html.replace(/<[^>]+>/g, " "))
  const encoded = Y.encodeStateAsUpdate(ydoc)
  const stateVector = Y.encodeStateVector(ydoc)
  const projected = await args.supabase.rpc("artifact_collab_project_v1", {
    p_artifact_id: args.artifactId,
    p_seq: seq,
    p_content_json: {
      version: 1,
      editor_kind: "rich_text",
      content_format: "tiptap_json",
      tiptap: json,
      blocks: [{ id: "body", type: "rich_text", html, text }],
    },
    p_content_text: text,
    p_state_vector_base64: bytesToBase64(stateVector),
  })
  if (projected.error) {
    return { ok: false, status: "failed", reason: projected.error.message }
  }

  await args.supabase.rpc("artifact_collab_checkpoint_v1", {
    p_artifact_id: args.artifactId,
    p_seq: seq,
    p_snapshot: {
      title: null,
      content_text: text,
      content_json: {
        version: 1,
        editor_kind: "rich_text",
        content_format: "tiptap_json",
        tiptap: json,
        blocks: [{ id: "body", type: "rich_text", html, text }],
      },
    },
    p_change_source: "ai",
    p_summary: "AI proposal applied",
    p_state_vector_base64: bytesToBase64(stateVector),
    p_ai_run_id: args.origin.runId ?? null,
    p_ai_message_id: args.origin.messageId ?? null,
    p_ai_thread_id: args.origin.threadId ?? null,
  })

  await args.supabase.rpc("artifact_collab_record_change_group_v1", {
    p_artifact_id: args.artifactId,
    p_payload: {
      actor_type: "agent",
      origin: aiApplyOriginTag(args.origin),
      summary: "AI proposal applied",
      target: {
        proposal_id: args.origin.proposalId ?? null,
        run_id: args.origin.runId ?? null,
        thread_id: args.origin.threadId ?? null,
        idempotency_key: args.idempotencyKey,
      },
      to_seq: seq,
      proposal_id: args.origin.proposalId ?? null,
    },
  })

  const completed = await args.supabase.rpc("artifact_collab_complete_proposal_v1", {
    p_artifact_id: args.artifactId,
    p_idempotency_key: args.idempotencyKey,
    p_payload: {},
  })
  if (completed.error) return { ok: false, status: "failed", reason: completed.error.message }
  void encoded
  return { ok: true, status: "applied", seq, duplicate: persisted?.duplicate === true }
}
