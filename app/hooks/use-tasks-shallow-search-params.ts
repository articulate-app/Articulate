"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { TASKS_SHALLOW_NAV_EVENT } from "../lib/tasks-shallow-nav"

/**
 * Returns a `URLSearchParams` that stays in sync with the address bar even when the
 * tasks UI mutates the URL via `history.replaceState` (shallow navigation) instead of
 * a Next.js soft navigation.
 *
 * WHY: `useSearchParams()` only updates on real Next.js navigations (router.push/replace).
 * Toolbars, pills, AI pane, and cross-pane "See more" actions use
 * `shallowReplaceSearchParams` (history.replaceState + TASKS_SHALLOW_NAV_EVENT) to avoid
 * `_rsc` round-trips, so consumers that read filters from the URL must subscribe to that
 * event (and `popstate`) to react. This mirrors the inline logic already used by TaskList.
 */
export function useTasksShallowSearchParams(): URLSearchParams {
  const routerParams = useSearchParams()
  const [addressSearch, setAddressSearch] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    setAddressSearch(window.location.search)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    setAddressSearch(window.location.search)
  }, [routerParams.toString()])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onAddrChange = () => setAddressSearch(window.location.search)
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, onAddrChange)
    window.addEventListener("popstate", onAddrChange)
    return () => {
      window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, onAddrChange)
      window.removeEventListener("popstate", onAddrChange)
    }
  }, [])

  return useMemo(() => {
    let raw = ""
    if (addressSearch !== null) {
      raw = addressSearch.startsWith("?") ? addressSearch.slice(1) : addressSearch
    } else if (typeof window !== "undefined") {
      const w = window.location.search
      raw = w.startsWith("?") ? w.slice(1) : w
    } else {
      raw = routerParams.toString()
    }
    return new URLSearchParams(raw)
  }, [addressSearch, routerParams.toString()])
}
