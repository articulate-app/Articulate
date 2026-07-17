import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/services/content-version-history", () => ({
  saveTaskChannelContentVersion: vi.fn().mockResolvedValue(undefined),
}))

import { saveTaskChannelContentVersion } from "@/lib/services/content-version-history"
import {
  ensureManualComponentEditChannelSnapshot,
  ensureTaskChannelSnapshotOnce,
  resetTaskChannelEditSession,
} from "../features/tasks/utils/task-channel-edit-session-snapshot"

describe("task-channel-edit-session-snapshot", () => {
  beforeEach(() => {
    vi.mocked(saveTaskChannelContentVersion).mockClear()
    resetTaskChannelEditSession(10, 2)
  })

  it("writes one snapshot per task x channel session", async () => {
    const first = await ensureManualComponentEditChannelSnapshot({
      taskId: 10,
      channelId: 2,
      componentTitle: "FAQ",
    })
    const second = await ensureManualComponentEditChannelSnapshot({
      taskId: 10,
      channelId: 2,
      componentTitle: "FAQ",
    })

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(saveTaskChannelContentVersion).toHaveBeenCalledTimes(1)
    expect(saveTaskChannelContentVersion).toHaveBeenCalledWith({
      taskId: 10,
      channelId: 2,
      changeSource: "manual_before_edit",
      changeSummary: "Manual edit before updating component: FAQ",
      aiMessageId: null,
      aiThreadId: null,
    })
  })

  it("resets the session when the channel is re-selected", async () => {
    await ensureTaskChannelSnapshotOnce({
      taskId: 10,
      channelId: 2,
      changeSource: "manual_before_edit",
      changeSummary: "Before reordering components",
    })
    resetTaskChannelEditSession(10, 2)
    await ensureTaskChannelSnapshotOnce({
      taskId: 10,
      channelId: 2,
      changeSource: "manual_before_edit",
      changeSummary: "Before reordering components",
    })

    expect(saveTaskChannelContentVersion).toHaveBeenCalledTimes(2)
  })
})
