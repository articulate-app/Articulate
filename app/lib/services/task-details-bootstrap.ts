import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import type {
  TaskDetailMergeResult,
  TaskDetailsBootstrapResponse,
} from "@/lib/types/task-details-bootstrap"

const TASK_DETAILS_BOOTSTRAP_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/task-details-bootstrap`

function toTaskIdNumber(taskId: string | number): number {
  const n = typeof taskId === "number" ? taskId : Number.parseInt(String(taskId), 10)
  if (!Number.isFinite(n)) throw new Error("Invalid task id")
  return n
}

/**
 * Loads task-details-bootstrap. Backend accepts `task_id` as query param and/or JSON body (`task_id` / `taskId` / `id`).
 * We POST JSON `{ task_id }` for a single consistent contract.
 */
export async function fetchTaskDetailsBootstrap(
  taskId: string | number,
  _accessToken?: string,
  init?: { signal?: AbortSignal },
): Promise<TaskDetailsBootstrapResponse> {
  const idNum = toTaskIdNumber(taskId)
  const url = new URL(TASK_DETAILS_BOOTSTRAP_URL)
  url.searchParams.set("task_id", String(idNum))
  const supabase = createClientComponentClient()
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url: url.toString(),
    debugLabel: "task-details-bootstrap",
    init: {
      method: "POST",
      body: JSON.stringify({ task_id: idNum }),
      signal: init?.signal,
    },
    headers: {
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text || `task-details-bootstrap failed: ${res.status}`)
  }
  return (await res.json()) as TaskDetailsBootstrapResponse
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function mergeArrayValue(currentValue: unknown, incomingValue: unknown): unknown {
  if (!Array.isArray(incomingValue)) return incomingValue
  if (incomingValue.length === 0 && Array.isArray(currentValue) && currentValue.length > 0) {
    // Keep optimistic rows visible when bootstrap returns an empty array.
    // Background refreshes can still reconcile later.
    return currentValue
  }
  return incomingValue
}

function mergeValue(currentValue: unknown, incomingValue: unknown): unknown {
  if (incomingValue === undefined) return currentValue
  if (incomingValue === null) return null
  if (Array.isArray(incomingValue)) return mergeArrayValue(currentValue, incomingValue)
  if (!isRecord(incomingValue)) return incomingValue
  if (!isRecord(currentValue)) return incomingValue

  let didChange = false
  const merged: Record<string, unknown> = { ...currentValue }
  const keys = new Set([...Object.keys(currentValue), ...Object.keys(incomingValue)])
  for (const key of Array.from(keys)) {
    const prev = currentValue[key]
    const next = mergeValue(prev, incomingValue[key])
    if (!Object.is(prev, next)) {
      didChange = true
      merged[key] = next
    }
  }
  return didChange ? merged : currentValue
}

export function mergeTaskDetail(
  current: Record<string, unknown> | null | undefined,
  bootstrapResponse: TaskDetailsBootstrapResponse | null | undefined,
): TaskDetailMergeResult {
  const currentSafe = current ?? {}
  if (!bootstrapResponse) {
    return { merged: currentSafe, didChange: false }
  }
  const incoming = {
    ...(bootstrapResponse.task ?? {}),
    ...bootstrapResponse,
  }
  delete (incoming as { task?: unknown }).task
  const merged = mergeValue(currentSafe, incoming) as Record<string, unknown>
  return { merged, didChange: !Object.is(merged, currentSafe) }
}

export async function fetchTaskDetailsBootstrapMerged(
  taskId: string | number,
  accessToken: string,
  initialData: Record<string, unknown> | null | undefined,
  init?: { signal?: AbortSignal },
): Promise<Record<string, unknown>> {
  const bootstrap = await fetchTaskDetailsBootstrap(taskId, accessToken, init)
  return mergeTaskDetail(initialData, bootstrap).merged
}
