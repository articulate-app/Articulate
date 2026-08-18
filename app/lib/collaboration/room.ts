const ARTIFACT_ROOM_RE =
  /^artifact:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

export function artifactCollaborationRoom(artifactId: string): string {
  return `artifact:${artifactId}`
}

export function parseArtifactCollaborationRoom(documentName: string): string | null {
  const match = ARTIFACT_ROOM_RE.exec(String(documentName ?? "").trim())
  return match?.[1] ?? null
}
