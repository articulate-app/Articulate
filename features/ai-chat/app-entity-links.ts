"use client"

import {
  isTaskDetailsAiSplitMode,
  isTaskDetailsFocusContext,
} from "../../app/components/tasks/ai-pane-focus-url"
import {
  applyArtifactCenterSelectionParams,
  clearArtifactCenterSelectionParams,
} from "../../app/lib/artifact-selection-url"
import {
  applySourceCenterSelectionParams,
  clearSourceCenterSelectionParams,
} from "../../app/lib/source-selection-url"
import { clearActiveCenterSelectionParams } from "../../app/lib/center-pane-selection-url"
import type { ArtifactExportFormat } from "../../app/lib/artifacts/artifact-types"
import { buildAiAgentRunPath } from "../../app/lib/services/ai-agent-runs"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type AppEntityLink =
  | { type: "task"; id: number }
  | { type: "project"; id: number }
  | { type: "user"; id: number }
  | { type: "artifact"; id: string; version?: number | null }
  | {
      type: "artifact-download"
      id: string
      format: ArtifactExportFormat
      version?: number | null
      attachmentId?: string | null
    }
  | { type: "source"; id: string }
  | { type: "ai-agent-run"; id: string }
  /** Durable artifact build job — resolve to an artifact id before navigating. */
  | { type: "ai-build"; id: string }

function parsePositiveInt(value: string | null | undefined): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

function parseExportFormat(value: string | null | undefined): ArtifactExportFormat {
  const normalized = String(value ?? "html").trim().toLowerCase()
  if (
    normalized === "docx" ||
    normalized === "html" ||
    normalized === "md" ||
    normalized === "txt" ||
    normalized === "json" ||
    normalized === "original"
  ) {
    return normalized
  }
  if (normalized === "markdown") return "md"
  if (normalized === "word") return "docx"
  return "html"
}

