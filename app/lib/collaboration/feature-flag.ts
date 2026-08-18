import { isCollaborativeRichTextEditorKind, resolveArtifactEditorKind } from "./editor-kind"

export type ArtifactCollabGateInput = {
  contentJson?: unknown
  metadata?: unknown
  editorKind?: string | null
  contentFormat?: string | null
  collabEnabled?: boolean | null
  envEnabled?: boolean | null
}

/**
 * Client-side gate. The server still rejects unauthorized or disabled rooms.
 * Dual-read: when this is false the existing snapshot editor stays mounted.
 * Eligibility is based on editor kind / content format, never artifact_type.
 */
export function shouldUseArtifactCollaboration(input: ArtifactCollabGateInput): boolean {
  const metadata = {
    ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {}),
    ...(input.contentFormat ? { content_format: input.contentFormat } : {}),
  }
  const editorKind = input.editorKind ?? resolveArtifactEditorKind({
    content_json: input.contentJson,
    metadata,
  })
  if (!isCollaborativeRichTextEditorKind(editorKind)) return false
  return input.collabEnabled === true || input.envEnabled === true
}

export function isArtifactCollabEnvEnabled(): boolean {
  return String(process.env.NEXT_PUBLIC_ARTIFACT_COLLAB_ENABLED ?? "").trim().toLowerCase() === "true"
}
