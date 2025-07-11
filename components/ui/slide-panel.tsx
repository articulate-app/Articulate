"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface SlidePanelProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  position?: "left" | "right" | "bottom"
}

export function SlidePanel({
  isOpen,
  onClose,
  children,
  className,
  position = "right",
}: SlidePanelProps) {
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) return null

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed z-50 bg-background transition-transform duration-300",
          position === "right" && "right-0 top-0 h-full w-[400px]",
          position === "left" && "left-0 top-0 h-full w-[400px]",
          position === "bottom" && "bottom-0 left-0 right-0 h-[80vh]",
          isOpen
            ? position === "right"
              ? "translate-x-0"
              : position === "left"
              ? "translate-x-0"
              : "translate-y-0"
            : position === "right"
            ? "translate-x-full"
            : position === "left"
            ? "-translate-x-full"
            : "translate-y-full",
          className
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  )
} 