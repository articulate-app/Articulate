import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import type { TaskArtifact } from "../app/lib/artifacts/artifact-types"
import {
  applyArtifactCachePatch,
  artifactCachePatchFromSavedLivePreview,
} from "../features/artifacts/artifact-query-cache"
import type { AiBuildArtifactPreviewEntry } from "../app/store/ai-build-artifact-preview-store"

function makeArtifact(overrides: Partial<TaskArtifact> = {}): TaskArtifact {
  return {
    id: "artifact-1",
    task_id: 13622,
    project_id: 55,
    ai_thread_id: "thread-1",
    artifact_type: "article",
    artifact_role: null,
    title: "Artifact",
    status: "draft",
    sort_order: 1,
    channel_id: 7,
    language_id: 9,
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
    key: "build-1:unit-1:artifact-1",
    buildId: "build-1",
    unitId: "unit-1",
    artifactId: "artifact-1",
    taskId: 13622,
    projectId: 55,
    aiThreadId: "thread-1",
    channelId: 7,
    languageId: 9,
    channelName: null,
    languageName: null,
    artifactType: "article",
    artifactRole: null,
    title: "Artifact updated",
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
    phase: "saved",
    sequence: 12,
    errorMessage: null,
    media: [],
    streaming: false,
    streamChars: null,
    streamSnippet: null,
    targetSectionHeading: null,
    sectionHtml: null,
    sectionBeforeHtml: null,
    threadId: "thread-1",
    assistantMessageIds: {},
    updatedAt: "2026-08-17T11:22:08Z",
    ...overrides,
  }
}

describe("artifact query cache", () => {
  it("derives a saved-live patch when the preview is newer than the list row", () => {
    const patch = artifactCachePatchFromSavedLivePreview(makeLive(), makeArtifact())
    expect(patch).toMatchObject({
      id: "artifact-1",
      current_version: 5,
      content_text: "new body",
      title: "Artifact updated",
    })
  })

  it("writes the saved snapshot into scoped artifact caches", () => {
    const queryClient = new QueryClient()
    const base = makeArtifact()

    queryClient.setQueryData(["task-artifacts", 13622], {
      ok: true,
      task_id: 13622,
      task_title: "Task",
      project_id: 55,
      available_channels: [],
      available_languages: [],
      artifacts: [base],
    })
    queryClient.setQueryData(["task-artifacts-meta", 13622], {
      ok: true,
      task_id: 13622,
      task_title: "Task",
      project_id: 55,
      available_channels: [],
      available_languages: [],
      artifacts: [base],
    })
    queryClient.setQueryData(["project-artifacts", 55], {
      ok: true,
      project_id: 55,
      project_name: "Project",
      artifacts: [base],
    })
    queryClient.setQueryData(["ai-thread-artifacts", "thread-1"], {
      ok: true,
      thread_id: "thread-1",
      artifacts: [base],
    })
    queryClient.setQueryData(["artifact", "artifact-1", "current"], {
      ok: true,
      artifact_id: "artifact-1",
      version_number: 4,
      snapshot: base,
    })

    applyArtifactCachePatch(queryClient, {
      id: "artifact-1",
      task_id: 13622,
      project_id: 55,
      ai_thread_id: "thread-1",
      title: "Artifact updated",
      content_text: "new body",
      content_json: {
        blocks: [{ id: "body", type: "rich_text", html: "<p>new body</p>" }],
      },
      current_version: 5,
      updated_at: "2026-08-17T11:22:08Z",
    })

    const taskList = queryClient.getQueryData<{ artifacts: TaskArtifact[] }>(["task-artifacts", 13622])
    const metaList = queryClient.getQueryData<{ artifacts: TaskArtifact[] }>(["task-artifacts-meta", 13622])
    const projectList = queryClient.getQueryData<{ artifacts: TaskArtifact[] }>(["project-artifacts", 55])
    const threadList = queryClient.getQueryData<{ artifacts: TaskArtifact[] }>(["ai-thread-artifacts", "thread-1"])
    const currentArtifact = queryClient.getQueryData<{ snapshot: TaskArtifact; version_number: number }>([
      "artifact",
      "artifact-1",
      "current",
    ])

    expect(taskList?.artifacts[0]?.current_version).toBe(5)
    expect(taskList?.artifacts[0]?.content_text).toBe("new body")
    expect(metaList?.artifacts[0]?.current_version).toBe(5)
    expect(projectList?.artifacts[0]?.content_text).toBe("new body")
    expect(threadList?.artifacts[0]?.content_text).toBe("new body")
    expect(currentArtifact?.version_number).toBe(5)
    expect(currentArtifact?.snapshot.content_text).toBe("new body")
  })
})
