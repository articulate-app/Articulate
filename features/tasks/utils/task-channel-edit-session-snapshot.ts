import { saveTaskChannelContentVersion } from "@/lib/services/content-version-history"

function sessionKey(taskId: number, channelId: number): string {
  return `${taskId}:${channelId}`
}

const snapshottedSessionKeys = new Set<string>()

/** Start a fresh editing session when the user selects a task × channel. */
export function resetTaskChannelEditSession(taskId: number, channelId: number): void {
  snapshottedSessionKeys.delete(sessionKey(taskId, channelId))
}

/**
 * Persist one full-channel snapshot per task × channel editing session.
 * Returns true when a new snapshot was written.
 */
export async function ensureTaskChannelSnapshotOnce(args: {
  taskId: number
  channelId: number
  changeSource: string
  changeSummary: string
  aiMessageId?: string | null
  aiThreadId?: string | null
}): Promise<boolean> {
  const key = sessionKey(args.taskId, args.channelId)
  if (snapshottedSessionKeys.has(key)) return false

  try {
    await saveTaskChannelContentVersion({
      taskId: args.taskId,
      channelId: args.channelId,
      changeSource: args.changeSource,
      changeSummary: args.changeSummary,
      aiMessageId: args.aiMessageId ?? null,
      aiThreadId: args.aiThreadId ?? null,
    })
    snapshottedSessionKeys.add(key)
    return true
  } catch (error) {
    console.error("[task-channel-edit-session] ensureTaskChannelSnapshotOnce failed", {
      taskId: args.taskId,
      channelId: args.channelId,
      changeSource: args.changeSource,
      error,
    })
    return false
  }
}

export async function ensureManualComponentEditChannelSnapshot(args: {
  taskId: number
  channelId: number
  componentTitle: string
}): Promise<boolean> {
  return ensureTaskChannelSnapshotOnce({
    taskId: args.taskId,
    channelId: args.channelId,
    changeSource: "manual_before_edit",
    changeSummary: `Manual edit before updating component: ${args.componentTitle}`,
  })
}
