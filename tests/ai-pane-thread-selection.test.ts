import { describe, expect, it } from "vitest"
import { resolveAutoThreadSelection } from "../features/ai-chat/thread-selection-guards"

describe("resolveAutoThreadSelection", () => {
  it("keeps selected thread locked after create -> send -> streamed reply", () => {
    const outcome = resolveAutoThreadSelection({
      isOpen: true,
      isCreating: false,
      activeThreadId: "thread-newly-created",
      // Simulates stale external/url thread id that can still be present
      // while the assistant streamed reply/refetch updates arrive.
      externalRequestedThreadId: "thread-previously-open",
      urlRequestedThreadId: "thread-newly-created",
      disableUrlSync: false,
      openTabIds: ["thread-previously-open", "thread-newly-created"],
    })

    expect(outcome).toEqual({ type: "none" })
  })

  it("auto-selects requested thread only when no thread is selected", () => {
    const outcome = resolveAutoThreadSelection({
      isOpen: true,
      isCreating: false,
      activeThreadId: null,
      externalRequestedThreadId: null,
      urlRequestedThreadId: "thread-from-url",
      disableUrlSync: false,
      openTabIds: ["thread-from-url"],
    })

    expect(outcome).toEqual({
      type: "activate-requested-open-tab",
      threadId: "thread-from-url",
      source: "url",
    })
  })

  it("bootstraps scope only when there is no selected/requested thread", () => {
    const outcome = resolveAutoThreadSelection({
      isOpen: true,
      isCreating: false,
      activeThreadId: null,
      externalRequestedThreadId: null,
      urlRequestedThreadId: null,
      disableUrlSync: false,
      openTabIds: [],
    })

    expect(outcome).toEqual({ type: "bootstrap-scope-thread" })
  })

  it("follows browser URL changes when url sync is enabled", () => {
    const outcome = resolveAutoThreadSelection({
      isOpen: true,
      isCreating: false,
      activeThreadId: "thread-b",
      externalRequestedThreadId: null,
      urlRequestedThreadId: "thread-a",
      disableUrlSync: false,
      openTabIds: ["thread-a", "thread-b"],
    })

    expect(outcome).toEqual({
      type: "activate-requested-open-tab",
      threadId: "thread-a",
      source: "url",
    })
  })

  it("ignores external thread changes once a thread is already active", () => {
    const outcome = resolveAutoThreadSelection({
      isOpen: true,
      isCreating: false,
      activeThreadId: "thread-b",
      externalRequestedThreadId: "thread-a",
      urlRequestedThreadId: "thread-b",
      disableUrlSync: true,
      openTabIds: ["thread-a", "thread-b"],
    })

    expect(outcome).toEqual({ type: "none" })
  })
})
