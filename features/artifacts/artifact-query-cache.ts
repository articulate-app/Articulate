import type { QueryClient } from "@tanstack/react-query"
import {
  isArchivedArtifactStatus,
  type ArtifactGetResult,
  type ProjectArtifactsListResult,
  type TaskArtifact,
  type TaskArtifactsListResult,
  type ThreadArtifactsListResult,
} from "../../app/lib/artifacts/artifact-types"
import {
  useAiBuildArtifactPreviewStore,
  type AiBuildArtifactPreviewEntry,
} from "../../app/store/ai-build-artifact-preview-store"
import { shouldUseSavedLiveArtifactBase } from "./artifact-live-save-base"

export type ArtifactCachePatch = Partial<TaskArtifact> & Pick<TaskArtifact, "id">

function hasOwn<K extends keyof ArtifactCachePatch>(
  patch: ArtifactCachePatch,
  key: K,
): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key)
}

function pickField<K extends keyof TaskArtifact>(
  current: TaskArtifact | null | undefined,
  patch: ArtifactCachePatch,
  key: K,
  fallback: TaskArtifact[K],
): TaskArtifact[K] {
  if (hasOwn(patch, key)) {
    return patch[key] as TaskArtifact[K]
  }
  if (current && current[key] !== undefined) return current[key]
  return fallback
}

export function mergeArtifactCachePatch(
  current: TaskArtifact | null | undefined,
  patch: ArtifactCachePatch,
): TaskArtifact {
  return {
    id: patch.id,
    task_id: pickField(current, patch, "task_id", null),
    project_id: pickField(current, patch, "project_id", null),
    ai_thread_id: pickField(current, patch, "ai_thread_id", null),
    artifact_type: pickField(current, patch, "artifact_type", "document"),
    artifact_role: pickField(current, patch, "artifact_role", null),
    title: pickField(current, patch, "title", null),
    status: pickField(current, patch, "status", "draft"),
    sort_order: pickField(current, patch, "sort_order", null),
    channel_id: pickField(current, patch, "channel_id", null),
    language_id: pickField(current, patch, "language_id", null),
    content_text: pickField(current, patch, "content_text", null),
    content_json: pickField(current, patch, "content_json", null),
    asset_data: pickField(current, patch, "asset_data", null),
    source_artifact_id: pickField(current, patch, "source_artifact_id", null),
    source_version_number: pickField(current, patch, "source_version_number", null),
    derivation_type: pickField(current, patch, "derivation_type", null),
    current_version: pickField(current, patch, "current_version", 0),
    metadata: pickField(current, patch, "metadata", null),
    content_preview: pickField(current, patch, "content_preview", null),
    created_by: pickField(current, patch, "created_by", null),
    created_at: pickField(current, patch, "created_at", null),
    updated_at: pickField(current, patch, "updated_at", null),
  }
}

function compareArtifactsForListOrder(left: TaskArtifact, right: TaskArtifact): number {
  const leftSort = left.sort_order ?? 0
  const rightSort = right.sort_order ?? 0
  if (leftSort !== rightSort) return leftSort - rightSort
  const leftUpdated = left.updated_at ? Date.parse(left.updated_at) : 0
  const rightUpdated = right.updated_at ? Date.parse(right.updated_at) : 0
  return rightUpdated - leftUpdated
}

function dropArtifactFromList<T extends { artifacts: TaskArtifact[] }>(
  data: T | undefined,
  artifactId: string,
): T | undefined {
  if (!data) return data
  const nextArtifacts = data.artifacts.filter((row) => row.id !== artifactId)
  if (nextArtifacts.length === data.artifacts.length) return data
  return { ...data, artifacts: nextArtifacts }
}

function dropArtifactFromQueryData(data: unknown, artifactId: string): unknown {
  if (!data) return data
  if (Array.isArray(data)) {
    const next = data.filter((row) => {
      if (!row || typeof row !== "object") return true
      return (row as { id?: unknown }).id !== artifactId
    })
    return next.length === data.length ? data : next
  }
  if (typeof data === "object" && Array.isArray((data as { artifacts?: unknown }).artifacts)) {
    return dropArtifactFromList(data as { artifacts: TaskArtifact[] }, artifactId)
  }
  return data
}

function upsertArtifactList<T extends { artifacts: TaskArtifact[] }>(
  data: T | undefined,
  patch: ArtifactCachePatch,
  scopeMatches: (artifact: TaskArtifact) => boolean,
): T | undefined {
  if (!data) return data
  if (isArchivedArtifactStatus(patch.status)) {
    return dropArtifactFromList(data, patch.id)
  }
  const index = data.artifacts.findIndex((row) => row.id === patch.id)
  if (index >= 0) {
    const current = data.artifacts[index]
    const merged = mergeArtifactCachePatch(current, patch)
    if (isArchivedArtifactStatus(merged.status)) {
      return dropArtifactFromList(data, patch.id)
    }
    const nextArtifacts = [...data.artifacts]
    nextArtifacts[index] = merged
    return { ...data, artifacts: nextArtifacts }
  }
  const inserted = mergeArtifactCachePatch(null, patch)
  if (isArchivedArtifactStatus(inserted.status)) return data
  if (!scopeMatches(inserted)) return data
  const nextArtifacts = [...data.artifacts, inserted].sort(compareArtifactsForListOrder)
  return { ...data, artifacts: nextArtifacts }
}

