import type { AiContextTag, AiMessageSegment } from "./composer-inline-editor"
import { chipDisplayText } from "./composer-inline-editor"
import { buildAiChatTaggedRefs } from "./build-ai-chat-tagged-refs"

export type { AiMessageSegment } from "./composer-inline-editor"

export type AiUserMessageDisplayTextPart = {
  type: "text"
  text: string
}

export type AiUserMessageContextPillPart = {
  type: "context_pill"
  entity_type: "component"
  label: string
  subtitle?: string | null
  task_id: number
  channel_id: number
  component_id: string
  task_component_output_id?: string | null
  selected_context_type?: "component_output" | null
  task_title?: string | null
}

export type AiUserMessageDisplayPart = AiUserMessageDisplayTextPart | AiUserMessageContextPillPart

export type AiUserMessageContentJson = {
  mention_tags?: AiContextTag[]
  segments?: AiMessageSegment[]
  display_message?: string
  display_parts?: AiUserMessageDisplayPart[]
  internal_message?: string
}

function parseDisplayParts(value: unknown): AiUserMessageDisplayPart[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parts: AiUserMessageDisplayPart[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (row.type === "text" && typeof row.text === "string") {
      parts.push({ type: "text", text: row.text })
      continue
    }
    if (
      row.type === "context_pill"
      && row.entity_type === "component"
      && typeof row.label === "string"
      && typeof row.component_id === "string"
      && Number.isFinite(Number(row.task_id))
      && Number.isFinite(Number(row.channel_id))
    ) {
      parts.push({
        type: "context_pill",
        entity_type: "component",
        label: row.label,
        subtitle: typeof row.subtitle === "string" ? row.subtitle : null,
        task_id: Number(row.task_id),
        channel_id: Number(row.channel_id),
        component_id: row.component_id,
        task_component_output_id:
          typeof row.task_component_output_id === "string" ? row.task_component_output_id : null,
        selected_context_type: row.selected_context_type === "component_output" ? "component_output" : null,
        task_title: typeof row.task_title === "string" ? row.task_title : null,
      })
    }
  }
  return parts.length > 0 ? parts : undefined
}

export function contextPillPartToMentionTag(part: AiUserMessageContextPillPart): AiContextTag {
  return {
    type: "task_component",
    id: part.component_id,
    label: part.label,
    source: "selection",
    taskId: part.task_id,
    channelId: part.channel_id,
    componentId: part.component_id,
    componentTitle: part.label,
    taskTitle: part.task_title ?? null,
    channelName: part.subtitle ?? null,
    taskComponentOutputId: part.task_component_output_id ?? null,
    contextSource: "component_action",
  }
}

export function displayPartsToMessageSegments(parts: AiUserMessageDisplayPart[]): AiMessageSegment[] {
  const segments: AiMessageSegment[] = []
  for (const part of parts) {
    if (part.type === "text") {
      if (part.text.length > 0) segments.push({ type: "text", text: part.text })
      continue
    }
    segments.push({ type: "mention", tag: contextPillPartToMentionTag(part) })
  }
  return trimSegmentEdges(segments)
}

export function synthesizePlainTextFromDisplayParts(parts: AiUserMessageDisplayPart[]): string {
  return parts
    .map((part) => {
      if (part.type === "text") return part.text
      return chipDisplayText(contextPillPartToMentionTag(part))
    })
    .join("")
}

export function hasUserMessageDisplayParts(contentJson: unknown): boolean {
  const parsed = parseUserMessageContentJson(contentJson)
  return (parsed.display_parts?.length ?? 0) > 0
}

export function buildUserMessageContentJson(args: {
  tags: AiContextTag[]
  segments?: AiMessageSegment[]
}): AiUserMessageContentJson | null {
  if (args.tags.length === 0 && (args.segments?.length ?? 0) === 0) return null
  return {
    mention_tags: args.tags,
    ...(args.segments && args.segments.length > 0 ? { segments: args.segments } : {}),
  }
}

