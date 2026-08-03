"use client"

import { useEffect, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  resolveCenterPaneTabTitle,
  resolveCenterPaneTabTitlesBatch,
} from "../lib/resolve-center-pane-tab-title"
import {
  isCenterPaneTabPlaceholderTitle,
  listCenterPaneTabsNeedingTitleResolution,
  useCenterPaneTabsStore,
} from "../store/center-pane-tabs"

/**
 * Background-resolve friendly labels for open middle-pane tabs that still show
 * placeholders (`User 40`, `Project 12`, …). Needed because inactive tabs do not
 * mount their detail pages, so `onResolvedTitle` never runs for them.
 *
 * Task/suggestion tabs are resolved in one batched request; other kinds resolve
 * individually (different tables / services).
 */
export function useResolveCenterPaneTabTitles(enabled = true) {
  const queryClient = useQueryClient()
  const tabs = useCenterPaneTabsStore((state) => state.tabs)
  const updateTitle = useCenterPaneTabsStore((state) => state.updateTitle)
  const inFlightKeysRef = useRef(new Set<string>())
  const mountedRef = useRef(true)

  const placeholderSignature = useMemo(
    () =>
      listCenterPaneTabsNeedingTitleResolution(tabs)
        .map((tab) => tab.key)
        .sort()
        .join("|"),
    [tabs],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled || !placeholderSignature) return

    const needing = listCenterPaneTabsNeedingTitleResolution(
      useCenterPaneTabsStore.getState().tabs,
    ).filter((tab) => !inFlightKeysRef.current.has(tab.key))

    if (needing.length === 0) return

    for (const tab of needing) {
      inFlightKeysRef.current.add(tab.key)
    }

    const controller = new AbortController()
    const batchKinds = needing.filter(
      (tab) => tab.kind === "task" || tab.kind === "suggestion",
    )
    const otherKinds = needing.filter(
      (tab) => tab.kind !== "task" && tab.kind !== "suggestion",
    )

    const applyTitle = (tabKey: string, tabKind: (typeof needing)[number]["kind"], tabId: string, title: string | null) => {
      if (!title || !mountedRef.current) return
      const current = useCenterPaneTabsStore
        .getState()
        .tabs.find((entry) => entry.key === tabKey)
      if (!current) return
      if (!isCenterPaneTabPlaceholderTitle(current.title, tabKind, tabId)) {
        return
      }
      updateTitle(tabKey, title)
    }

    const release = (keys: string[]) => {
      for (const key of keys) inFlightKeysRef.current.delete(key)
    }

    if (batchKinds.length > 0) {
      void resolveCenterPaneTabTitlesBatch({
        tabs: batchKinds,
        queryClient,
        signal: controller.signal,
      })
        .then((titlesByKey) => {
          for (const tab of batchKinds) {
            applyTitle(tab.key, tab.kind, tab.id, titlesByKey.get(tab.key) ?? null)
          }
        })
        .catch(() => {
          // Best-effort; leave placeholders if lookup fails.
        })
        .finally(() => {
          release(batchKinds.map((tab) => tab.key))
        })
    }

    for (const tab of otherKinds) {
      void resolveCenterPaneTabTitle({
        tab,
        queryClient,
        signal: controller.signal,
      })
        .then((title) => {
          applyTitle(tab.key, tab.kind, tab.id, title)
        })
        .catch(() => {
          // Best-effort; leave the placeholder if lookup fails.
        })
        .finally(() => {
          inFlightKeysRef.current.delete(tab.key)
        })
    }

    return () => {
      controller.abort()
    }
  }, [enabled, placeholderSignature, queryClient, updateTitle])
}
