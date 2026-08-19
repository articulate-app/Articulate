"use client"

/**
 * Transparent host that owns the Browser pane rectangle for Electron WebContentsView.
 * Does not render page content — only reports geometry to the desktop bridge.
 */

import { useEffect, useRef, useState } from "react"
import {
  getArticulateDesktop,
  type DesktopBrowserBounds,
} from "../../app/lib/articulate-desktop"
import {
  isBrowserSurfaceOverlayActive,
  subscribeBrowserSurfaceOverlay,
} from "../../app/lib/browser-surface-overlay"
import { isDesktopBrowserSurfaceOwner } from "../../app/lib/desktop-browser-surface-owner"

type DesktopBrowserHostProps = {
  browserId: string
  /** When false, Electron hides the native view (tab inactive / unmounted). */
  active?: boolean
  ownerId?: string | null
  ownsSurface?: boolean
  className?: string
  onBoundsChange?: (bounds: DesktopBrowserBounds) => void
}

function readBounds(el: HTMLElement, visible: boolean): DesktopBrowserBounds {
  const rect = el.getBoundingClientRect()
  // getBoundingClientRect is CSS px relative to the viewport.
  // Electron WebContentsView.setBounds uses DIP relative to the window content area.
  // With a standard BrowserWindow frame, those spaces align (no DPR multiply).
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    visible: visible && rect.width >= 1 && rect.height >= 1,
  }
}

export function DesktopBrowserHost({
  browserId,
  active = true,
  ownerId = null,
  ownsSurface = true,
  className,
  onBoundsChange,
}: DesktopBrowserHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const lastSentRef = useRef<string>("")
  const rafRef = useRef<number | null>(null)
  const [overlayActive, setOverlayActive] = useState(isBrowserSurfaceOverlayActive)

  useEffect(() => subscribeBrowserSurfaceOverlay(() => {
    setOverlayActive(isBrowserSurfaceOverlayActive())
  }), [])

  const surfaceVisible = active && !overlayActive && ownsSurface

  useEffect(() => {
    const desktop = getArticulateDesktop()
    const host = hostRef.current
    if (!desktop || !host || !browserId) return

    const publish = () => {
      rafRef.current = null
      const el = hostRef.current
      if (!el) return
      const bounds = readBounds(el, surfaceVisible)
      const key = `${bounds.x}|${bounds.y}|${bounds.width}|${bounds.height}|${bounds.visible}`
      if (key === lastSentRef.current) return
      lastSentRef.current = key
      onBoundsChange?.(bounds)
      void desktop.browser.setBounds(browserId, bounds)
    }

    const schedule = () => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(publish)
    }

    publish()

    const observer = new ResizeObserver(() => schedule())
    observer.observe(host)

    // Pane dividers / layout shifts can move the host without resizing it.
    window.addEventListener("resize", schedule)
    // Capture scroll on ancestors that may offset the pane.
    window.addEventListener("scroll", schedule, true)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", schedule)
      window.removeEventListener("scroll", schedule, true)
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastSentRef.current = ""
      if (ownerId && !isDesktopBrowserSurfaceOwner(browserId, ownerId)) return
      if (!ownsSurface) return
      void desktop.browser.setBounds(browserId, {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        visible: false,
      })
    }
  }, [surfaceVisible, browserId, ownerId, ownsSurface, onBoundsChange])

  useEffect(() => {
    if (surfaceVisible) return
    if (ownerId && !isDesktopBrowserSurfaceOwner(browserId, ownerId)) return
    if (!ownsSurface) return
    const desktop = getArticulateDesktop()
    if (!desktop || !browserId) return
    void desktop.browser.setBounds(browserId, {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      visible: false,
    })
    lastSentRef.current = ""
  }, [surfaceVisible, browserId, ownerId, ownsSurface])

  return (
    <div
      ref={hostRef}
      className={className}
      data-articulate-desktop-browser-host={browserId}
      // Transparent placeholder — Chromium WebContentsView paints above this.
      // pointer-events:none so any sub-pixel gap does not steal scroll/gesture from Chromium.
      style={{ background: "transparent", pointerEvents: "none" }}
      aria-hidden
    />
  )
}
