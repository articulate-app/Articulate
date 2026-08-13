import type { QueryClient } from "@tanstack/react-query"
import { toast } from "../components/ui/use-toast"

/**
 * Module-level task write queue.
 *
 * Field patches are debounced + coalesced per task id (survives TaskDetails remounts).
 * Deletes go through `fn_soft_delete_task` (SECURITY DEFINER RPC) and are serialized.
 * The RPC does a cheap write (triggers disabled) and enqueues heavy side effects.
 */

export const TASK_AUTOSAVE_DEBOUNCE_MS = 1500

type TaskAutosaveEntry = {
  pending: Record<string, unknown>
  needsListInvalidation: boolean
  timer: ReturnType<typeof setTimeout> | null
  inFlight: boolean
  /** Resolvers waiting for the current in-flight PATCH (if any) to finish. */
  idleWaiters: Array<() => void>
  supabase: any
  queryClient: QueryClient
}

const taskAutosaveQueue = new Map<string, TaskAutosaveEntry>()

function notifyIdleWaiters(entry: TaskAutosaveEntry) {
  const waiters = entry.idleWaiters
  entry.idleWaiters = []
  waiters.forEach((resolve) => resolve())
}

async function waitForTaskAutosaveIdle(taskId: string): Promise<void> {
  const entry = taskAutosaveQueue.get(taskId)
  if (!entry || !entry.inFlight) return
  await new Promise<void>((resolve) => {
    entry.idleWaiters.push(resolve)
  })
}

async function runTaskAutosaveLoop(taskId: string): Promise<void> {
  const entry = taskAutosaveQueue.get(taskId)
  if (!entry || entry.inFlight) return
  if (Object.keys(entry.pending).length === 0) return

  const queryClient = entry.queryClient
  entry.inFlight = true
  let sawError = false
  let listInvalidationNeeded = false
  try {
    while (Object.keys(entry.pending).length > 0) {
      const payload = entry.pending
      listInvalidationNeeded = listInvalidationNeeded || entry.needsListInvalidation
      entry.pending = {}
      entry.needsListInvalidation = false
      try {
        const { error } = await entry.supabase.from("tasks").update(payload).eq("id", taskId)
        if (error) throw error
      } catch (err) {
        sawError = true
        toast({
          title: "Failed to save changes",
          description: (err as Error)?.message || "An error occurred while saving.",
          variant: "destructive",
        })
      }
    }
  } finally {
    entry.inFlight = false
    notifyIdleWaiters(entry)
  }

  if (!sawError && queryClient) {
    queryClient.invalidateQueries({ queryKey: ["task", String(taskId)] })
    if (listInvalidationNeeded) {
      queryClient.invalidateQueries({ queryKey: ["tasks"] })
      queryClient.invalidateQueries({ queryKey: ["kanban-bootstrap"] })
    }
  }

  if (Object.keys(entry.pending).length === 0 && !entry.inFlight && !entry.timer) {
    taskAutosaveQueue.delete(taskId)
  }
}

export function enqueueTaskPatch(
  taskId: string,
  canonicalFields: Record<string, unknown>,
  requiresListInvalidation: boolean,
  deps: { supabase: any; queryClient: QueryClient },
): void {
  if (Object.keys(canonicalFields).length === 0) return
  // A queued delete owns this task — drop late patches.
  if (pendingDeleteIds.has(taskId)) return

  let entry = taskAutosaveQueue.get(taskId)
  if (!entry) {
    entry = {
      pending: {},
      needsListInvalidation: false,
      timer: null,
      inFlight: false,
      idleWaiters: [],
      supabase: deps.supabase,
      queryClient: deps.queryClient,
    }
    taskAutosaveQueue.set(taskId, entry)
  }
  entry.supabase = deps.supabase
  entry.queryClient = deps.queryClient
  Object.assign(entry.pending, canonicalFields)
  if (requiresListInvalidation) entry.needsListInvalidation = true
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    const current = taskAutosaveQueue.get(taskId)
    if (current) current.timer = null
    void runTaskAutosaveLoop(taskId)
  }, TASK_AUTOSAVE_DEBOUNCE_MS)
}

