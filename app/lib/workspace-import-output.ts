"use client"

import { isArtifactRevisionConflictError } from "./artifacts/artifact-types"
import {
  createWorkspaceArtifact,
  saveWorkspaceArtifact,
} from "./services/artifacts"
import type { WorkspaceOutputCreateScope } from "./workspace-create-output"

export function workspaceImportErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const rec = error as { message?: unknown; details?: unknown }
    const message = typeof rec.message === "string" ? rec.message.trim() : ""
    const details = typeof rec.details === "string" ? rec.details.trim() : ""
    if (message && details && !message.includes(details)) return `${message}: ${details}`
    if (message) return message
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return fallback
}

export async function persistImportedWorkspaceOutput(args: {
  imported: {
    title: string
    text: string
    contentJson: unknown
  }
  metadata: Record<string, unknown>
  changeSummary: string
  currentUserId?: number | null
  scope?: WorkspaceOutputCreateScope | null
}): Promise<{ id: string; title: string }> {
  const created = await createWorkspaceArtifact({
    title: args.imported.title,
    taskId: args.scope?.taskId ?? null,
    projectId: args.scope?.projectId ?? null,
    aiThreadId: args.scope?.aiThreadId ?? null,
    metadata: args.metadata,
  })
  const saved = await saveWorkspaceArtifact({
    artifactId: created.id,
    expectedVersion: created.current_version ?? 0,
    snapshot: {
      title: args.imported.title,
      content_text: args.imported.text,
      content_json: args.imported.contentJson,
      metadata: args.metadata,
    },
    changeSource: "manual",
    changedBy: args.currentUserId ?? null,
    changeSummary: args.changeSummary,
  })
  if (isArtifactRevisionConflictError(saved)) {
    throw new Error(saved.message || "Failed to save imported document")
  }
  return { id: created.id, title: args.imported.title }
}