export function buildUserMessageContentJsonFromTags(tags: AiContextTag[]): AiUserMessageContentJson | null {
  return buildUserMessageContentJson({ tags })
}

export function parseUserMessageContentJson(value: unknown): AiUserMessageContentJson {
  if (!value || typeof value !== "object") return {}
  const row = value as Record<string, unknown>
  const mention_tags = Array.isArray(row.mention_tags)
    ? (row.mention_tags as AiContextTag[]).filter(
        (tag) => tag && typeof tag === "object" && typeof tag.label === "string",
      )
    : undefined
  const segments = Array.isArray(row.segments)
    ? (row.segments as AiMessageSegment[]).filter(
        (segment) =>
          segment
          && typeof segment === "object"
          && (segment.type === "text" || segment.type === "mention"),
      )
    : undefined
  const display_message = typeof row.display_message === "string" ? row.display_message.trim() : undefined
  const display_parts = parseDisplayParts(row.display_parts)
  const internal_message = typeof row.internal_message === "string" ? row.internal_message.trim() : undefined
  return {
    ...(mention_tags && mention_tags.length > 0 ? { mention_tags } : {}),
    ...(segments && segments.length > 0 ? { segments } : {}),
    ...(display_message ? { display_message } : {}),
    ...(display_parts && display_parts.length > 0 ? { display_parts } : {}),
    ...(internal_message ? { internal_message } : {}),
  }
}

function trimSegmentEdges(segments: AiMessageSegment[]): AiMessageSegment[] {
  const next = [...segments]
  while (next.length > 0 && next[0]?.type === "text") {
    const first = next[0]
    if (first.type !== "text") break
    const trimmed = first.text.replace(/^\s+/, "")
    if (trimmed.length === 0) {
      next.shift()
      continue
    }
    next[0] = { type: "text", text: trimmed }
    break
  }
  while (next.length > 0 && next[next.length - 1]?.type === "text") {
    const lastIndex = next.length - 1
    const last = next[lastIndex]
    if (last.type !== "text") break
    const trimmed = last.text.replace(/\s+$/, "")
    if (trimmed.length === 0) {
      next.pop()
      continue
    }
    next[lastIndex] = { type: "text", text: trimmed }
    break
  }
  return next
}

/** Reconstruct ordered segments from plain content + tag metadata when segments were not persisted. */
export function inferUserMessageSegments(
  content: string,
  contentJson: AiUserMessageContentJson | null | undefined,
): AiMessageSegment[] {
  if (contentJson?.display_parts?.length) {
    return displayPartsToMessageSegments(contentJson.display_parts)
  }

  if (contentJson?.segments?.length) {
    return trimSegmentEdges(contentJson.segments)
  }

  const tags = contentJson?.mention_tags ?? []
  if (tags.length === 0) {
    return content ? [{ type: "text", text: content }] : []
  }

  const chipTexts = tags
    .map((tag) => ({ tag, text: chipDisplayText(tag) }))
    .sort((left, right) => right.text.length - left.text.length)

  const segments: AiMessageSegment[] = []
  let cursor = 0
  while (cursor < content.length) {
    let matched: { tag: AiContextTag; text: string } | null = null
    for (const candidate of chipTexts) {
      if (content.startsWith(candidate.text, cursor)) {
        matched = candidate
        break
      }
    }
    if (matched) {
      segments.push({ type: "mention", tag: matched.tag })
      cursor += matched.text.length
      continue
    }
    const nextBreak = chipTexts.reduce<number>((best, candidate) => {
      const index = content.indexOf(candidate.text, cursor)
      if (index < 0) return best
      if (best < 0 || index < best) return index
      return best
    }, -1)
    const end = nextBreak >= 0 ? nextBreak : content.length
    segments.push({ type: "text", text: content.slice(cursor, end) })
    cursor = end
  }

  return trimSegmentEdges(segments)
}

export function buildTaggedRefsSummary(contentJson: AiUserMessageContentJson | null | undefined) {
  const tags = contentJson?.mention_tags ?? []
  return buildAiChatTaggedRefs(tags)
}
