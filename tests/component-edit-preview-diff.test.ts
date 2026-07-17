import { describe, expect, it, beforeEach } from "vitest"
import { QueryClient } from "@tanstack/react-query"
import { parseComponentEditPreviewEvent } from "../app/lib/ai/chat"
import { applyComponentEditPreviewEvent } from "../features/ai-chat/apply-component-edit-preview-event"
import { resolveComponentOutputUpdatedAtFromQueryCache } from "../features/ai-chat/resolve-component-output-from-cache"
import { buildComponentPreviewDiff } from "../features/tasks/utils/component-content-diff"
import { useComponentEditStreamStore } from "../app/store/component-edit-stream"

const taskChannelBootstrapQueryKey = (taskId: number, channelId: number) =>
  ["task-channel-bootstrap", taskId, channelId] as const

const COMPONENT_UUID = "635c0ae7-9d47-432c-8768-8f30d415376a"
const OUTPUT_UUID = "e92627a5-d0d5-49e1-b5b1-2bd940126f41"

describe("component edit preview before/after diff", () => {
  beforeEach(() => {
    useComponentEditStreamStore.setState({ streams: {} })
  })

  it("parses before/after content and renders deletions plus additions", () => {
    const event = parseComponentEditPreviewEvent({
      type: "component_edit_preview",
      phase: "completed",
      task_id: 1,
      channel_id: 11,
      component_id: COMPONENT_UUID,
      task_component_output_id: OUTPUT_UUID,
      operation: "replace",
      before_content_text: "Hello world",
      after_content_text: "Hello brave new world",
    })
    expect(event?.before_content_text).toBe("Hello world")
    expect(event?.after_content_text).toBe("Hello brave new world")

    const diff = buildComponentPreviewDiff({
      operation: "replace",
      beforeText: event!.before_content_text!,
      afterText: event!.after_content_text!,
    })
    expect(diff.some((line) => line.type === "removed")).toBe(true)
    expect(diff.some((line) => line.type === "added")).toBe(true)

    const ctx = applyComponentEditPreviewEvent(event!, "assistant-1", {
      allowedChannelIds: [11],
    })
    expect(ctx).not.toBeNull()
    const stream = useComponentEditStreamStore.getState().getStream(ctx!.key)
    expect(stream?.baseContentText).toBe("Hello world")
    expect(stream?.afterContentText).toBe("Hello brave new world")
  })

  it("keeps patch previews as one card without locally reapplying patches", () => {
    const event = parseComponentEditPreviewEvent({
      type: "component_edit_preview",
      phase: "completed",
      task_id: 1,
      channel_id: 11,
      component_id: COMPONENT_UUID,
      task_component_output_id: OUTPUT_UUID,
      operation: "replace",
      edit_strategy: "patch",
      before_content_text: "Alpha beta gamma",
      after_content_text: "Alpha revised beta gamma",
      patches: [{ start: 6, end: 10, before: "beta", after: "revised beta" }],
      content_text: "Alpha revised beta gamma",
    })
    expect(event?.edit_strategy).toBe("patch")
    expect(event?.patches).toHaveLength(1)

    const firstCtx = applyComponentEditPreviewEvent(event!, "assistant-1", {
      allowedChannelIds: [11],
    })
    const secondCtx = applyComponentEditPreviewEvent(event!, "assistant-1", {
      allowedChannelIds: [11],
    })
    expect(firstCtx?.key).toBe(secondCtx?.key)

    const stream = useComponentEditStreamStore.getState().getStream(firstCtx!.key)
    expect(stream?.editStrategy).toBe("patch")
    expect(stream?.patches).toHaveLength(1)
    expect(stream?.afterContentText).toBe("Alpha revised beta gamma")
    expect(stream?.contentText).toBe("Alpha revised beta gamma")
  })
})

describe("resolveComponentOutputUpdatedAtFromQueryCache", () => {
  it("returns updated_at for a loaded output row", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData([...taskChannelBootstrapQueryKey(1, 11)], {
      composed_output: [
        {
          task_component_id: COMPONENT_UUID,
          task_component_output_id: OUTPUT_UUID,
          updated_at: "2026-07-13T12:00:00.000Z",
          content_text: "Existing output",
        },
      ],
    })

    expect(
      resolveComponentOutputUpdatedAtFromQueryCache(queryClient, {
        taskId: 1,
        channelId: 11,
        componentId: COMPONENT_UUID,
        taskComponentOutputId: OUTPUT_UUID,
      }),
    ).toBe("2026-07-13T12:00:00.000Z")
  })
})
