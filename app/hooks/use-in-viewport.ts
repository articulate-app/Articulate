"use client"

import { useEffect, useRef, useState } from "react"

type UseInViewportOptions = {
  /** Preload before the element enters the viewport (CSS margin syntax). */
  rootMargin?: string
  threshold?: number
  /** When false, the observer is not attached and `isInViewport` stays false. */
  enabled?: boolean
}

/**
 * Returns true once the ref element intersects the viewport (or rootMargin).
 * Disconnects after first intersection so preview data loads only once per mount.
 */
export function useInViewport(options?: UseInViewportOptions) {
  const { rootMargin = "200px 0px", threshold = 0, enabled = true } = options ?? {}
  const ref = useRef<HTMLDivElement | null>(null)
  const [isInViewport, setIsInViewport] = useState(false)

  useEffect(() => {
    if (!enabled || isInViewport) return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInViewport(true)
          observer.disconnect()
        }
      },
      { root: null, threshold, rootMargin },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, isInViewport, rootMargin, threshold])

  return { ref, isInViewport }
}
