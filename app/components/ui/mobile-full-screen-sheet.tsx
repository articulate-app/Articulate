"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { useBodyScrollLock } from "../../hooks/use-body-scroll-lock"
import { MobileAppHeader } from "./mobile-app-header"

interface MobileFullScreenSheetProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  className?: string
  /** Accessible label for the full-screen panel */
  ariaLabel?: string
  /** Optional title shown in the shared mobile chrome. */
  title?: React.ReactNode
  /** When false, the sheet is a raw overlay (caller supplies chrome). Default true. */
  showAppHeader?: boolean
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
  title,
  showAppHeader = true,
}: MobileFullScreenSheetProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  useBodyScrollLock(open)

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
        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      {showAppHeader ? (
        <MobileAppHeader
          onBack={onOpenChange ? () => onOpenChange(false) : undefined}
          title={title ?? ariaLabel}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>,
    document.body,
  )
}
