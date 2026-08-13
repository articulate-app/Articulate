import { describe, expect, it } from "vitest"
import {
  resolveAutoThreadSelection,
  shouldWriteActiveThreadToUrl,
} from "../features/ai-chat/thread-selection-guards"

const isPersistedThreadId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

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

  it("follows search-preview aiThreadId changes while another thread is active", () => {
    const outcome = resolveAutoThreadSelection({
      isOpen: true,
      isCreating: false,
      activeThreadId: "9b881005-48cb-4d61-bb2e-f45fc4e24844",
      externalRequestedThreadId: null,
      urlRequestedThreadId: "1b2db291-df72-4b06-b602-1fbd56a78cc8",
      disableUrlSync: false,
      openTabIds: ["9b881005-48cb-4d61-bb2e-f45fc4e24844"],
    })

    expect(outcome).toEqual({
      type: "load-requested-thread",
      threadId: "1b2db291-df72-4b06-b602-1fbd56a78cc8",
      source: "url",
    })
  })

  it("ignores external thread changes once a thread is already active when url sync is disabled", () => {
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

describe("shouldWriteActiveThreadToUrl", () => {
  it("does not stomp a different persisted thread requested by the address bar", () => {
    expect(
      shouldWriteActiveThreadToUrl({
        activeThreadId: "9b881005-48cb-4d61-bb2e-f45fc4e24844",
        liveThreadId: "1b2db291-df72-4b06-b602-1fbd56a78cc8",
        isPersistedThreadId,
      }),
    ).toBe(false)
  })

  it("writes when the address bar has no thread yet", () => {
    expect(
      shouldWriteActiveThreadToUrl({
        activeThreadId: "9b881005-48cb-4d61-bb2e-f45fc4e24844",
        liveThreadId: null,
        isPersistedThreadId,
      }),
    ).toBe(true)
  })

  it("skips when url already matches active", () => {
    expect(
      shouldWriteActiveThreadToUrl({
        activeThreadId: "9b881005-48cb-4d61-bb2e-f45fc4e24844",
        liveThreadId: "9b881005-48cb-4d61-bb2e-f45fc4e24844",
        isPersistedThreadId,
      }),
    ).toBe(false)
  })
})
