"use client"

import { ensureAiThread, ensureProjectThread } from "../ai-chat/ai-utils"
import { isPersistedAiThreadId } from "../ai-chat/thread-id"
import { shallowReplaceSearchParams } from "../../app/lib/tasks-shallow-nav"
import type { SelectedArtifactContext } from "../../app/lib/artifacts/artifact-types"
import {
  computeArtifactContentHash,
  useArtifactSelectionStore,
} from "./artifact-selection"

function ensureAiPaneVisibleInUrl(preferThreadId?: string | null) {
  if (typeof window === "undefined") return
  const pathname = window.location.pathname
  const next = new URLSearchParams(window.location.search)
  const nextLayout = new Set((next.get("layout") || "left,middle").split(",").filter(Boolean))
  nextLayout.add("right")
  next.set("layout", Array.from(nextLayout).join(","))
  next.set("rightView", "ai")
  next.set("taskAiOpen", "true")

  const existingThreadId = next.get("aiThreadId")
  if (isPersistedAiThreadId(existingThreadId)) {
    // Keep the chat the user is already working in.
    shallowReplaceSearchParams(pathname, next, "artifact-selection-keep-thread")
    return
  }

  if (preferThreadId && isPersistedAiThreadId(preferThreadId)) {
    next.set("aiThreadId", preferThreadId)
  }

  shallowReplaceSearchParams(pathname, next, "artifact-selection")
}

function isAiPaneAlreadyOpen(): boolean {
  if (typeof window === "undefined") return false
  const params = new URLSearchParams(window.location.search)
  const layout = (params.get("layout") || "").split(",").filter(Boolean)
  return (
    params.get("taskAiOpen") === "true"
    || params.get("rightView") === "ai"
    || layout.includes("right")
  )
}

/** Attach an artifact selection chip in the AI composer and open the task/project AI pane. */
export async function openArtifactSelectionInAiPane(args: {
  context: SelectedArtifactContext
  taskId?: number | null
  projectId?: number | null
  channelId?: number | null
}): Promise<void> {
  useArtifactSelectionStore.getState().setPendingSelection(args.context)

  try {
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null
    const existingThreadId = params?.get("aiThreadId") ?? null

    // If the user already has a chat open (including a freshly created one),
    // attach to that tab — do not hop to the task/project default thread.
    if (isPersistedAiThreadId(existingThreadId) || isAiPaneAlreadyOpen()) {
      ensureAiPaneVisibleInUrl(existingThreadId)
      return
    }

    if (args.taskId != null && args.taskId > 0) {
      const threadId = await ensureAiThread({
        taskId: args.taskId,
        channelId: args.channelId ?? undefined,
      })
      ensureAiPaneVisibleInUrl(threadId)
      return
    }
    if (args.projectId != null && args.projectId > 0) {
      const threadId = await ensureProjectThread(args.projectId)
      ensureAiPaneVisibleInUrl(threadId)
    } else {
      ensureAiPaneVisibleInUrl(null)
    }
  } catch (error) {
    console.error("[artifact-selection] failed to open AI pane", error)
  }
}

export function buildArtifactDocumentSelection(
  artifact: {
    id: string
    title?: string | null
    current_version?: number | null
    content_text?: string | null
  },
): SelectedArtifactContext {
  const contentText = artifact.content_text ?? ""
  return {
    source_type: "task_artifact",
    artifact_id: artifact.id,
    artifact_version_number: artifact.current_version ?? 0,
    anchor_type: "document",
    title: artifact.title ?? null,
    full_content_hash: contentText ? computeArtifactContentHash(contentText) : null,
  }
}
