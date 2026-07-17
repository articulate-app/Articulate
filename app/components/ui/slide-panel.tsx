"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

export interface SlidePanelProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  /** Optional class for the content wrapper (e.g. flex flex-col for pinned footer layout). */
  contentClassName?: string
  position?: "left" | "right" | "bottom"
  title?: string
  hasOverlay?: boolean
  /** Tailwind classes merged onto the backdrop (e.g. higher z-index when nested in shell panes). */
  overlayClassName?: string
  /** When position is "bottom", height of the sheet (e.g. "70vh"). Default "45vh". */
  bottomSheetHeight?: string
}

const SWIPE_CLOSE_THRESHOLD_PX = 80

export function SlidePanel({
  isOpen,
  onClose,
  children,
  className,
  contentClassName,
  position = "right",
  title,
  hasOverlay = true,
  bottomSheetHeight = "45vh",
  overlayClassName,
}: SlidePanelProps) {
  const [isMounted, setIsMounted] = React.useState(false)
  const touchStartY = React.useRef<number | null>(null)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = React.useCallback(
    (e: React.TouchEvent) => {
      if (position !== "bottom" || touchStartY.current === null) return
      const currentY = e.touches[0].clientY
      const deltaY = currentY - touchStartY.current
      if (deltaY > SWIPE_CLOSE_THRESHOLD_PX) {
        touchStartY.current = null
        onClose()
      }
    },
    [position, onClose]
  )

  const handleTouchEnd = React.useCallback(() => {
    touchStartY.current = null
  }, [])

  if (!isMounted) return null

  return (
    <>
      {/* Overlay */}
      {isOpen && hasOverlay && (
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity",
            overlayClassName,
          )}
          onClick={onClose}
        />
      )}

      {/* Panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 bg-background transition-transform duration-300",
            position === "right" && "right-0 top-0 bottom-0 w-[400px]",
            position === "left" && "left-0 top-0 bottom-0 w-[400px]",
            position === "bottom" && "bottom-0 left-0 right-0 max-h-[90vh] rounded-t-xl slide-up",
            "translate-x-0",
            className,
          )}
          style={
            position === "bottom"
              ? { height: bottomSheetHeight, maxHeight: "90vh" }
              : undefined
          }
        >
          <div className="flex h-full flex-col">
            {/* Header: drag handle (bottom sheet) + title + close; swipe-down on header closes */}
            <div
              className="flex h-14 shrink-0 flex-col justify-center border-b px-4"
              {...(position === "bottom" && {
                onTouchStart: handleTouchStart,
                onTouchMove: handleTouchMove,
                onTouchEnd: handleTouchEnd,
              })}
            >
              {position === "bottom" && (
                <div
                  className="absolute left-1/2 top-2 -translate-x-1/2 w-10 h-1 rounded-full bg-muted-foreground/30"
                  aria-hidden
                />
              )}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold truncate">{title}</h2>
                <button
                  onClick={onClose}
                  className="ml-2 rounded-full p-1 hover:bg-accent"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Content: safe area inset for bottom sheet on notched devices */}
            <div
              className={cn("flex-1 min-h-0 overflow-y-auto p-4", contentClassName)}
              style={
                position === "bottom"
                  ? { paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }
                  : undefined
              }
            >
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  )
} 