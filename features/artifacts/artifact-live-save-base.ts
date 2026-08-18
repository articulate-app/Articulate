import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"
import type { AiBuildArtifactPreviewEntry } from "../../app/store/ai-build-artifact-preview-store"

export type ArtifactDraftSnapshot = {
  contentText: string
  contentJson: TaskArtifact["content_json"]
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

export function shouldUseSavedLiveArtifactBase(
  base: TaskArtifact,
  live: AiBuildArtifactPreviewEntry | null | undefined,
): boolean {
  if (!live || live.phase !== "saved") return false
  const savedLive = live

  const liveVersion = savedLive.currentVersion ?? 0
  const baseVersion = base.current_version ?? 0
  if (liveVersion > baseVersion) return true
  if (liveVersion < baseVersion) return false

  const liveTitle = savedLive.title?.trim() ?? ""
  const baseTitle = base.title?.trim() ?? ""
  if (liveTitle && liveTitle !== baseTitle) return true

  if (
    typeof savedLive.contentText === "string"
    && savedLive.contentText !== (base.content_text ?? "")
  ) {
    return true
  }

  if (
    savedLive.contentJson
    && stableJson(savedLive.contentJson) !== stableJson(base.content_json)
  ) {
    return true
  }

  if (
    savedLive.assetData
    && stableJson(savedLive.assetData) !== stableJson(base.asset_data)
  ) {
    return true
  }

  return false
}

/**
 * While the list query is catching up, a just-saved live preview can be newer than
 * the server row we still have in memory. Use that saved snapshot as the effective
 * base so editor echo does not create a bogus "manual" revision on top of an AI save.
 */
export function resolveSavedLiveArtifactBase(
  base: TaskArtifact,
  live: AiBuildArtifactPreviewEntry | null | undefined,
): TaskArtifact {
  if (!shouldUseSavedLiveArtifactBase(base, live)) return base
  const savedLive = live as AiBuildArtifactPreviewEntry

  return {
    ...base,
    title: savedLive.title ?? base.title,
    content_text: savedLive.contentText ?? base.content_text,
    content_json: savedLive.contentJson ?? base.content_json,
    asset_data: savedLive.assetData ?? base.asset_data,
    current_version: savedLive.currentVersion ?? base.current_version,
    ai_thread_id: savedLive.aiThreadId ?? base.ai_thread_id,
  }
}

export function isArtifactDraftNoopAgainstBase(
  draft: ArtifactDraftSnapshot,
  base: Pick<TaskArtifact, "content_text" | "content_json">,
): boolean {
  return (
    draft.contentText === (base.content_text ?? "")
    && JSON.stringify(draft.contentJson) === JSON.stringify(base.content_json)
  )
}

/**
 * A draft must retain the version it was authored against. Replacing this with
 * the latest server version would let stale editor state overwrite an AI save.
 */
export function resolveArtifactDraftExpectedVersion(
  draftBaseVersion: number | null | undefined,
  serverVersion: number,
): number {
  return draftBaseVersion != null && draftBaseVersion > 0
    ? draftBaseVersion
    : Math.max(serverVersion, 0)
}

export function isArtifactDraftStaleForServerVersion(
  draftBaseVersion: number | null | undefined,
  serverVersion: number,
): boolean {
  return draftBaseVersion != null && draftBaseVersion > 0 && serverVersion > draftBaseVersion
}

/**
 * Realtime / query refresh of a version we just wrote must not look like an
 * external conflict. The in-flight save is enough; after success, the version
 * we persisted is also an echo until a later revision arrives.
 */
export function isOwnArtifactSaveEcho(args: {
  saveInFlight: boolean
  lastOwnSavedVersion: number | null | undefined
  serverVersion: number
}): boolean {
  if (args.saveInFlight) return true
  const lastOwnSavedVersion = args.lastOwnSavedVersion ?? 0
  return lastOwnSavedVersion > 0 && args.serverVersion > 0 && args.serverVersion <= lastOwnSavedVersion
}
