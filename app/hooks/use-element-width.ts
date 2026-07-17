"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Measure an element's content-box width with a `ResizeObserver`, returning a callback ref to attach
 * to the element and the latest measured width (rounded to whole pixels).
 *
 * Notes:
 * - Uses a callback ref so it re-observes if the node changes (e.g. conditional rendering / remounts).
 * - Guards `setState` with a previous-value check and integer rounding so sub-pixel jitter never
 *   triggers extra renders or update loops.
 * - Returns `null` until the first measurement, so callers can pick a safe fallback (e.g. a compact
 *   layout) before the real width is known and avoid layout flicker.
 */
export function useElementWidth<T extends HTMLElement = HTMLElement>(): {
  ref: (node: T | null) => void
  width: number | null
} {
  const [width, setWidth] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const nodeRef = useRef<T | null>(null)

  const measure = useCallback((node: T) => {
    const next = Math.round(node.clientWidth)
    setWidth((prev) => (prev === next ? prev : next))
  }, [])

  const ref = useCallback(
    (node: T | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      nodeRef.current = node
      if (!node || typeof ResizeObserver === "undefined") return
      measure(node)
      const observer = new ResizeObserver(() => {
        if (nodeRef.current) measure(nodeRef.current)
      })
      observer.observe(node)
      observerRef.current = observer
    },
    [measure],
  )

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [])

  return { ref, width }
}