export function removeArtifactFromCache(
  queryClient: QueryClient,
  artifactId: string,
): void {
  const id = artifactId.trim()
  if (!id) return
  const drop = (current: unknown) => dropArtifactFromQueryData(current, id)
  queryClient.setQueriesData({ queryKey: ["task-artifacts"] }, drop)
  queryClient.setQueriesData({ queryKey: ["task-artifacts-meta"] }, drop)
  queryClient.setQueriesData({ queryKey: ["project-artifacts"] }, drop)
  queryClient.setQueriesData({ queryKey: ["project-artifacts-meta"] }, drop)
  queryClient.setQueriesData({ queryKey: ["ai-thread-artifacts"] }, drop)
  queryClient.removeQueries({ queryKey: ["artifact", id] })
  queryClient.removeQueries({ queryKey: ["artifact-versions", id] })
}

/**
 * Drop a soft-deleted artifact from list caches and live AI overlays so
 * chat/build hydrate cannot put it back on the task.
 */
export function forgetDeletedArtifact(
  queryClient: QueryClient,
  artifactId: string,
): void {
  const id = artifactId.trim()
  if (!id) return
  useAiBuildArtifactPreviewStore.getState().suppressArtifact(id)
  removeArtifactFromCache(queryClient, id)
}

export function applyArtifactCachePatch(
  queryClient: QueryClient,
  patch: ArtifactCachePatch,
): void {
  if (isArchivedArtifactStatus(patch.status)) {
    removeArtifactFromCache(queryClient, patch.id)
    return
  }
  const taskId = patch.task_id ?? null
  const projectId = patch.project_id ?? null
  const threadId = patch.ai_thread_id ?? null

  if (taskId != null) {
    queryClient.setQueryData<TaskArtifactsListResult | undefined>(
      ["task-artifacts", taskId],
      (current) => upsertArtifactList(current, patch, (artifact) => artifact.task_id === taskId),
    )
    queryClient.setQueryData<TaskArtifactsListResult | undefined>(
      ["task-artifacts-meta", taskId],
      (current) => upsertArtifactList(current, patch, (artifact) => artifact.task_id === taskId),
    )
  }

  if (projectId != null) {
    queryClient.setQueryData<ProjectArtifactsListResult | undefined>(
      ["project-artifacts", projectId],
      (current) =>
        upsertArtifactList(current, patch, (artifact) => artifact.project_id === projectId),
    )
    queryClient.setQueryData<ProjectArtifactsListResult | undefined>(
      ["project-artifacts-meta", projectId],
      (current) =>
        upsertArtifactList(current, patch, (artifact) => artifact.project_id === projectId),
    )
  }

  if (threadId) {
    queryClient.setQueryData<ThreadArtifactsListResult | undefined>(
      ["ai-thread-artifacts", threadId],
      (current) =>
        upsertArtifactList(current, patch, (artifact) => artifact.ai_thread_id === threadId),
    )
  }

  queryClient.setQueryData<ArtifactGetResult | undefined>(
    ["artifact", patch.id, "current"],
    (current) => ({
      ok: true,
      artifact_id: patch.id,
      version_number:
        patch.current_version
        ?? current?.version_number
        ?? current?.snapshot.current_version
        ?? 0,
      snapshot: mergeArtifactCachePatch(current?.snapshot, patch),
    }),
  )

  queryClient.setQueryData<ArtifactGetResult | undefined>(
    ["artifact", patch.id],
    (current) => ({
      ok: true,
      artifact_id: patch.id,
      version_number:
        patch.current_version
        ?? current?.version_number
        ?? current?.snapshot.current_version
        ?? 0,
      snapshot: mergeArtifactCachePatch(current?.snapshot, patch),
    }),
  )
}

export function artifactCachePatchFromSavedLivePreview(
  live: AiBuildArtifactPreviewEntry | null | undefined,
  current?: TaskArtifact | null,
): ArtifactCachePatch | null {
  if (!live || live.phase !== "saved") return null
  const liveVersion = live.currentVersion ?? 0
  const currentVersion = current?.current_version ?? 0
  if (current && !shouldUseSavedLiveArtifactBase(current, live)) return null
  return {
    id: live.artifactId,
    task_id: live.taskId ?? current?.task_id ?? null,
    project_id: live.projectId ?? current?.project_id ?? null,
    ai_thread_id: live.aiThreadId ?? current?.ai_thread_id ?? null,
    artifact_type: live.artifactType ?? current?.artifact_type,
    artifact_role: live.artifactRole ?? current?.artifact_role ?? null,
    title: live.title ?? current?.title ?? null,
    content_text: live.contentText ?? current?.content_text ?? null,
    content_json: live.contentJson ?? current?.content_json ?? null,
    asset_data: live.assetData ?? current?.asset_data ?? null,
    channel_id: live.channelId ?? current?.channel_id ?? null,
    language_id: live.languageId ?? current?.language_id ?? null,
    current_version: liveVersion || currentVersion,
    updated_at: live.updatedAt ?? current?.updated_at ?? null,
  }
}
