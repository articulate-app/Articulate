import type { AiContextTag, AiTagType } from "./composer-inline-editor"

const MENTION_CHIP_BASE =
  "ai-composer-tag inline-flex max-w-[14rem] cursor-default select-none items-center gap-0.5 rounded py-px align-baseline text-xs font-medium leading-none whitespace-nowrap"

function resolveMentionChipKind(
  type: AiTagType,
): "task" | "project" | "component" | "channel" | "user" | "artifact" | "source" | "neutral" {
  if (type === "task" || type === "task_channel") return "task"
  if (type === "project") return "project"
  if (type === "component" || type === "task_component") return "component"
  if (type === "channel") return "channel"
  if (type === "user") return "user"
  if (type === "artifact") return "artifact"
  if (type === "source") return "source"
  return "neutral"
}

/** Subtle type-specific chip styling for composer + message history. */
export function getMentionChipClassName(tag: Pick<AiContextTag, "type">): string {
  switch (resolveMentionChipKind(tag.type)) {
    case "task":
      return `${MENTION_CHIP_BASE} bg-blue-50/90 px-1.5 text-blue-800 border border-blue-200/60`
    case "project":
      return `${MENTION_CHIP_BASE} bg-emerald-50/90 px-1.5 text-emerald-800 border border-emerald-200/60`
    case "component":
      return `${MENTION_CHIP_BASE} bg-violet-50/90 px-1.5 text-violet-800 border border-violet-200/60`
    case "channel":
      return `${MENTION_CHIP_BASE} bg-amber-50/90 px-1.5 text-amber-800 border border-amber-200/60`
    case "user":
      return `${MENTION_CHIP_BASE} bg-gray-50 px-1 pr-0.5 text-gray-700 border border-gray-200/70`
    case "artifact":
      return `${MENTION_CHIP_BASE} bg-sky-50/90 px-1.5 text-sky-800 border border-sky-200/60`
    case "source":
      return `${MENTION_CHIP_BASE} bg-teal-50/90 px-1.5 text-teal-800 border border-teal-200/60`
    default:
      return `${MENTION_CHIP_BASE} bg-gray-100 px-1.5 text-gray-700`
  }
}
