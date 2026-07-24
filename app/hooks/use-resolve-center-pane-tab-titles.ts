"use client"

import { useEffect, useMemo, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { resolveCenterPaneTabTitle } from "../lib/resolve-center-pane-tab-title"
import {
  isCenterPaneTabPlaceholderTitle,
  listCenterPaneTabsNeedingTitleResolution,
  useCenterPaneTabsStore,
} from "../store/center-pane-tabs"

/**
 * Background-resolve friendly labels for open middle-pane tabs that still show
 * placeholders (`User 40`, `Project 12`, …). Needed because inactive tabs do not
 * mount their detail pages, so `onResolvedTitle` never runs for them.
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
    )

    for (const tab of needing) {
      if (inFlightKeysRef.current.has(tab.key)) continue
      inFlightKeysRef.current.add(tab.key)
      const controller = new AbortController()

      void resolveCenterPaneTabTitle({
        tab,
        queryClient,
        signal: controller.signal,
      })
        .then((title) => {
          if (!title || !mountedRef.current) return
          const current = useCenterPaneTabsStore
            .getState()
            .tabs.find((entry) => entry.key === tab.key)
          if (!current) return
          if (!isCenterPaneTabPlaceholderTitle(current.title, current.kind, current.id)) {
            return
          }
          updateTitle(tab.key, title)
        })
        .catch(() => {
          // Best-effort; leave the placeholder if lookup fails.
        })
        .finally(() => {
          inFlightKeysRef.current.delete(tab.key)
        })
    }
  }, [enabled, placeholderSignature, queryClient, updateTitle])
}
