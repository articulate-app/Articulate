import { describe, expect, it, beforeEach } from "vitest"
import {
  componentEditStreamKey,
  isLiveComponentEditStreamPhase,
  isTerminalComponentEditStreamPhase,
  resolveComponentEditStreamPreviewView,
  useComponentEditStreamStore,
} from "../app/store/component-edit-stream"
import {
  buildEditStreamOptimisticOutputBlocks,
  buildEditStreamMergedPlainText,
} from "../features/ai-chat/component-edit-stream-utils"

describe("componentEditStreamKey", () => {
  it("keys previews by task, channel, and component only", () => {
    expect(componentEditStreamKey(1, 2, "comp-a", "output-b")).toBe("1:2:comp-a")
    expect(componentEditStreamKey(1, 2, "comp-a", null)).toBe("1:2:comp-a")
  })
})

describe("component edit stream phases", () => {
  it("treats started, delta, and completed as live", () => {
    expect(isLiveComponentEditStreamPhase("started")).toBe(true)
    expect(isLiveComponentEditStreamPhase("delta")).toBe(true)
    expect(isLiveComponentEditStreamPhase("completed")).toBe(true)
    expect(isLiveComponentEditStreamPhase("saved")).toBe(false)
    expect(isLiveComponentEditStreamPhase("failed")).toBe(false)
  })

  it("treats saved and failed as terminal chat artifacts", () => {
    expect(isTerminalComponentEditStreamPhase("saved")).toBe(true)
    expect(isTerminalComponentEditStreamPhase("failed")).toBe(true)
    expect(isTerminalComponentEditStreamPhase("completed")).toBe(false)
  })
})

