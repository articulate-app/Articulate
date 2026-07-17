import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** Require this much extra container width before re-showing optional pills (avoids expand/collapse thrash). */
const HYSTERESIS_PX = 56

/**
 * When the toolbar row would overflow its container, collapse optional pills into the overflow menu.
 * Re-expands only when the container grows meaningfully (ResizeObserver + hysteresis), so portaled
 * calendar/kanban pills do not cause visible ↔ overflow oscillation.
 */
export function useOptionalToolbarCollapse(resetKey: string) {
  const [optionalCollapsed, setOptionalCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const measureRowRef = useRef<HTMLDivElement | null>(null)
  const widthAtCollapseRef = useRef<number | null>(null)
  const collapsedRef = useRef(optionalCollapsed)
  const rafRef = useRef<number | null>(null)

  collapsedRef.current = optionalCollapsed

  useEffect(() => {
    setOptionalCollapsed(false)
    widthAtCollapseRef.current = null
  }, [resetKey])

  // Expanded: detect overflow after layout (rAF so portaled children can settle).
  useLayoutEffect(() => {
    if (optionalCollapsed) return
    const container = containerRef.current
    const row = measureRowRef.current
    if (!container || !row) return

    const runCheck = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const c = containerRef.current
        const r = measureRowRef.current
        if (!c || !r || collapsedRef.current) return
        if (r.scrollWidth > c.clientWidth + 2) {
          widthAtCollapseRef.current = c.clientWidth
          setOptionalCollapsed(true)
        }
      })
    }

    const ro = new ResizeObserver(runCheck)
    ro.observe(row)
    ro.observe(container)
    runCheck()
    return () => {
      ro.disconnect()
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [optionalCollapsed, resetKey])

  // Collapsed: only expand when the container is wider than at collapse time + hysteresis.
  useLayoutEffect(() => {
    if (!optionalCollapsed) return
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const w = Math.round(entry.contentRect.width)
      const baseline = widthAtCollapseRef.current
      if (baseline != null && w >= baseline + HYSTERESIS_PX) {
        widthAtCollapseRef.current = null
        setOptionalCollapsed(false)
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [optionalCollapsed])

  return { optionalCollapsed, containerRef, measureRowRef }
}
