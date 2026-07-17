export type RightPaneEntity = "task" | "project" | "user" | "team" | "thread"

function clearRightPaneSelection(next: URLSearchParams) {
  next.delete("rightTaskId")
  next.delete("rightProjectId")
  next.delete("rightUserId")
  next.delete("rightTeamId")
  next.delete("rightThreadId")
  next.delete("rightMentionId")
  next.delete("rightTab")
}

function clearGenericSelection(next: URLSearchParams) {
  next.delete("entity")
  next.delete("id")
  next.delete("tab")
  next.delete("detailType")
  next.delete("detailId")
  next.delete("briefingTypeId")
  next.delete("threadId")
  next.delete("mentionId")
}

export function buildRightPaneSelectionSearchParams(args: {
  currentSearchParams: URLSearchParams
  entity: RightPaneEntity
  id: string | number
  tab?: string | null
  mentionId?: string | number | null
}): URLSearchParams {
  const { currentSearchParams, entity, id, tab, mentionId } = args
  const next = new URLSearchParams(currentSearchParams.toString())
  next.set("layout", "right")
  clearGenericSelection(next)
  clearRightPaneSelection(next)

  if (entity === "task") {
    next.set("rightTaskId", String(id))
    return next
  }
  if (entity === "project") {
    next.set("rightProjectId", String(id))
    if (tab && tab !== "overview") next.set("rightTab", tab)
    else next.delete("rightTab")
    return next
  }
  if (entity === "user") {
    next.set("rightUserId", String(id))
    if (tab && tab !== "overview") next.set("rightTab", tab)
    else next.delete("rightTab")
    return next
  }
  if (entity === "team") {
    next.set("rightTeamId", String(id))
    if (tab && tab !== "overview") next.set("rightTab", tab)
    else next.delete("rightTab")
    return next
  }

  next.set("rightThreadId", String(id))
  if (mentionId != null) next.set("rightMentionId", String(mentionId))
  return next
}
