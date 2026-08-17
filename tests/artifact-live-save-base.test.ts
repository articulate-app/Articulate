import { describe, expect, it } from "vitest"
import {
  isArtifactDraftStaleForServerVersion,
  isArtifactDraftNoopAgainstBase,
  resolveArtifactDraftExpectedVersion,
  resolveSavedLiveArtifactBase,
} from "../features/artifacts/artifact-live-save-base"
import type { TaskArtifact } from "../app/lib/artifacts/artifact-types"
import type { AiBuildArtifactPreviewEntry } from "../app/store/ai-build-artifact-preview-store"

function makeArtifact(overrides: Partial<TaskArtifact> = {}): TaskArtifact {
  return {
    id: "artifact-1",
    task_id: 13622,
    project_id: null,
    ai_thread_id: "thread-old",
    artifact_type: "article",
    artifact_role: null,
    title: "Artifact",
    status: "draft",
    sort_order: 1,
    channel_id: null,
    language_id: null,
    content_text: "old body",
    content_json: {
      blocks: [{ id: "body", type: "rich_text", html: "<p>old body</p>" }],
    },
    asset_data: null,
    source_artifact_id: null,
    source_version_number: null,
    derivation_type: null,
    current_version: 4,
    metadata: null,
    content_preview: null,
    created_by: 1,
    created_at: "2026-08-17T11:20:00Z",
    updated_at: "2026-08-17T11:20:00Z",
    ...overrides,
  }
}

function makeLive(overrides: Partial<AiBuildArtifactPreviewEntry> = {}): AiBuildArtifactPreviewEntry {
  return {
    buildId: "build-1",
    unitId: "unit-1",
    artifactId: "artifact-1",
    sequence: 11,
    eventType: "artifact.version_saved",
    phase: "saved",
    updatedAt: "2026-08-17T11:22:08Z",
    taskId: 13622,
    projectId: null,
    aiThreadId: "thread-new",
    channelId: null,
    languageId: null,
    channelName: null,
    languageName: null,
    title: "Artifact",
    artifactType: "article",
    artifactRole: null,
    contentText: "new body",
    beforeContentText: "old body",
    beforeContentJson: {
      blocks: [{ id: "body", type: "rich_text", html: "<p>old body</p>" }],
    },
    diffContentText: "new body",
    contentJson: {
      blocks: [{ id: "body", type: "rich_text", html: "<p>new body</p>" }],
    },
    assetData: null,
    currentVersion: 5,
    errorMessage: null,
    mediaItems: [],
    streaming: false,
    streamChars: null,
    streamSnippet: null,
    targetSectionHeading: null,
    sectionHtml: null,
    sectionBeforeHtml: null,
    threadId: "thread-new",
    assistantMessageId: "assistant-1",
    ...overrides,
  }
}

describe("artifact live save base", () => {
  it("prefers a newer saved live preview over the stale list row", () => {
    const base = makeArtifact()
    const live = makeLive()

    const effective = resolveSavedLiveArtifactBase(base, live)

    expect(effective.current_version).toBe(5)
    expect(effective.content_text).toBe("new body")
    expect(effective.ai_thread_id).toBe("thread-new")
  })

  it("ignores live previews that are not newer saved versions", () => {
    const base = makeArtifact()
    const live = makeLive({ phase: "preview", currentVersion: 4, contentText: "preview body" })

    const effective = resolveSavedLiveArtifactBase(base, live)

    expect(effective).toBe(base)
  })

  it("treats editor echo of the saved live snapshot as a no-op", () => {
    const effectiveBase = resolveSavedLiveArtifactBase(makeArtifact(), makeLive())

    const noop = isArtifactDraftNoopAgainstBase(
      {
        contentText: "new body",
        contentJson: {
          blocks: [{ id: "body", type: "rich_text", html: "<p>new body</p>" }],
        },
      },
      effectiveBase,
    )

    expect(noop).toBe(true)
  })

  it("keeps a manual draft on its original version when the server advances", () => {
    expect(resolveArtifactDraftExpectedVersion(4, 5)).toBe(4)
    expect(isArtifactDraftStaleForServerVersion(4, 5)).toBe(true)
  })
})
