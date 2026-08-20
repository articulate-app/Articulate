/** URL helpers for brand-kit template center-pane selection. */

export const CENTER_TEMPLATE_ID_PARAM = "centerTemplateId"
export const LEFT_TEMPLATE_ID_PARAM = "leftTemplateId"
export const RIGHT_TEMPLATE_ID_PARAM = "rightTemplateId"

type ReadableParams = { get: (key: string) => string | null }

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export type TemplateWorkspaceRef = {
  /** Null for personal templates that are not attached to a project yet. */
  projectId: number | null
  templateId: string
}

const PERSONAL_TEMPLATE_PREFIX = "u"

/** Tab / URL identity: `{projectId}:{templateId}` or `u:{templateId}` when unattached. */
export function buildTemplateWorkspaceId(
  projectId: number | null | undefined,
  templateId: string,
): string {
  const id = templateId.trim()
  if (!id) return ""
  if (projectId == null || projectId <= 0) return `${PERSONAL_TEMPLATE_PREFIX}:${id}`
  return `${projectId}:${id}`
}

export function parseTemplateWorkspaceId(
  raw: string | null | undefined,
): TemplateWorkspaceRef | null {
  const value = typeof raw === "string" ? raw.trim() : ""
  if (!value) return null
  const colon = value.indexOf(":")
  if (colon <= 0) return null
  const owner = value.slice(0, colon)
  const templateId = value.slice(colon + 1).trim()
  if (!templateId) return null
  if (owner === PERSONAL_TEMPLATE_PREFIX) {
    return { projectId: null, templateId }
  }
  const projectId = Number(owner)
  if (!Number.isFinite(projectId) || projectId <= 0) return null
  return { projectId, templateId }
}

export function getCenterTemplateIdFromParams(params: ReadableParams): string | null {
  const id = nonEmpty(params.get(CENTER_TEMPLATE_ID_PARAM))
  return parseTemplateWorkspaceId(id) ? id : null
}

export function clearTemplateCenterSelectionParams(next: URLSearchParams) {
  next.delete(CENTER_TEMPLATE_ID_PARAM)
}

export function applyTemplateCenterSelectionParams(
  next: URLSearchParams,
  args: { workspaceId: string },
) {
  next.set(CENTER_TEMPLATE_ID_PARAM, args.workspaceId)
}
