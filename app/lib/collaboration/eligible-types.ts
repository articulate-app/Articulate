/** First-wave types that use the TipTap document editor. */
export const COLLAB_RICH_TEXT_ARTIFACT_TYPES = [
  "document",
  "article",
  "post",
  "caption",
] as const

export type CollabRichTextArtifactType = (typeof COLLAB_RICH_TEXT_ARTIFACT_TYPES)[number]

export function isCollabRichTextArtifactType(artifactType: string | null | undefined): boolean {
  return COLLAB_RICH_TEXT_ARTIFACT_TYPES.includes(
    String(artifactType ?? "").trim().toLowerCase() as CollabRichTextArtifactType,
  )
}

export function isCollabExcludedContentFormat(contentFormat: string | null | undefined): boolean {
  return String(contentFormat ?? "").trim().toLowerCase() === "html_email"
}
