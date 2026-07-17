import { getSupabaseBrowser } from "../../../lib/supabase-browser"
import type { TaskChannelContentResponse } from "@/lib/types/task-channel-content"

function toIdNum(id: string | number): number {
  const n = typeof id === "number" ? id : Number.parseInt(String(id), 10)
  if (!Number.isFinite(n)) throw new Error("Invalid id")
  return n
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
}

/**
 * Briefing-independent Content-tab read model.
 * Never filter the result by briefing type on the client.
 */
export async function fetchTaskChannelContent(
  taskId: string | number,
  channelId: string | number,
  init?: { signal?: AbortSignal },
): Promise<TaskChannelContentResponse> {
  const supabase = getSupabaseBrowser()
  const p_task_id = toIdNum(taskId)
  const p_channel_id = toIdNum(channelId)
  const { data, error } = await supabase.rpc("get_task_channel_content_v1", {
    p_task_id,
    p_channel_id,
  })
  if (init?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }
  if (error) {
    throw new Error(error.message || "get_task_channel_content_v1 failed")
  }
  if (!data || typeof data !== "object") {
    throw new Error("Invalid get_task_channel_content_v1 payload")
  }
  const row = data as Record<string, unknown>
  if (row.ok !== true) {
    throw new Error("get_task_channel_content_v1 returned ok=false")
  }
  const task_id = typeof row.task_id === "number" ? row.task_id : p_task_id
  const channel_id = typeof row.channel_id === "number" ? row.channel_id : p_channel_id
  const project_id = typeof row.project_id === "number" ? row.project_id : 0

  return {
    ok: true,
    context_version: 1,
    briefing_type_used: false,
    task_id,
    project_id,
    channel_id,
    channel:
      row.channel && typeof row.channel === "object"
        ? (row.channel as Record<string, unknown>)
        : {},
    components: asRecordArray(row.components) as TaskChannelContentResponse["components"],
    composed_output: asRecordArray(row.composed_output) as TaskChannelContentResponse["composed_output"],
    latest_outputs: asRecordArray(row.latest_outputs) as TaskChannelContentResponse["latest_outputs"],
    recoverable_outputs: asRecordArray(
      row.recoverable_outputs,
    ) as TaskChannelContentResponse["recoverable_outputs"],
    fallback_main_required: row.fallback_main_required === true,
  }
}