export function parseAppEntityLink(href: string | null | undefined): AppEntityLink | null {
  if (!href) return null
  const trimmed = href.trim()

  const artifactDownloadMatch = trimmed.match(
    /^app:\/\/artifact\/([0-9a-f-]{36})\/download(?:\?([^#]*))?$/i,
  )
  if (artifactDownloadMatch) {
    const id = artifactDownloadMatch[1]
    if (!UUID_PATTERN.test(id)) return null
    const query = new URLSearchParams(artifactDownloadMatch[2] ?? "")
    return {
      type: "artifact-download",
      id,
      format: parseExportFormat(query.get("format")),
      version: parsePositiveInt(query.get("version")),
      attachmentId: query.get("attachment_id")?.trim() || null,
    }
  }

  const artifactMatch = trimmed.match(
    /^app:\/\/artifact\/([0-9a-f-]{36})(?:\?([^#]*))?$/i,
  )
  if (artifactMatch) {
    const id = artifactMatch[1]
    if (!UUID_PATTERN.test(id)) return null
    const query = new URLSearchParams(artifactMatch[2] ?? "")
    return {
      type: "artifact",
      id,
      version: parsePositiveInt(query.get("version")),
    }
  }

  const sourceMatch = trimmed.match(/^app:\/\/source\/([0-9a-f-]{36})$/i)
  if (sourceMatch) {
    const id = sourceMatch[1]
    if (!UUID_PATTERN.test(id)) return null
    return { type: "source", id }
  }

  const agentRunMatch = trimmed.match(/^app:\/\/ai-agent-run\/([0-9a-f-]{36})$/i)
  if (agentRunMatch) {
    const id = agentRunMatch[1]
    if (!UUID_PATTERN.test(id)) return null
    return { type: "ai-agent-run", id }
  }

  const aiBuildMatch = trimmed.match(/^app:\/\/ai-build\/([0-9a-f-]{36})$/i)
  if (aiBuildMatch) {
    const id = aiBuildMatch[1]
    if (!UUID_PATTERN.test(id)) return null
    return { type: "ai-build", id }
  }

  const match = trimmed.match(/^app:\/\/(task|project|user)\/(\d+)$/i)
  if (!match) return null
  const [, typeRaw, idRaw] = match
  const id = Number(idRaw)
  if (!Number.isFinite(id) || id <= 0) return null
  const type = typeRaw.toLowerCase() as "task" | "project" | "user"
  return { type, id }
}

export function isTasksShellPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/tasks") ||
    pathname.startsWith("/artifacts") ||
    pathname.startsWith("/sources")
  )
}

export function getResolvedTaskIdFromSearchParams(params: URLSearchParams): number | null {
  for (const key of ["centerTaskId", "id", "rightTaskId"] as const) {
    const raw = params.get(key)
    if (!raw) continue
    const id = Number(raw)
    if (Number.isFinite(id) && id > 0) return id
  }
  return null
}

function isAiChatPaneOpen(params: URLSearchParams): boolean {
  // AI may live in either workspace pane — thread identity is not pane-bound.
  if (params.get("centerView") === "ai") return true
  return params.get("rightView") === "ai" && params.get("taskAiOpen") === "true"
}

function ensureRightPaneDetailsLayout(params: URLSearchParams) {
  const currentLayout = (params.get("layout") || "left,middle")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (!currentLayout.includes("right")) currentLayout.push("right")
  params.set("layout", currentLayout.join(","))
  params.set("rightView", "details")
  params.delete("focus")
}

function ensureRightPaneInLayout(params: URLSearchParams) {
  const currentLayout = (params.get("layout") || "left,middle")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (!currentLayout.includes("right")) currentLayout.push("right")
  params.set("layout", currentLayout.join(","))
}

/** Ensure the center (artifact/source) pane is visible without collapsing other panes. */
function ensureMiddlePaneInLayout(params: URLSearchParams) {
  const currentLayout = (params.get("layout") || "left,middle")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (currentLayout.includes("middle")) {
    params.set("layout", currentLayout.join(","))
    return
  }
  // Solo-right (AI focus) → open middle beside AI.
  if (currentLayout.length === 1 && currentLayout[0] === "right") {
    params.set("layout", "middle,right")
    return
  }
  currentLayout.push("middle")
  params.set("layout", currentLayout.join(","))
}

/** Navigate to a task from AI chat without closing the AI pane or reopening the task list. */
export function applyAiChatTaskLinkNavigation(
  params: URLSearchParams,
  taskId: number,
): URLSearchParams | null {
  const currentTaskId = getResolvedTaskIdFromSearchParams(params)
  if (currentTaskId === taskId) return null

  const next = new URLSearchParams(params.toString())
  next.set("centerTaskId", String(taskId))
  next.delete("id")
  next.delete("rightTaskId")
  next.delete("itemKind")
  next.delete("centerSuggestionId")
  clearArtifactCenterSelectionParams(next)
  clearSourceCenterSelectionParams(next)

  next.set("rightView", "ai")
  next.set("taskAiOpen", "true")

  if (isTaskDetailsAiSplitMode(next) || (isTaskDetailsFocusContext(next) && next.get("layout") === "right")) {
    next.set("layout", "right")
    next.set("focus", "right")
  } else if (isTaskDetailsFocusContext(next)) {
    next.set("focus", "right")
    ensureRightPaneInLayout(next)
  } else {
    ensureRightPaneInLayout(next)
  }

  return next
}

function applyArtifactCenterNavigation(
  params: URLSearchParams,
  artifactId: string,
  version?: number | null,
  fromAiChat = false,
): URLSearchParams {
  const next = new URLSearchParams(params.toString())
  clearActiveCenterSelectionParams(next)
  next.delete("stackTeamId")
  applyArtifactCenterSelectionParams(next, { artifactId, version })
  // Open the artifact in middle; never collapse left/right into solo-right AI.
  ensureMiddlePaneInLayout(next)
  next.delete("aiFocus")
  if (fromAiChat && isAiChatPaneOpen(params)) {
    next.set("rightView", "ai")
    next.set("taskAiOpen", "true")
    ensureRightPaneInLayout(next)
  }
  return next
}

function applySourceCenterNavigation(
  params: URLSearchParams,
  sourceId: string,
  fromAiChat = false,
): URLSearchParams {
  const next = new URLSearchParams(params.toString())
  clearActiveCenterSelectionParams(next)
  next.delete("stackTeamId")
  applySourceCenterSelectionParams(next, { sourceId })
  ensureMiddlePaneInLayout(next)
  next.delete("aiFocus")
  if (fromAiChat && isAiChatPaneOpen(params)) {
    next.set("rightView", "ai")
    next.set("taskAiOpen", "true")
    ensureRightPaneInLayout(next)
  }
  return next
}

function buildTasksShellUrl(pathname: string, params: URLSearchParams): string {
  if (
    isTasksShellPath(pathname) &&
    !pathname.startsWith("/artifacts") &&
    !pathname.startsWith("/sources")
  ) {
    return `${pathname}?${params.toString()}`
  }
  return `/?${params.toString()}`
}

export function buildNextUrlForEntityLink(args: {
  currentPathname: string
  currentSearchParams: URLSearchParams
  parsedLink: AppEntityLink
  /** When true, preserve AI pane state and avoid switching rightView to details. */
  fromAiChat?: boolean
}): string | null {
  const { currentPathname, currentSearchParams, parsedLink, fromAiChat = false } = args
  const isTasksRoute = isTasksShellPath(currentPathname)

  if (parsedLink.type === "artifact-download") {
    // Download is a side effect — callers must handle it and not navigate.
    return null
  }

  if (parsedLink.type === "ai-agent-run") {
    return buildAiAgentRunPath(parsedLink.id)
  }

  if (parsedLink.type === "artifact") {
    const nextParams = applyArtifactCenterNavigation(
      currentSearchParams,
      parsedLink.id,
      parsedLink.version,
      fromAiChat,
    )
    return buildTasksShellUrl(currentPathname, nextParams)
  }

  if (parsedLink.type === "source") {
    const nextParams = applySourceCenterNavigation(
      currentSearchParams,
      parsedLink.id,
      fromAiChat,
    )
    return buildTasksShellUrl(currentPathname, nextParams)
  }

  if (parsedLink.type === "task") {
    if (fromAiChat && isAiChatPaneOpen(currentSearchParams)) {
      const nextParams = applyAiChatTaskLinkNavigation(currentSearchParams, parsedLink.id)
      if (!nextParams) return null
      return buildTasksShellUrl(currentPathname, nextParams)
    }

    const params = new URLSearchParams(currentSearchParams.toString())
    params.set("id", String(parsedLink.id))
    clearArtifactCenterSelectionParams(params)
    clearSourceCenterSelectionParams(params)
    ensureRightPaneDetailsLayout(params)
    return buildTasksShellUrl(currentPathname, params)
  }

  if (parsedLink.type === "project") {
    if (isTasksRoute) {
      const params = new URLSearchParams(currentSearchParams.toString())
      params.set("project", String(parsedLink.id))
      params.set("projectId", String(parsedLink.id))
      const shellBase =
        currentPathname.startsWith("/artifacts") || currentPathname.startsWith("/sources")
          ? "/"
          : currentPathname
      return `${shellBase}?${params.toString()}`
    }
    return `/projects/${parsedLink.id}`
  }

  return null
}
