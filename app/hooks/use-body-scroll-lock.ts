"use client"

import { useEffect } from "react"

/**
 * Locks document scrolling while an overlay is open, then restores the previous overflow.
 * Does not use position:fixed or 100vh hacks, so closing the overlay does not trap scroll.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousOverscroll = body.style.overscrollBehavior
    body.style.overflow = "hidden"
    body.style.overscrollBehavior = "none"
    return () => {
      body.style.overflow = previousOverflow
      body.style.overscrollBehavior = previousOverscroll
    }
  }, [locked])
}
