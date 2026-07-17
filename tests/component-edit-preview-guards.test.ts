import { describe, expect, it } from "vitest"
import { shouldAcceptComponentEditPreviewEvent } from "../features/ai-chat/component-edit-preview-guards"

describe("shouldAcceptComponentEditPreviewEvent", () => {
  const baseEvent = {
    type: "component_edit_preview" as const,
    phase: "started" as const,
    task_id: 10,
    channel_id: 2,
    component_id: "comp-a",
  }

  it("rejects null component ids", () => {
    expect(
      shouldAcceptComponentEditPreviewEvent(
        { ...baseEvent, component_id: "" },
        { activeChannelId: 2 },
      ),
    ).toBe(false)
  })

  it("rejects previews from a different active channel", () => {
    expect(shouldAcceptComponentEditPreviewEvent(baseEvent, { activeChannelId: 99 })).toBe(false)
  })

  it("accepts previews for the active channel", () => {
    expect(shouldAcceptComponentEditPreviewEvent(baseEvent, { activeChannelId: 2 })).toBe(true)
  })

  it("accepts explicitly allowed cross-channel previews", () => {
    expect(
      shouldAcceptComponentEditPreviewEvent(baseEvent, {
        activeChannelId: 99,
        allowedChannelIds: [2],
      }),
    ).toBe(true)
  })
})
