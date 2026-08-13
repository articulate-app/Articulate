import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../app/components/ui/use-toast", () => ({
  toast: vi.fn(),
}))

describe("task-write-queue deletes", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("serializes soft-deletes so the second starts only after the first finishes", async () => {
    const { enqueueTaskDelete } = await import("../app/lib/task-write-queue")

    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const makeSupabase = (id: string, gate?: Promise<void>) => ({
      rpc: async (name: string, args: { p_task_id: number }) => {
        expect(name).toBe("fn_soft_delete_task")
        order.push(`start:${id}`)
        if (gate) await gate
        order.push(`end:${id}`)
        return { data: { ok: true, task_id: args.p_task_id }, error: null }
      },
    })

    const firstDone = new Promise<void>((resolve) => {
      enqueueTaskDelete({
        taskId: 1,
        supabase: makeSupabase("1", firstGate),
        onSuccess: () => resolve(),
      })
    })

    const secondDone = new Promise<void>((resolve) => {
      enqueueTaskDelete({
        taskId: 2,
        supabase: makeSupabase("2"),
        onSuccess: () => resolve(),
      })
    })

    await vi.waitFor(() => {
      expect(order).toEqual(["start:1"])
    })

    releaseFirst()
    await Promise.all([firstDone, secondDone])

    expect(order).toEqual(["start:1", "end:1", "start:2", "end:2"])
  })

  it("dedupes the same task id while a soft-delete is pending", async () => {
    const { enqueueTaskDelete } = await import("../app/lib/task-write-queue")

    let softDeleteCalls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const supabase = {
      rpc: async () => {
        softDeleteCalls += 1
        await gate
        return { data: { ok: true }, error: null }
      },
    }

    let successes = 0
    enqueueTaskDelete({
      taskId: 9,
      supabase,
      onSuccess: () => {
        successes += 1
      },
    })
    enqueueTaskDelete({
      taskId: 9,
      supabase,
      onSuccess: () => {
        successes += 1
      },
    })

    await vi.waitFor(() => {
      expect(softDeleteCalls).toBe(1)
    })

    release()
    await vi.waitFor(() => {
      expect(successes).toBe(1)
    })
    expect(softDeleteCalls).toBe(1)
  })

  it("soft-deletes via fn_soft_delete_task RPC (never hard deletes or REST update)", async () => {
    const { enqueueTaskDelete } = await import("../app/lib/task-write-queue")

    const calls: Array<{ op: string; args?: unknown }> = []
    const supabase = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ op: `rpc:${name}`, args })
        return { data: { ok: true, task_id: 42 }, error: null }
      },
      from: () => ({
        update: () => ({
          eq: async () => {
            calls.push({ op: "update" })
            return { error: null }
          },
        }),
        delete: () => ({
          eq: async () => {
            calls.push({ op: "delete" })
            return { error: null }
          },
        }),
      }),
    }

    await new Promise<void>((resolve, reject) => {
      enqueueTaskDelete({
        taskId: 42,
        promoteSubtasks: true,
        supabase,
        onSuccess: () => resolve(),
        onError: reject,
      })
    })

    expect(calls).toEqual([
      {
        op: "rpc:fn_soft_delete_task",
        args: { p_task_id: 42, p_promote_subtasks: true },
      },
    ])
  })
})
