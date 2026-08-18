import { isCollabExcludedContentFormat, isCollabRichTextArtifactType } from "./eligible-types"

export type ArtifactCollabGateInput = {
  artifactType?: string | null
  contentFormat?: string | null
  collabEnabled?: boolean | null
  envEnabled?: boolean | null
}

/**
 * Client-side gate. The server still rejects unauthorized or disabled rooms.
 * Dual-read: when this is false the existing snapshot editor stays mounted.
 */
export function shouldUseArtifactCollaboration(input: ArtifactCollabGateInput): boolean {
  if (!isCollabRichTextArtifactType(input.artifactType)) return false
  if (isCollabExcludedContentFormat(input.contentFormat)) return false
  return input.collabEnabled === true || input.envEnabled === true
}