export function flushTaskAutosave(taskId: string): void {
  const entry = taskAutosaveQueue.get(taskId)
  if (!entry) return
  if (entry.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  if (Object.keys(entry.pending).length > 0) {
    void runTaskAutosaveLoop(taskId)
  }
}

export function flushAllTaskAutosaves(): void {
  taskAutosaveQueue.forEach((_entry, taskId) => flushTaskAutosave(taskId))
}

/** Drop pending patches for a task (keeps an in-flight PATCH running to completion). */
export function cancelTaskAutosave(taskId: string): void {
  const entry = taskAutosaveQueue.get(taskId)
  if (!entry) return
  if (entry.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  entry.pending = {}
  entry.needsListInvalidation = false
  if (!entry.inFlight) {
    notifyIdleWaiters(entry)
    taskAutosaveQueue.delete(taskId)
  }
}

if (typeof window !== "undefined" && !(window as any).__taskAutosaveUnloadBound) {
  ;(window as any).__taskAutosaveUnloadBound = true
  window.addEventListener("pagehide", flushAllTaskAutosaves)
  window.addEventListener("beforeunload", flushAllTaskAutosaves)
}

// --- Serial delete queue -----------------------------------------------------

export type TaskDeleteJob = {
  taskId: string | number
  /** When true, clear parent_task_id_int on children before soft-deleting (main tasks). */
  promoteSubtasks?: boolean
  supabase: any
  onError?: (error: unknown) => void
  onSuccess?: () => void
}

const deleteQueue: TaskDeleteJob[] = []
const pendingDeleteIds = new Set<string>()
let deleteDrainRunning = false

async function runSingleDelete(job: TaskDeleteJob): Promise<void> {
  const taskIdStr = String(job.taskId)
  cancelTaskAutosave(taskIdStr)
  await waitForTaskAutosaveIdle(taskIdStr)

  const taskIdNum = Number(job.taskId)
  if (!Number.isFinite(taskIdNum)) {
    throw new Error(`Invalid task id: ${job.taskId}`)
  }

  // Single RPC: promote subtasks (optional) + soft-delete + enqueue side effects.
  const { data, error } = await job.supabase.rpc("fn_soft_delete_task", {
    p_task_id: taskIdNum,
    p_promote_subtasks: Boolean(job.promoteSubtasks),
  })
  if (error) throw error
  if (data && typeof data === "object" && (data as { ok?: unknown }).ok === false) {
    throw new Error(
      typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : "Soft-delete failed",
    )
  }
}

async function drainDeleteQueue(): Promise<void> {
  if (deleteDrainRunning) return
  deleteDrainRunning = true
  try {
    while (deleteQueue.length > 0) {
      const job = deleteQueue.shift()!
      const taskIdStr = String(job.taskId)
      try {
        await runSingleDelete(job)
        job.onSuccess?.()
      } catch (error) {
        console.error("Failed to delete task:", error)
        job.onError?.(error)
      } finally {
        pendingDeleteIds.delete(taskIdStr)
      }
    }
  } finally {
    deleteDrainRunning = false
    if (deleteQueue.length > 0) {
      void drainDeleteQueue()
    }
  }
}

/**
 * Enqueue a task soft-delete. Optimistic UI should already have run at the call site.
 * Soft-deletes are processed one at a time to keep invoice/PO sync load bounded.
 */
export function enqueueTaskDelete(job: TaskDeleteJob): void {
  const taskIdStr = String(job.taskId)
  if (pendingDeleteIds.has(taskIdStr)) return
  pendingDeleteIds.add(taskIdStr)
  cancelTaskAutosave(taskIdStr)
  deleteQueue.push(job)
  void drainDeleteQueue()
}

/** Enqueue many deletes (deduped, still drained serially). */
export function enqueueTaskDeletes(
  jobs: TaskDeleteJob[],
  options?: {
    onBatchComplete?: (result: { ok: number; failed: number }) => void
  },
): void {
  if (jobs.length === 0) return
  let remaining = 0
  let ok = 0
  let failed = 0
  const track = Boolean(options?.onBatchComplete)

  for (const job of jobs) {
    const taskIdStr = String(job.taskId)
    if (pendingDeleteIds.has(taskIdStr)) continue
    remaining += 1
    enqueueTaskDelete({
      ...job,
      onSuccess: () => {
        ok += 1
        job.onSuccess?.()
        if (track) {
          remaining -= 1
          if (remaining === 0) options?.onBatchComplete?.({ ok, failed })
        }
      },
      onError: (error) => {
        failed += 1
        job.onError?.(error)
        if (track) {
          remaining -= 1
          if (remaining === 0) options?.onBatchComplete?.({ ok, failed })
        }
      },
    })
  }

  if (track && remaining === 0) {
    options?.onBatchComplete?.({ ok, failed })
  }
}
