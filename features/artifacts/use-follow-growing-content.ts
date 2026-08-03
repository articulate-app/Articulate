"use client"

import { useEffect, useRef, type RefObject } from "react"

const NEAR_BOTTOM_PX = 96

function isNearBottom(element: HTMLElement, threshold = NEAR_BOTTOM_PX): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold
}

/**
 * While `enabled`, keep a scroll container pinned to the bottom as content grows
 * (live AI artifact / chat preview). Manual scroll-away pauses follow until the
 * user returns near the bottom.
 */
export function useFollowGrowingContent(args: {
  containerRef: RefObject<HTMLElement | null>
  /** Any value that changes when content length/shape changes. */
  contentKey: string | number | null | undefined
  enabled: boolean
}) {
  const { containerRef, contentKey, enabled } = args
  const followingRef = useRef(true)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    const onScroll = () => {
      followingRef.current = isNearBottom(container)
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    followingRef.current = true
    return () => container.removeEventListener("scroll", onScroll)
  }, [containerRef, enabled])

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return
    if (!followingRef.current && !isNearBottom(container)) return

    followingRef.current = true
    // Double rAF: wait for TipTap/layout to apply the new HTML height.
    const outer = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = containerRef.current
        if (!el || !followingRef.current) return
        el.scrollTop = el.scrollHeight
      })
    })
    return () => window.cancelAnimationFrame(outer)
  }, [containerRef, contentKey, enabled])
}
