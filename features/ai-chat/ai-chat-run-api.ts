"use client"

import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { invokeEdgeFunctionFetch } from "../../app/lib/edge-functions"
import type { AiChatRunReconcileResponse, AiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-v2-types"
import { parseAiChatUsageSnapshot } from "../../app/lib/ai/ai-chat-usage-parse"

export const AI_RUN_ID_HEADER = "x-ai-run-id"

export function extractRunIdFromResponse(response: Response): string | null {
  const header = response.headers.get(AI_RUN_ID_HEADER) ?? response.headers.get("X-AI-Run-Id")
  const trimmed = header?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export function extractRunIdFromJsonBody(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const record = data as Record<string, unknown>
  const runId = typeof record.run_id === "string" ? record.run_id.trim() : ""
  return runId.length > 0 ? runId : null
}

export async function fetchAiChatRun(runId: string, signal?: AbortSignal): Promise<AiChatRunReconcileResponse> {
  const supabase = getSupabaseBrowser()
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat-run?run_id=${encodeURIComponent(runId)}`
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url,
    debugLabel: "ai-chat-run-get",
    init: { method: "GET", signal },
    headers: {
      "Content-Type": "application/json",
      [AI_RUN_ID_HEADER]: runId,
    },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || `Failed to reconcile run ${runId}`)
  }
  return (await res.json()) as AiChatRunReconcileResponse
}

export async function fetchAiChatThreadUsage(
  threadId: string,
  signal?: AbortSignal,
): Promise<AiChatUsageSnapshot | null> {
  const supabase = getSupabaseBrowser()
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat-run?thread_id=${encodeURIComponent(threadId)}`
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url,
    debugLabel: "ai-chat-run-thread-usage",
    init: { method: "GET", signal },
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || `Failed to load AI usage for thread ${threadId}`)
  }
  const payload = (await res.json()) as { usage?: unknown }
  return parseAiChatUsageSnapshot(payload.usage)
}

export async function cancelAiChatRun(
  runId: string,
  options?: { method?: "DELETE" | "POST"; signal?: AbortSignal },
): Promise<void> {
  const supabase = getSupabaseBrowser()
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat-run`
  const method = options?.method ?? "DELETE"
  const url =
    method === "DELETE"
      ? `${base}?run_id=${encodeURIComponent(runId)}`
      : base
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url,
    debugLabel: "ai-chat-run-cancel",
    init: {
      method,
      signal: options?.signal,
      ...(method === "POST"
        ? { body: JSON.stringify({ action: "cancel", run_id: runId }) }
        : {}),
    },
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(errText || `Failed to cancel run ${runId}`)
  }
}

export function isRequestIdReusedError(status: number, bodyText: string): boolean {
  if (status !== 409) return false
  return /request_id_reused/i.test(bodyText)
}

export function reconcileRunStatusToTerminal(
  status: AiChatRunReconcileResponse["run"]["status"],
): "completed" | "failed" | "cancelled" | "interrupted" | null {
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "cancelled"
  if (status === "interrupted") return "interrupted"
  return null
}
