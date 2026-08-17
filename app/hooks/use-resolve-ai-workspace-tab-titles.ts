"use client"

import { useEffect, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { isPlaceholderAiThreadTitle } from "../../features/ai-chat/ai-thread-title"
import { useCurrentUserStore } from "../store/current-user"
import {
  buildCenterPaneTabKey,
  isCenterPaneTabPlaceholderTitle,
  useCenterPaneTabsStore,
} from "../store/center-pane-tabs"
import {
  buildLeftPaneTabKey,
  isLeftPaneTabPlaceholderTitle,
  useLeftPaneTabsStore,
} from "../store/left-pane-tabs"
import { AI_WORKSPACE_TAB_ID } from "../lib/workspace-view"

type PendingAiWorkspaceTab = {
  id: string
  leftKeys: string[]
  centerKeys: string[]
}

function resolveAiThreadTitle(rawTitle: string | null | undefined): string | null {
  const trimmed = typeof rawTitle === "string" ? rawTitle.trim() : ""
  if (!trimmed || isPlaceholderAiThreadTitle(trimmed)) return null
  return trimmed
}

function readCachedAiThreadTitles(
  queryClient: ReturnType<typeof useQueryClient>,
  ids: string[],
): Map<string, string> {
  const wantedIds = new Set(ids)
  const resolved = new Map<string, string>()
  const cachedLists = queryClient.getQueriesData<Array<{ id?: string | null; title?: string | null }>>({
    queryKey: ["ai-threads"],
  })

  for (const [, threads] of cachedLists) {
    for (const thread of threads ?? []) {
      const id = typeof thread?.id === "string" ? thread.id.trim() : ""
      if (!id || !wantedIds.has(id) || resolved.has(id)) continue
      const title = resolveAiThreadTitle(thread?.title)
      if (title) resolved.set(id, title)
    }
  }

  return resolved
}

async function fetchAiThreadTitlesByIds(args: {
  ids: string[]
  signal: AbortSignal
}): Promise<Map<string, string>> {
  if (args.ids.length === 0 || args.signal.aborted) return new Map()

  const supabase = getSupabaseBrowser()
  const { data, error } = await supabase
    .from("v_ai_threads_visible")
    .select("id, title")
    .in("id", args.ids)
    .abortSignal(args.signal)

  if (error || args.signal.aborted) return new Map()

  const resolved = new Map<string, string>()
  for (const row of data ?? []) {
    const id = typeof row?.id === "string" ? row.id.trim() : ""
    const title = resolveAiThreadTitle(typeof row?.title === "string" ? row.title : null)
    if (!id || !title) continue
    resolved.set(id, title)
  }
  return resolved
}

export function useResolveAiWorkspaceTabTitles(enabled = true) {
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((state) => state.publicUserId)
  const leftTabs = useLeftPaneTabsStore((state) => state.tabs)
  const centerTabs = useCenterPaneTabsStore((state) => state.tabs)
  const updateLeftTitle = useLeftPaneTabsStore((state) => state.updateTitle)
  const updateCenterTitle = useCenterPaneTabsStore((state) => state.updateTitle)
  const inFlightIdsRef = useRef(new Set<string>())
  const mountedRef = useRef(true)

  const pendingTabs = useMemo<PendingAiWorkspaceTab[]>(() => {
    const byId = new Map<string, PendingAiWorkspaceTab>()

    for (const tab of leftTabs) {
      if (tab.kind !== "ai" || tab.id === AI_WORKSPACE_TAB_ID) continue
      if (!isLeftPaneTabPlaceholderTitle(tab.title, tab.kind, tab.id)) continue
      const existing = byId.get(tab.id) ?? { id: tab.id, leftKeys: [], centerKeys: [] }
      existing.leftKeys.push(tab.key)
      byId.set(tab.id, existing)
    }

    for (const tab of centerTabs) {
      if (tab.kind !== "ai" || tab.id === AI_WORKSPACE_TAB_ID) continue
      if (!isCenterPaneTabPlaceholderTitle(tab.title, tab.kind, tab.id)) continue
      const existing = byId.get(tab.id) ?? { id: tab.id, leftKeys: [], centerKeys: [] }
      existing.centerKeys.push(tab.key)
      byId.set(tab.id, existing)
    }

    return Array.from(byId.values())
  }, [centerTabs, leftTabs])

  const pendingSignature = useMemo(
    () => pendingTabs.map((tab) => tab.id).sort().join("|"),
    [pendingTabs],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || publicUserId == null || !pendingSignature) return

    const pending = pendingTabs.filter((tab) => !inFlightIdsRef.current.has(tab.id))
    if (pending.length === 0) return

    for (const tab of pending) {
      inFlightIdsRef.current.add(tab.id)
    }

    const controller = new AbortController()
    const applyTitle = (threadId: string, title: string | null) => {
      if (!title || !mountedRef.current) return

      const pendingEntry = pending.find((tab) => tab.id === threadId)
      if (!pendingEntry) return

      const leftState = useLeftPaneTabsStore.getState()
      for (const key of pendingEntry.leftKeys) {
        const current = leftState.tabs.find((tab) => tab.key === key)
        if (!current || !isLeftPaneTabPlaceholderTitle(current.title, current.kind, current.id)) continue
        updateLeftTitle(buildLeftPaneTabKey("ai", threadId), title)
        break
      }

      const centerState = useCenterPaneTabsStore.getState()
      for (const key of pendingEntry.centerKeys) {
        const current = centerState.tabs.find((tab) => tab.key === key)
        if (!current || !isCenterPaneTabPlaceholderTitle(current.title, current.kind, current.id)) continue
        updateCenterTitle(buildCenterPaneTabKey("ai", threadId), title)
        break
      }
    }

    const release = () => {
      for (const tab of pending) {
        inFlightIdsRef.current.delete(tab.id)
      }
    }

    const ids = pending.map((tab) => tab.id)
    const cachedTitles = readCachedAiThreadTitles(queryClient, ids)
    const unresolvedIds = ids.filter((id) => !cachedTitles.has(id))

    for (const [threadId, title] of cachedTitles.entries()) {
      applyTitle(threadId, title)
    }

    if (unresolvedIds.length === 0) {
      release()
      return
    }

    void fetchAiThreadTitlesByIds({ ids: unresolvedIds, signal: controller.signal })
      .then((titlesById) => {
        for (const [threadId, title] of titlesById.entries()) {
          applyTitle(threadId, title)
        }
      })
      .catch(() => {
        // Best-effort only. Leave placeholder labels when lookup fails.
      })
      .finally(() => {
        release()
      })

    return () => {
      controller.abort()
    }
  }, [enabled, pendingSignature, pendingTabs, publicUserId, queryClient, updateCenterTitle, updateLeftTitle])
}
