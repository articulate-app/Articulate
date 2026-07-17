import { beforeEach, describe, expect, it } from "vitest"
import { parseAiChangePreviewEvent } from "../app/lib/ai/chat"
import {
  resolveAiChangePreviewKey,
  useAiChangePreviewStreamStore,
} from "../app/store/ai-change-preview-stream"

describe("ai change preview stream", () => {
  beforeEach(() => {
    useAiChangePreviewStreamStore.setState({ previews: {} })
  })

  it("updates the same card for started and saved events sharing change_id", () => {
    const store = useAiChangePreviewStreamStore.getState()
    store.upsertAiChangePreview({
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
      preview: {
        type: "ai_change_preview",
        phase: "started",
        change_id: "change-1",
        entity_type: "task_component_structure",
        title: "Component structure updated",
        preview_items: [
          { label: "Updated sections", count: 1, values: ["Pros of rubber"] },
        ],
      },
    })
    store.upsertAiChangePreview({
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
      preview: {
        type: "ai_change_preview",
        phase: "saved",
        ok: true,
        change_id: "change-1",
        entity_type: "task_component_structure",
      },
    })

    expect(Object.keys(useAiChangePreviewStreamStore.getState().previews)).toEqual(["change-1"])
    const card = useAiChangePreviewStreamStore.getState().previews["change-1"]
    expect(card?.phase).toBe("saved")
    expect(card?.ok).toBe(true)
    expect(card?.preview_items?.[0]?.values).toEqual(["Pros of rubber"])
  })

  it("resolves preview_key when change_id is absent", () => {
    const key = resolveAiChangePreviewKey({
      change_id: "",
      preview_key: "structure:13423:11",
      entity_type: "task_component_structure",
      entity_id: "13423",
      tool_name: "update_structure",
    })
    expect(key).toBe("structure:13423:11")
  })

  it("hydrates persisted previews when no live card exists for the message", () => {
    const store = useAiChangePreviewStreamStore.getState()
    store.hydrateAiChangePreviewForMessage({
      threadId: "thread-1",
      messageId: "assistant-1",
      preview: {
        type: "ai_change_preview",
        phase: "saved",
        ok: true,
        change_id: "change-2",
        entity_type: "task_fields",
        title: "Task fields updated",
      },
    })

    expect(Object.keys(useAiChangePreviewStreamStore.getState().previews)).toEqual(["change-2"])
    expect(useAiChangePreviewStreamStore.getState().previews["change-2"]?.phase).toBe("saved")
  })

  it("preserves distinct task_count and channel_count for orchestrated builds", () => {
    const event = parseAiChangePreviewEvent({
      type: "ai_change_preview",
      phase: "started",
      change_id: "build-preview-1",
      tool_name: "ai_start_orchestrated_build",
      entity_type: "orchestrated_build",
      entity_id: "11111111-1111-4111-8111-111111111111",
      title: "Starting build",
      task_count: 1,
      channel_count: 2,
      task_ids: [13423],
    })
    expect(event?.task_count).toBe(1)
    expect(event?.channel_count).toBe(2)
    expect(event?.task_ids).toEqual([13423])

    const store = useAiChangePreviewStreamStore.getState()
    store.upsertAiChangePreview({
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
      preview: {
        type: "ai_change_preview",
        phase: "started",
        change_id: "build-preview-1",
        entity_type: "orchestrated_build",
        tool_name: "ai_start_orchestrated_build",
        task_count: 1,
        channel_count: 2,
        task_ids: [13423],
      },
    })
    store.upsertAiChangePreview({
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
      preview: {
        type: "ai_change_preview",
        phase: "saved",
        ok: true,
        change_id: "build-preview-1",
        entity_type: "orchestrated_build",
      },
    })
    const card = useAiChangePreviewStreamStore.getState().previews["build-preview-1"]
    expect(card?.task_count).toBe(1)
    expect(card?.channel_count).toBe(2)
    expect(card?.task_ids).toEqual([13423])
  })
})
