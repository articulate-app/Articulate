/** Unified preview registry identity: `group_id` wins, then `preview_key`. */
export function resolvePreviewRegistryKey(args: {
  group_id?: string | null
  preview_key?: string | null
  fallbackKey: string
}): string {
  const groupId = typeof args.group_id === "string" ? args.group_id.trim() : ""
  if (groupId.length > 0) return groupId
  const previewKey = typeof args.preview_key === "string" ? args.preview_key.trim() : ""
  if (previewKey.length > 0) return previewKey
  return args.fallbackKey
}

export function isComponentOutputPreviewGroup(groupId: string | null | undefined): boolean {
  const trimmed = typeof groupId === "string" ? groupId.trim() : ""
  return trimmed.startsWith("component-output:")
}

/**
 * Component preview events own `component-output:*` groups — suppress a generic change card
 * for the same group.
 */
export function shouldSuppressGenericPreviewForGroup(args: {
  group_id?: string | null
  hasComponentPreviewForGroup: boolean
}): boolean {
  if (!args.group_id) return false
  if (!isComponentOutputPreviewGroup(args.group_id)) return false
  return args.hasComponentPreviewForGroup
}

export const PREVIEW_DELTA_COMMIT_MS = 40

export type PreviewRevisionConflict = {
  code: "component_revision_conflict"
  message?: string | null
  server_updated_at?: string | null
}

export function parsePreviewRevisionConflict(
  parsed: Record<string, unknown>,
): PreviewRevisionConflict | null {
  const code =
    (typeof parsed.code === "string" ? parsed.code : null) ??
    (typeof parsed.error_code === "string" ? parsed.error_code : null)
  if (code !== "component_revision_conflict") return null
  return {
    code: "component_revision_conflict",
    message: typeof parsed.message === "string" ? parsed.message : null,
    server_updated_at:
      typeof parsed.server_updated_at === "string" ? parsed.server_updated_at : null,
  }
}
