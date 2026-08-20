export type ArtifactHistoryActorType = "user" | "agent" | "system"

const HIDDEN_SUMMARY_RE = /idle editorial|proposal applied|ydoc|checkpoint|seq\b/i

export function artifactHistoryActorType(
  changeSource?: string | null,
  aiRunId?: string | null,
): ArtifactHistoryActorType {
  if (changeSource === "ai" || Boolean(aiRunId)) return "agent"
  if (changeSource === "restore" || changeSource === "system" || changeSource === "publish") return "system"
  return "user"
}

export function artifactHistoryUserFacingSummary(value?: string | null): string | null {
  const text = String(value ?? "").trim()
  if (!text || HIDDEN_SUMMARY_RE.test(text)) return null
  return text
}

export function formatArtifactHistoryDescription(args: {
  actorName?: string | null
  changeSource?: string | null
  aiRunId?: string | null
}): { name: string; remainder: string; actorType: ArtifactHistoryActorType } {
  const actorType = artifactHistoryActorType(args.changeSource, args.aiRunId)
  if (actorType === "agent") {
    return { name: "AI", remainder: " edited this", actorType }
  }
  const name = String(args.actorName ?? "").trim() || "Someone"
  if (args.changeSource === "restore") {
    return { name, remainder: " restored a previous version", actorType }
  }
  if (args.changeSource === "publish") {
    return { name, remainder: " published this", actorType }
  }
  return { name, remainder: " edited this", actorType }
}
