import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiRunTerminalKind } from "../../app/lib/ai/ai-chat-v2-types"
import type { InFlightAssistantMessage } from "./types"

export const AI_THREAD_CHROME_SELECT =
  "id, scope, visibility, is_collaborative, title, created_by, project_id, task_id, created_at, last_message_at, is_deleted, language_code"

const ORPHAN_RUN_STATUSES = ["failed", "interrupted", "running"] as const

export type OrphanedAiChatRunRow = {
  id: string
  status: string
  error_code: string | null
  error_message: string | null
  user_message_id: string | null
  client_request_id: string | null
  assistant_message_id: string | null
}

export function isOrphanedAiChatRunStatus(status: string): boolean {
  return (ORPHAN_RUN_STATUSES as readonly string[]).includes(status)
}

export function shouldHydrateOrphanedAiRun(args: {
  lastMessage: { id: string; role: string } | null
  hasInFlightAssistant: boolean
  run: OrphanedAiChatRunRow | null
}): boolean {
  if (args.hasInFlightAssistant) return false
  if (!args.lastMessage || args.lastMessage.role !== "user") return false
  const run = args.run
  if (!run) return false
  if (run.assistant_message_id) return false
  if (!isOrphanedAiChatRunStatus(run.status)) return false
  if (run.user_message_id && run.user_message_id !== args.lastMessage.id) return false
  return true
}

export function terminalKindForOrphanedRunStatus(status: string): AiRunTerminalKind {
  if (status === "interrupted" || status === "running") return "interrupted"
  return "failed"
}

export function buildHydratedFailedAssistantMessage(args: {
  threadId: string
  run: OrphanedAiChatRunRow
}): InFlightAssistantMessage {
  const kind = terminalKindForOrphanedRunStatus(args.run.status)
  const fallbackMessage =
    kind === "interrupted"
      ? "The request was interrupted before a reply could be saved."
      : "The AI request could not be completed."
  return {
    id: `hydrated-run-${args.run.id}`,
    thread_id: args.threadId,
    role: "assistant",
    content: "",
    content_json: [],
    created_at: new Date().toISOString(),
    status: kind === "failed" ? "failed" : "complete",
    is_optimistic: true,
    reconciled_message_id: null,
    run_id: args.run.id,
    client_request_id: args.run.client_request_id,
    terminal_state: {
      kind,
      run_id: args.run.id,
      message_id: null,
      code: args.run.error_code,
      message: args.run.error_message?.trim() || fallbackMessage,
      retryable: true,
    },
  }
}

export async function fetchOrphanedAiChatRunForUserMessage(args: {
  threadId: string
  userMessageId: string
}): Promise<OrphanedAiChatRunRow | null> {
  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase
    .from("ai_chat_runs")
    .select(
      "id, status, error_code, error_message, user_message_id, client_request_id, assistant_message_id",
    )
    .eq("thread_id", args.threadId)
    .eq("user_message_id", args.userMessageId)
    .is("assistant_message_id", null)
    .in("status", [...ORPHAN_RUN_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[ai-chat] failed to load orphaned run", error)
    return null
  }
  return (data as OrphanedAiChatRunRow | null) ?? null
}
