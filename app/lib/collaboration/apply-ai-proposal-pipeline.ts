import type { SupabaseClient } from "@supabase/supabase-js"
import {
  applyCompletedAiPatchToYdoc,
  loadYdocFromPersisted,
  proposalConflictPayload,
} from "./apply-ai-proposal"
import { bytesToBase64 } from "./binary"
import { createArtifactCheckpoint } from "./checkpoints"
import { projectYDocToArtifact } from "./projection"
import { extractArtifactSeedHtml, yDocToHtml } from "./ydoc-content"

export type AiApplyOrigin = {
  proposalId?: string | null
  agentId?: string | null
  runId?: string | null
  messageId?: string | null
  threadId?: string | null
  idempotencyKey: string
}

export function aiApplyOriginTag(origin: AiApplyOrigin): string {
  return [
    "ai",
    origin.idempotencyKey,
    origin.proposalId,
    origin.agentId,
    origin.runId,
    origin.messageId,
    origin.threadId,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(":")
    .slice(0, 80)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export type ApplyReadyProposalResult =
  | { ok: true; status: "applied"; duplicate?: boolean; seq: number }
  | { ok: false; status: "conflict" | "failed" | "applying"; reason: string }

export async function applyReadyAiProposal(args: {
  supabase: SupabaseClient
  artifactId: string
  idempotencyKey: string
  expectedText?: string | null
  patchedHtml: string
  origin: AiApplyOrigin
  broadcast?: (payload: { update: Uint8Array; seq: number; key: string }) => Promise<void>
}): Promise<ApplyReadyProposalResult> {
  const claimed = await args.supabase.rpc("artifact_collab_claim_proposal_v1", {
    p_artifact_id: args.artifactId,
    p_idempotency_key: args.idempotencyKey,
  })
  if (claimed.error) {
    return { ok: false, status: "failed", reason: claimed.error.message }
  }
  const claim = asRecord(claimed.data)
  if (claim?.status === "applied") {
    return { ok: true, status: "applied", duplicate: true, seq: 0 }
  }
  if (claim?.ok !== true || claim.status !== "applying") {
    return {
      ok: false,
      status: claim?.status === "conflict" ? "conflict" : "failed",
      reason: String(claim?.error ?? claim?.code ?? "proposal_not_ready"),
    }
  }
  if (claim.in_flight === true) {
    return { ok: false, status: "applying", reason: "proposal_in_flight" }
  }

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
  const updates = Array.isArray(row.updates) ? row.updates : []
  const ydoc = loadYdocFromPersisted({
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

  const applied = applyCompletedAiPatchToYdoc({
    currentHtml: yDocToHtml(ydoc) || extractArtifactSeedHtml(row) || "",
    expectedText: args.expectedText,
    patchedHtml: args.patchedHtml,
    ydoc,
  })
  if (!applied.ok) {
    await args.supabase.rpc("artifact_collab_fail_proposal_v1", {
      p_artifact_id: args.artifactId,
      p_idempotency_key: args.idempotencyKey,
      p_status: applied.status,
      p_payload: {
        error: applied.reason,
        conflict: proposalConflictPayload({
          expectedText: args.expectedText,
          currentText: applied.currentText,
        }),
      },
    })
    return { ok: false, status: applied.status, reason: applied.reason }
  }

  const persistKey = `ai:${args.idempotencyKey}`
  const persist = await args.supabase.rpc("artifact_collab_persist_update_v1", {
    p_artifact_id: args.artifactId,
    p_update_base64: bytesToBase64(applied.update),
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
    await args.broadcast?.({ update: applied.update, seq, key: persistKey })
  } catch {
    // Broadcast is best-effort; reconnect replays from Postgres.
  }

  const projected = await projectYDocToArtifact({
    supabase: args.supabase,
    artifactId: args.artifactId,
    document: ydoc,
    seq,
  })
  if (!projected.ok) {
    return { ok: false, status: "failed", reason: projected.error ?? "projection_failed" }
  }

  await createArtifactCheckpoint({
    supabase: args.supabase,
    artifactId: args.artifactId,
    document: ydoc,
    seq,
    changeSource: "ai",
    summary: "AI proposal applied",
    aiRunId: args.origin.runId,
    aiMessageId: args.origin.messageId,
    aiThreadId: args.origin.threadId,
  })

  await args.supabase.rpc("artifact_collab_record_change_group_v1", {
    p_artifact_id: args.artifactId,
    p_payload: {
      actor_type: "agent",
      origin: aiApplyOriginTag(args.origin),
      summary: "AI proposal applied",
      target: {
        proposal_id: args.origin.proposalId ?? null,
        agent_id: args.origin.agentId ?? null,
        run_id: args.origin.runId ?? null,
        message_id: args.origin.messageId ?? null,
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
  if (completed.error) {
    return { ok: false, status: "failed", reason: completed.error.message }
  }
  return { ok: true, status: "applied", duplicate: persisted?.duplicate === true, seq }
}
