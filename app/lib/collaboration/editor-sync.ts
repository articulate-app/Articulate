import { peekArtifactCollabSession } from "./provider-registry"
import { isArtifactCollabEnvEnabled, shouldUseArtifactCollaboration } from "./feature-flag"

const rememberedCollabEnabled = new Map<string, boolean>()

export function rememberArtifactCollabEnabled(artifactId: string, enabled: boolean): void {
  rememberedCollabEnabled.set(artifactId, enabled)
}

/** True when this artifact already has a shared Y.Doc or is eligible for one. */
export function isCollaborativeArtifactSurface(args: {
  artifactId?: string | null
  contentJson?: unknown
  metadata?: unknown
}): boolean {
  const artifactId = String(args.artifactId ?? "").trim()
  if (artifactId && peekArtifactCollabSession(artifactId)) return true
  if (artifactId && rememberedCollabEnabled.get(artifactId) === true) return true
  return shouldUseArtifactCollaboration({
    contentJson: args.contentJson,
    metadata: args.metadata,
    envEnabled: isArtifactCollabEnvEnabled(),
  })
}

/** In collaborative mode the Yjs binding owns the document. */
export function canReplaceCollaborativeEditorContent(collaborative: boolean): boolean {
  return collaborative !== true
}

export function canAutosaveArtifactSnapshot(collaborative: boolean): boolean {
  return collaborative !== true
}

/** Manual editing of the current document is never locked — including during AI. */
export function shouldLockArtifactDuringAiGeneration(_collaborative: boolean): boolean {
  return false
}
