"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/** Floating close affordance for the mobile split bottom pane (no header row). */
export function MobileSplitPaneCloseButton({
  onClose,
  className,
}: {
  onClose: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label="Close split view"
      onClick={onClose}
      className={cn(
        "absolute right-2 top-2 z-20 rounded-full bg-background/80 p-1 text-gray-700 shadow-sm backdrop-blur hover:bg-background/95",
        className,
      )}
    >
      <X className="h-4 w-4" />
    </button>
  )
}

/** @deprecated Use `MobileSplitPaneCloseButton` — kept for call-site compatibility. */
export function MobileSplitPaneHeader({ onClose }: { onClose: () => void }) {
  return <MobileSplitPaneCloseButton onClose={onClose} />
}
