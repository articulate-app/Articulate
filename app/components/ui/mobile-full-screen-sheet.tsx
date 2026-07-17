"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface MobileFullScreenSheetProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  className?: string
  /** Accessible label for the full-screen panel */
  ariaLabel?: string
}

/**
 * Full-screen mobile overlay (not a partial bottom drawer). Portals to `document.body`, uses
 * dynamic viewport height, and locks page scroll while open.
 */
export function MobileFullScreenSheet({
  open,
  onOpenChange,
  children,
  className,
  ariaLabel = "Panel",
}: MobileFullScreenSheetProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  React.useEffect(() => {
    if (!open || !onOpenChange) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  if (!mounted || !open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-0 z-[80] flex flex-col bg-white",
        "h-dvh min-h-dvh max-h-dvh",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}
