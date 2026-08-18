import { parseArtifactCollaborationRoom } from "../../../app/lib/collaboration/room"
import { isCollabExcludedContentFormat } from "../../../app/lib/collaboration/eligible-types"
import type { CollabAuthorizeResult } from "./database"

export class CollaborationAuthError extends Error {
  readonly reason: string
  constructor(reason: string, message = reason) {
    super(message)
    this.reason = reason
  }
}

export function resolveCollaborationAuth(args: {
  documentName: string
  token: string | null | undefined
  authorize: CollabAuthorizeResult
  envFlagEnabled: boolean
  contentFormat?: string | null
}): {
  artifactId: string
  readOnly: boolean
  userId: number
  name: string
  avatar: string | null
} {
  const artifactId = parseArtifactCollaborationRoom(args.documentName)
  if (!artifactId) {
    throw new CollaborationAuthError("invalid_room")
  }
  const token = String(args.token ?? "").replace(/^Bearer\s+/i, "").trim()
  if (!token) {
    throw new CollaborationAuthError("authentication_required")
  }
  if (!args.authorize.ok) {
    throw new CollaborationAuthError(args.authorize.code || "artifact_forbidden")
  }
  if (args.authorize.artifact_id && args.authorize.artifact_id !== artifactId) {
    throw new CollaborationAuthError("artifact_mismatch")
  }
  if (isCollabExcludedContentFormat(args.contentFormat)) {
    throw new CollaborationAuthError("collab_not_supported")
  }
  const enabled = args.authorize.collab_enabled === true || args.envFlagEnabled
  if (!enabled) {
    throw new CollaborationAuthError("collab_disabled")
  }
  if (args.authorize.can_read !== true) {
    throw new CollaborationAuthError("artifact_forbidden")
  }
  return {
    artifactId,
    readOnly: args.authorize.can_write !== true,
    userId: Number(args.authorize.user_id),
    name: String(args.authorize.full_name ?? "User"),
    avatar: args.authorize.photo ?? null,
  }
}
