import * as Y from "yjs"
import { artifactCollaborationRoom } from "./room"
import type { ArtifactCollabProvider } from "./supabase-provider"

export type ArtifactCollabProviderLike = {
  disconnect?: () => void
  destroy?: () => void
  connect?: () => Promise<void> | void
}

export type ArtifactCollabSession = {
  artifactId: string
  room: string
  document: Y.Doc
  provider: ArtifactCollabProviderLike | ArtifactCollabProvider | null
  refs: number
}

export type CreateArtifactCollabProvider = (args: {
  artifactId: string
  room: string
  document: Y.Doc
}) => ArtifactCollabProviderLike | ArtifactCollabProvider

const sessions = new Map<string, ArtifactCollabSession>()

function destroyProvider(provider: ArtifactCollabProviderLike | null): void {
  if (!provider) return
  try {
    provider.disconnect?.()
  } catch {
    // Disconnect is best-effort during teardown.
  }
  try {
    provider.destroy?.()
  } catch {
    // Provider implementations vary; never throw from release.
  }
}

/**
 * One Y.Doc + provider per artifact in this browser tab.
 * Task Details and Artifact Pane must acquire/release the same session.
 */
export function acquireArtifactCollabSession(args: {
  artifactId: string
  createProvider?: CreateArtifactCollabProvider
}): ArtifactCollabSession {
  const artifactId = args.artifactId.trim()
  if (!artifactId) throw new Error("artifact_id_required")

  const existing = sessions.get(artifactId)
  if (existing) {
    existing.refs += 1
    return existing
  }

  const document = new Y.Doc()
  const room = artifactCollaborationRoom(artifactId)
  const provider = args.createProvider
    ? args.createProvider({ artifactId, room, document })
    : null

  const session: ArtifactCollabSession = {
    artifactId,
    room,
    document,
    provider,
    refs: 1,
  }
  sessions.set(artifactId, session)
  return session
}

export function releaseArtifactCollabSession(artifactId: string): boolean {
  const session = sessions.get(artifactId)
  if (!session) return false
  session.refs -= 1
  if (session.refs > 0) return false
  destroyProvider(session.provider)
  session.document.destroy()
  sessions.delete(artifactId)
  return true
}

export function peekArtifactCollabSession(artifactId: string): ArtifactCollabSession | null {
  return sessions.get(artifactId) ?? null
}

export function resetArtifactCollabRegistryForTests(): void {
  for (const [artifactId, session] of sessions) {
    destroyProvider(session.provider)
    session.document.destroy()
    sessions.delete(artifactId)
  }
}
