"use client"

import { dispatchTasksShallowNavigation } from "./tasks-shallow-nav"

export type WorkspaceUrlState = {
  object?: string
  q?: string
  tab?: string
  entity?: string
  id?: string
  detailType?: string
  detailId?: string
  briefingTypeId?: string
  mentionsTab?: string
  stackTeamId?: string
  layout?: string
  centerTaskId?: string
  centerProjectId?: string
  centerUserId?: string
  centerTeamId?: string
  centerMentionId?: string
  centerThreadId?: string
  centerTab?: string
  rightTaskId?: string
  rightProjectId?: string
  rightView?: string
  rightThreadId?: string
  rightUserId?: string
  rightTeamId?: string
  rightMentionId?: string
  rightTab?: string
  taskAiOpen?: string
  aiThreadId?: string
  groupBy?: string
  groupOrder?: string
  mode?: string
  split?: string
  splitView?: string
  topView?: string
  bottomView?: string
  settings?: string
  settingsCategory?: string
}

export type WorkspaceUrlPatch = Record<string, string | number | boolean | null | undefined>

const KNOWN_KEYS: Array<keyof WorkspaceUrlState> = [
  "object",
  "q",
  "tab",
  "entity",
  "id",
  "detailType",
  "detailId",
  "briefingTypeId",
  "mentionsTab",
  "stackTeamId",
  "layout",
  "centerTaskId",
  "centerProjectId",
  "centerUserId",
  "centerTeamId",
  "centerMentionId",
  "centerThreadId",
  "centerTab",
  "rightTaskId",
  "rightProjectId",
  "rightView",
  "rightThreadId",
  "rightUserId",
  "rightTeamId",
  "rightMentionId",
  "rightTab",
  "taskAiOpen",
  "aiThreadId",
  "groupBy",
  "groupOrder",
  "mode",
  "split",
  "splitView",
  "topView",
  "bottomView",
  "settings",
  "settingsCategory",
]

let latestWorkspaceUrlRevision = 0

function asSearchParams(input: URLSearchParams | { toString: () => string } | string): URLSearchParams {
  if (typeof input === "string") return new URLSearchParams(input)
  return new URLSearchParams(input.toString())
}

export function parseWorkspaceUrlState(input: URLSearchParams | { toString: () => string } | string): WorkspaceUrlState {
  const params = asSearchParams(input)
  const state: WorkspaceUrlState = {}
  for (const key of KNOWN_KEYS) {
    const value = params.get(key)
    if (typeof value === "string" && value.length > 0) {
      state[key] = value
    }
  }
  return state
}

export function buildWorkspaceUrl(state: WorkspaceUrlState): string {
  const next = new URLSearchParams()
  for (const key of KNOWN_KEYS) {
    const value = state[key]
    if (typeof value === "string" && value.length > 0) next.set(key, value)
  }
  const query = next.toString()
  return query ? `/?${query}` : "/"
}

function applyPatch(params: URLSearchParams, patch: WorkspaceUrlPatch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") {
      params.delete(key)
      continue
    }
    params.set(key, String(value))
  }
}

function commitWorkspaceParams(
  params: URLSearchParams,
  options?: {
    mode?: "replace" | "push"
    expectedSearch?: string
    source?: string
  },
) {
  if (typeof window === "undefined") return false
  const currentSearch = window.location.search.startsWith("?")
    ? window.location.search.slice(1)
    : window.location.search
  if (
    typeof options?.expectedSearch === "string" &&
    options.expectedSearch !== currentSearch &&
    options.expectedSearch !== window.location.search
  ) {
    return false
  }
  const nextQuery = params.toString()
  const nextUrl = nextQuery ? `/?${nextQuery}` : "/"
  const currentUrl = `${window.location.pathname}${window.location.search}`
  if (nextUrl === currentUrl) return false

  latestWorkspaceUrlRevision += 1
  if (process.env.NODE_ENV === "development") {
    console.log("[workspace-url-write]", {
      source: options?.source ?? "workspace-url-state",
      revision: latestWorkspaceUrlRevision,
      mode: options?.mode ?? "replace",
      nextUrl,
    })
  }
  if (options?.mode === "push") {
    window.history.pushState({}, "", nextUrl)
  } else {
    window.history.replaceState({}, "", nextUrl)
  }
  dispatchTasksShallowNavigation()
  return true
}

export function mergeWorkspaceUrlState(
  patch: WorkspaceUrlPatch,
  options?: {
    mode?: "replace" | "push"
    expectedSearch?: string
    source?: string
  },
) {
  if (typeof window === "undefined") return false
  const current = new URLSearchParams(window.location.search)
  applyPatch(current, patch)
  return commitWorkspaceParams(current, options)
}

export function replaceWorkspaceUrlState(
  patch: WorkspaceUrlPatch,
  options?: {
    mode?: "replace" | "push"
    expectedSearch?: string
    source?: string
  },
) {
  if (typeof window === "undefined") return false
  const current = new URLSearchParams(window.location.search)
  for (const key of KNOWN_KEYS) {
    current.delete(key)
  }
  applyPatch(current, patch)
  return commitWorkspaceParams(current, options)
}

export function getWorkspaceUrlRevision() {
  return latestWorkspaceUrlRevision
}

export function setCenterTab(tab: string | null, options?: { mode?: "replace" | "push"; source?: string }) {
  return mergeWorkspaceUrlState(
    { centerTab: tab && tab.trim().length > 0 ? tab : null },
    { mode: options?.mode, source: options?.source ?? "setCenterTab" },
  )
}
