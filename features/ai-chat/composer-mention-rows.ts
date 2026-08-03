/** Duplicated from Composer.tsx to avoid circular imports — keep in sync. */
export type MentionGroupId = "task" | "project" | "user" | "artifact" | "source"
type ProjectMention = { id: number; name: string; color?: string | null; logo?: string | null }
type TaskMention = {
  id: number
  title: string
  projectName?: string | null
  projectLogo?: string | null
  projectColor?: string | null
}
type UserMention = { id: number; full_name: string | null; email: string | null; photo: string | null }
type ArtifactMention = {
  id: string
  title: string | null
  task_id: number | null
  project_id: number | null
  current_version: number | null
}
type SourceMention = {
  id: string
  title: string | null
  task_id: number | null
  project_id: number | null
  status: string | null
}
export type MentionSuggestion =
  | { kind: "project"; id: number; label: string; project: ProjectMention }
  | { kind: "task"; id: number; label: string; task: TaskMention }
  | { kind: "user"; id: number; label: string; user: UserMention }
  | { kind: "artifact"; id: string; label: string; artifact: ArtifactMention }
  | { kind: "source"; id: string; label: string; source: SourceMention }

export type TaskMentionLite = TaskMention

import type { MentionChannel } from "./mention-task-channel-components"

/** Flat rows for the @ picker; keyboard skips non-selectable kinds. */
export type MentionPickerRow =
  | { kind: "group"; id: MentionGroupId; label: string }
  | { kind: "suggestion"; suggestion: MentionSuggestion }
  | { kind: "current_task"; task: TaskMentionLite; channelId?: number | null }
  | { kind: "back"; label: string }
  | { kind: "loading" }
  | { kind: "task_header"; task: TaskMentionLite }
  | { kind: "channel"; task: TaskMentionLite; channelId: number; channelName: string }
  /** Standalone `#` channel token — inserts only a channel chip (no implied task chip). */
  | { kind: "channel_mention"; taskId: number; taskTitle: string; channelId: number; channelName: string }

export function mentionRowIsSelectable(row: MentionPickerRow): boolean {
  if (row.kind === "task_header" || row.kind === "loading") return false
  return true
}

type BuildChannelMentionArgs = {
  tasks: Array<{ id: number; title: string; channels: MentionChannel[] }>
  query: string
  loading: boolean
}

/**
 * Flat channel list for the `#` trigger. Sources channels from tasks already loaded in the task
 * context, deduped per `(taskId, channelId)`, filtered by channel name / task title.
 */
export function buildChannelMentionRows(args: BuildChannelMentionArgs): MentionPickerRow[] {
  const tokens = tokenizeMentionQuery(args.query)
  const rows: MentionPickerRow[] = []
  const seen = new Set<string>()
  for (const task of args.tasks) {
    for (const ch of task.channels) {
      const key = `${task.id}:${ch.channel_id}`
      if (seen.has(key)) continue
      if (!pathMatchesTokens(tokens, [ch.name, task.title])) continue
      seen.add(key)
      rows.push({
        kind: "channel_mention",
        taskId: task.id,
        taskTitle: task.title,
        channelId: ch.channel_id,
        channelName: ch.name,
      })
    }
  }
  if (rows.length === 0 && args.loading) rows.push({ kind: "loading" })
  return rows
}

export function tokenizeMentionQuery(q: string): string[] {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/** Every token must appear somewhere in the joined path (task / channel / component). */
export function pathMatchesTokens(tokens: string[], parts: (string | null | undefined)[]): boolean {
  if (tokens.length === 0) return true
  const blob = parts
    .map((p) => (p ?? "").toLowerCase())
    .join(" ")
  return tokens.every((t) => blob.includes(t))
}

export function nextSelectableMentionIndex(
  rows: MentionPickerRow[],
  fromIndex: number,
  direction: 1 | -1
): number {
  if (rows.length === 0) return 0
  let i = fromIndex
  for (let step = 0; step < rows.length; step += 1) {
    i = (i + direction + rows.length) % rows.length
    if (mentionRowIsSelectable(rows[i])) return i
  }
  return fromIndex
}

type BuildLevel1Args = {
  mentionFilter: "all" | "task" | "project" | "user" | "artifact" | "source"
  mentionQuery: string | null
  mentionSuggestionsFiltered: MentionSuggestion[]
  directCombined: MentionSuggestion[]
  currentTask?: { task: TaskMentionLite; channelId?: number | null } | null
}

export function buildLevel1MentionRows(args: BuildLevel1Args): MentionPickerRow[] {
  const { mentionFilter, mentionQuery, mentionSuggestionsFiltered, directCombined, currentTask } = args
  const rows: MentionPickerRow[] = []
  if (mentionFilter === "all" && (mentionQuery ?? "").trim().length === 0) {
    if (currentTask) {
      rows.push({
        kind: "current_task",
        task: currentTask.task,
        channelId: currentTask.channelId ?? null,
      })
    }
    for (const s of directCombined) {
      rows.push({ kind: "suggestion", suggestion: s })
    }
    rows.push({ kind: "group", id: "task", label: "Tasks" })
    rows.push({ kind: "group", id: "project", label: "Projects" })
    rows.push({ kind: "group", id: "user", label: "Users" })
    rows.push({ kind: "group", id: "artifact", label: "Artifacts" })
    rows.push({ kind: "group", id: "source", label: "Sources" })
  }
  for (const s of mentionSuggestionsFiltered) {
    rows.push({ kind: "suggestion", suggestion: s })
  }
  return rows
}

type BuildLevel2Args = {
  task: TaskMentionLite
  channels: MentionChannel[] | null
  channelsLoading: boolean
  query: string
}

/**
 * Second-level @ panel: back + task header + channels (no task-channel-component mentions).
 */
export function buildLevel2MentionRows(args: BuildLevel2Args): MentionPickerRow[] {
  const { task, channels, channelsLoading, query } = args
  const tokens = tokenizeMentionQuery(query)
  const rows: MentionPickerRow[] = [{ kind: "back", label: "Tasks" }, { kind: "task_header", task }]

  if (channelsLoading || channels === null) {
    rows.push({ kind: "loading" })
    return rows
  }

  for (const ch of channels) {
    if (!pathMatchesTokens(tokens, [task.title, ch.name])) continue
    rows.push({ kind: "channel", task, channelId: ch.channel_id, channelName: ch.name })
  }

  return rows
}
