/** HTML5 DnD payload for attaching chat artifacts to a task or project overview. */
export const ARTIFACT_ATTACH_DND_MIME = "application/x-articulate-artifact-id"

export function setArtifactAttachDragData(
  dataTransfer: DataTransfer,
  artifactId: string,
): void {
  const id = artifactId.trim()
  if (!id) return
  dataTransfer.setData(ARTIFACT_ATTACH_DND_MIME, id)
  // Fallback for browsers that strip custom MIME types in some contexts.
  dataTransfer.setData("text/plain", id)
  dataTransfer.effectAllowed = "link"
}

export function readArtifactAttachDragData(
  dataTransfer: DataTransfer | null | undefined,
): string | null {
  if (!dataTransfer) return null
  const raw =
    dataTransfer.getData(ARTIFACT_ATTACH_DND_MIME)?.trim()
    || dataTransfer.getData("text/plain")?.trim()
    || ""
  if (!raw) return null
  // Ignore accidental plain-text drops that are clearly not UUIDs.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return null
  }
  return raw
}

export function isArtifactAttachDrag(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types ?? []).includes(ARTIFACT_ATTACH_DND_MIME)
}