describe("resolveComponentEditStreamPreviewView", () => {
  it("returns frozen chat artifact for a saved assistant message", () => {
    const stream = {
      key: "1:2:comp",
      threadId: "thread-1",
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      taskComponentOutputId: "output",
      componentTitle: "FAQ",
      operation: "append" as const,
      baseContentText: "",
      contentText: "new content",
      contentJson: null,
      displayHtml: "<p>new content</p>",
      hasPreviewContent: true,
      phase: "started" as const,
      isStreaming: true,
      errorMessage: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
      assistantTempId: "assistant-2",
      chatArtifactsByAssistantId: {
        "assistant-1": {
          phase: "saved",
          componentTitle: "FAQ",
          operation: "append",
          baseContentText: "",
          contentText: "saved content",
          contentJson: null,
          displayHtml: "<p>saved content</p>",
          hasPreviewContent: true,
          isStreaming: false,
          errorMessage: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    }

    const view = resolveComponentEditStreamPreviewView(stream, "assistant-1")
    expect(view?.phase).toBe("saved")
    expect(view?.contentText).toBe("saved content")
  })
})

describe("component edit stream append base content", () => {
  beforeEach(() => {
    useComponentEditStreamStore.setState({ streams: {} })
  })

  it("keeps existing base content separate from appended delta on started", () => {
    const key = componentEditStreamKey(1, 2, "comp", "output")
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      threadId: "thread-1",
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      taskComponentOutputId: "output",
      componentTitle: "Intro",
      assistantTempId: "assistant-1",
      operation: "append",
      phase: "started",
      baseContentText: "Existing intro",
      contentText: "New FAQ item",
    })
    const stream = useComponentEditStreamStore.getState().getStream(key)
    expect(stream?.baseContentText).toBe("Existing intro")
    expect(stream?.contentText).toBe("New FAQ item")
  })

  it("appends content_text_delta arriving on the started phase", () => {
    const key = componentEditStreamKey(1, 2, "comp")
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      threadId: "thread-1",
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      assistantTempId: "assistant-1",
      phase: "started",
      contentTextDelta: "Hello",
    })
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      threadId: "thread-1",
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      assistantTempId: "assistant-1",
      phase: "delta",
      contentTextDelta: " world",
    })
    const stream = useComponentEditStreamStore.getState().getStream(key)
    expect(stream?.contentText).toBe("Hello world")
  })

  it("updates the same preview card when output id arrives on saved", () => {
    const key = componentEditStreamKey(1, 2, "comp")
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      threadId: "thread-1",
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      assistantTempId: "assistant-1",
      phase: "completed",
      contentText: "Draft body",
    })
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      threadId: "thread-1",
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      taskComponentOutputId: "output-1",
      assistantTempId: "assistant-1",
      phase: "saved",
      contentText: "Saved body",
    })

    expect(Object.keys(useComponentEditStreamStore.getState().streams)).toEqual([key])
    const stream = useComponentEditStreamStore.getState().getStream(key)
    expect(stream?.phase).toBe("saved")
    expect(stream?.taskComponentOutputId).toBe("output-1")
    expect(stream?.contentText).toBe("Saved body")
  })

  it("finalizes unfinished previews when the assistant stream completes", () => {
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      threadId: "thread-1",
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      assistantTempId: "assistant-1",
      phase: "delta",
      contentText: "Streaming body",
    })

    useComponentEditStreamStore.getState().finalizeAssistantMessagePreviews("assistant-1")
    const stream = useComponentEditStreamStore.getState().getStream("1:2:comp")
    expect(stream?.phase).toBe("completed")
    expect(stream?.isStreaming).toBe(false)
    expect(stream?.chatArtifactsByAssistantId["assistant-1"]?.phase).toBe("completed")
  })

  it("clears preview streams from other threads", () => {
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      threadId: "thread-a",
      taskId: 1,
      channelId: 2,
      componentId: "comp-a",
      phase: "saved",
      contentText: "saved in a",
    })
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      threadId: "thread-b",
      taskId: 1,
      channelId: 2,
      componentId: "comp-b",
      phase: "saved",
      contentText: "saved in b",
    })
    useComponentEditStreamStore.getState().clearStreamsExceptThread("thread-b")
    const streams = useComponentEditStreamStore.getState().streams
    expect(Object.keys(streams)).toHaveLength(1)
    expect(Object.values(streams)[0]?.componentId).toBe("comp-b")
  })

  it("ignores duplicate completed events with the same content", () => {
    const upsert = () =>
      useComponentEditStreamStore.getState().upsertFromPreviewEvent({
        threadId: "thread-1",
        taskId: 1,
        channelId: 2,
        componentId: "comp",
        assistantTempId: "assistant-1",
        operation: "append",
        phase: "completed",
        contentText: "New linkbuilding paragraph",
      })

    upsert()
    const afterFirst = useComponentEditStreamStore.getState().getStream("1:2:comp")
    upsert()
    const afterSecond = useComponentEditStreamStore.getState().getStream("1:2:comp")
    expect(afterSecond?.contentText).toBe("New linkbuilding paragraph")
    expect(afterSecond?.updatedAt).toBe(afterFirst?.updatedAt)
  })

  it("prefers content_text over content_text_delta on the same delta event", () => {
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      operation: "append",
      phase: "delta",
      contentText: "Full pending text",
      contentTextDelta: "should not append",
    })
    const stream = useComponentEditStreamStore.getState().getStream("1:2:comp")
    expect(stream?.contentText).toBe("Full pending text")
  })

  it("keeps separate pending previews per component", () => {
    const components = ["comp-a", "comp-b", "comp-c", "comp-d", "comp-e"]
    for (const componentId of components) {
      useComponentEditStreamStore.getState().upsertFromPreviewEvent({
        taskId: 1,
        channelId: 2,
        componentId,
        operation: "append",
        phase: "completed",
        baseContentText: `Base for ${componentId}`,
        contentText: `Append for ${componentId}`,
      })
    }
    expect(Object.keys(useComponentEditStreamStore.getState().streams)).toHaveLength(5)
    for (const componentId of components) {
      const stream = useComponentEditStreamStore.getState().getStream(`1:2:${componentId}`)
      expect(stream?.contentText).toBe(`Append for ${componentId}`)
      expect(stream?.baseContentText).toBe(`Base for ${componentId}`)
    }
  })

  it("clears append base on saved so optimistic output is final content only", () => {
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      operation: "append",
      phase: "started",
      baseContentText: "Original",
      contentText: "Pending",
    })
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      operation: "append",
      phase: "saved",
      contentText: "Original\n\nPending saved",
    })
    const stream = useComponentEditStreamStore.getState().getStream("1:2:comp")
    expect(stream?.baseContentText).toBe("")
    expect(stream?.contentText).toBe("Original\n\nPending saved")
  })

  it("uses stable streaming preview html during delta", () => {
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      phase: "delta",
      contentText: "<h3>1. Enhanced Durability</h3>",
    })
    const stream = useComponentEditStreamStore.getState().getStream("1:2:comp")
    expect(stream?.displayHtml).toContain("component-output-streaming-preview")
    expect(stream?.displayHtml).not.toContain("<ol>")
  })

  it("ignores partial content_json until completed", () => {
    useComponentEditStreamStore.getState().upsertFromPreviewEvent({
      taskId: 1,
      channelId: 2,
      componentId: "comp",
      phase: "delta",
      contentText: "1. Enhanced Durability",
      contentJson: [{ type: "paragraph", text: "1. Enhanced Durability" }],
    })
    const stream = useComponentEditStreamStore.getState().getStream("1:2:comp")
    expect(stream?.contentJson).toBeNull()
    expect(stream?.displayHtml).toContain("component-output-streaming-preview")
  })
})

describe("buildEditStreamOptimisticOutputBlocks", () => {
  it("renders append as base blocks plus one pending block", () => {
    const blocks = buildEditStreamOptimisticOutputBlocks({
      operation: "append",
      baseContentText: "Existing intro",
      contentText: "New FAQ item",
      contentJson: null,
      displayHtml: "",
    })
    expect(blocks).toHaveLength(2)
    expect(buildEditStreamMergedPlainText({
      operation: "append",
      baseContentText: "Existing intro",
      contentText: "New FAQ item",
    })).toContain("Existing intro")
    expect(buildEditStreamMergedPlainText({
      operation: "append",
      baseContentText: "Existing intro",
      contentText: "New FAQ item",
    })).toContain("New FAQ item")
  })

  it("renders replace as pending content only", () => {
    const blocks = buildEditStreamOptimisticOutputBlocks({
      operation: "replace",
      baseContentText: "Old content",
      contentText: "Replacement body",
      contentJson: null,
      displayHtml: "",
    })
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.text).toContain("Replacement body")
    expect(blocks[0]?.text).not.toContain("Old content")
  })
})
