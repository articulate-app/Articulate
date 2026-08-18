import { parseArtifactCollaborationRoom } from "./room"

export type ArtifactCollabTopicAction = "receive" | "send" | "presence"

/**
 * Mirrors realtime.messages RLS: private topic `artifact:{uuid}` only.
 * Server still authorizes with auth.uid() + ai_authorize_artifact_v2.
 */
export function canAccessArtifactCollabTopic(args: {
  topic: string
  action: ArtifactCollabTopicAction
  hasArtifactAccess: boolean
  canWrite: boolean
}): boolean {
  if (!parseArtifactCollaborationRoom(args.topic)) return false
  if (!args.hasArtifactAccess) return false
  if (args.action === "send") return args.canWrite
  return true
}
