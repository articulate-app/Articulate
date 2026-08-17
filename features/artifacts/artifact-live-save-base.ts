import type { TaskArtifact } from "../../app/lib/artifacts/artifact-types"
import type { AiBuildArtifactPreviewEntry } from "../../app/store/ai-build-artifact-preview-store"

export type ArtifactDraftSnapshot = {
  contentText: string
  contentJson: TaskArtifact["content_json"]
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
  const liveSavedIsNewer =
    !!live
    && live.phase === "saved"
    && live.currentVersion != null
    && live.currentVersion > (base.current_version ?? 0)

  if (!liveSavedIsNewer) return base

  return {
    ...base,
    title: live.title ?? base.title,
    content_text: live.contentText ?? base.content_text,
    content_json: live.contentJson ?? base.content_json,
    asset_data: live.assetData ?? base.asset_data,
    current_version: live.currentVersion ?? base.current_version,
    ai_thread_id: live.aiThreadId ?? base.ai_thread_id,
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
