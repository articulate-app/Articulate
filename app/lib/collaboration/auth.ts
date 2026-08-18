import { parseArtifactCollaborationRoom } from "./room"
import { isCollaborativeRichTextEditorKind } from "./editor-kind"

export class CollaborationAuthError extends Error {
  readonly reason: string
  constructor(reason: string, message = reason) {
    super(message)
    this.reason = reason
  }
}

export type ArtifactCollabAuthorizeResult = {
  ok: boolean
  code?: string
  artifact_id?: string
  can_read?: boolean
  can_write?: boolean
  collab_enabled?: boolean
  editor_kind?: string
  user_id?: number
  full_name?: string | null
  photo?: string | null
}

export function resolveCollaborationAuth(args: {
  documentName: string
  token: string | null | undefined
  authorize: ArtifactCollabAuthorizeResult
  envFlagEnabled: boolean
}): {
  artifactId: string
  readOnly: boolean
  userId: number
  name: string
  avatar: string | null
} {
  const artifactId = parseArtifactCollaborationRoom(args.documentName)
  if (!artifactId) throw new CollaborationAuthError("invalid_room")
  const token = String(args.token ?? "").replace(/^Bearer\s+/i, "").trim()
  if (!token) throw new CollaborationAuthError("authentication_required")
  if (!args.authorize.ok) {
    throw new CollaborationAuthError(args.authorize.code || "artifact_forbidden")
  }
  if (args.authorize.artifact_id && args.authorize.artifact_id !== artifactId) {
    throw new CollaborationAuthError("artifact_mismatch")
  }
  if (!isCollaborativeRichTextEditorKind(args.authorize.editor_kind ?? "rich_text")) {
    throw new CollaborationAuthError("collab_not_supported")
  }
  const enabled = args.authorize.collab_enabled === true || args.envFlagEnabled
  if (!enabled) throw new CollaborationAuthError("collab_disabled")
  if (args.authorize.can_read !== true) throw new CollaborationAuthError("artifact_forbidden")
  return {
    artifactId,
    readOnly: args.authorize.can_write !== true,
    userId: Number(args.authorize.user_id),
    name: String(args.authorize.full_name ?? "User"),
    avatar: args.authorize.photo ?? null,
  }
}

export function presenceColor(userId: number): string {
  const palette = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0f766e", "#b45309"]
  const index = Number.isInteger(userId) ? Math.abs(userId) % palette.length : 0
  return palette[index] ?? palette[0]
}
