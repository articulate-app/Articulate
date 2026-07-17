import { ensureTaskChannelSnapshotOnce } from "../tasks/utils/task-channel-edit-session-snapshot"

export type SaveChannelSnapshotBeforeAiEditArgs = {
  taskId: number | null | undefined
  channelId: number | null | undefined
  changeSummary?: string | null
  aiMessageId?: string | null
  aiThreadId?: string | null
}

/**
 * Persists a full task×channel snapshot before risky AI content edits.
 * Failures are logged and swallowed so AI flows are not blocked.
 */
export async function saveChannelSnapshotBeforeAiEdit(
  args: SaveChannelSnapshotBeforeAiEditArgs,
): Promise<void> {
  const taskId = args.taskId
  const channelId = args.channelId
  if (taskId == null || channelId == null || !Number.isFinite(taskId) || !Number.isFinite(channelId)) {
    return
  }

  await ensureTaskChannelSnapshotOnce({
    taskId,
    channelId,
    changeSource: "ai_before_edit",
    changeSummary: args.changeSummary ?? "",
    aiMessageId: args.aiMessageId ?? null,
    aiThreadId: args.aiThreadId ?? null,
  })
}

export function shouldSaveChannelSnapshotBeforeAiSend(args: {
  taskId?: number | null
  channelId?: number | null
  mode?: "build_component" | "build_briefing" | "assistant_only" | null
  hasComponentOutputContext?: boolean
  taggedTaskComponentRefCount?: number
  autoRun?: boolean
}): boolean {
  const taskId = args.taskId
  const channelId = args.channelId
  if (taskId == null || channelId == null || !Number.isFinite(taskId) || !Number.isFinite(channelId)) {
    return false
  }
  if (args.autoRun) return true
  if (args.mode === "build_component" || args.mode === "build_briefing") return true
  if (args.hasComponentOutputContext) return true
  if ((args.taggedTaskComponentRefCount ?? 0) > 0) return true
  return false
}
