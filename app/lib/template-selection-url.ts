/** URL helpers for brand-kit template center-pane selection. */

export const CENTER_TEMPLATE_ID_PARAM = "centerTemplateId"
export const LEFT_TEMPLATE_ID_PARAM = "leftTemplateId"
export const RIGHT_TEMPLATE_ID_PARAM = "rightTemplateId"

type ReadableParams = { get: (key: string) => string | null }

function nonEmpty(value: string | null): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

/** Tab / URL identity: `{projectId}:{templateId}`. */
export function buildTemplateWorkspaceId(projectId: number, templateId: string): string {
  return `${projectId}:${templateId.trim()}`
}

export function parseTemplateWorkspaceId(
  raw: string | null | undefined,
): { projectId: number; templateId: string } | null {
  const value = typeof raw === "string" ? raw.trim() : ""
  if (!value) return null
  const colon = value.indexOf(":")
  if (colon <= 0) return null
  const projectId = Number(value.slice(0, colon))
  const templateId = value.slice(colon + 1).trim()
  if (!Number.isFinite(projectId) || projectId <= 0 || !templateId) return null
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
