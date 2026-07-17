import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import type { TaskChannelBootstrapResponse } from "@/lib/types/task-channel-bootstrap"

const TASK_CHANNEL_BOOTSTRAP_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/task-channel-bootstrap`

function toIdNum(id: string | number): number {
  const n = typeof id === "number" ? id : Number.parseInt(String(id), 10)
  if (!Number.isFinite(n)) throw new Error("Invalid id")
  return n
}

/**
 * Loads `task-channel-bootstrap`. Backend accepts query params and/or JSON body
 * (`task_id` / `taskId`, `channel_id` / `channelId`).
 */
export async function fetchTaskChannelBootstrap(
  taskId: string | number,
  channelId: string | number,
  accessToken: string,
  init?: { signal?: AbortSignal },
): Promise<TaskChannelBootstrapResponse> {
  void accessToken
  const taskNum = toIdNum(taskId)
  const channelNum = toIdNum(channelId)
  const url = new URL(TASK_CHANNEL_BOOTSTRAP_URL)
  url.searchParams.set("task_id", String(taskNum))
  url.searchParams.set("channel_id", String(channelNum))
  const supabase = createClientComponentClient()
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url: url.toString(),
    debugLabel: "task-channel-bootstrap",
    init: {
      method: "POST",
      body: JSON.stringify({ task_id: taskNum, channel_id: channelNum }),
      signal: init?.signal,
    },
    headers: {
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text || `task-channel-bootstrap failed: ${res.status}`)
  }
  const raw = (await res.json()) as { data?: TaskChannelBootstrapResponse } & TaskChannelBootstrapResponse
  const data = raw?.data ?? raw
  const typed = data as TaskChannelBootstrapResponse
  if (
    !data ||
    typeof data !== "object" ||
    typeof typed.task_id !== "number" ||
    typeof typed.channel_id !== "number"
  ) {
    throw new Error("Invalid task-channel-bootstrap payload")
  }
  return data as TaskChannelBootstrapResponse
}
