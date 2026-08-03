"use client"

import React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "../../app/lib/utils"

/** Scrollable preview body with a pinned expand/collapse control at the bottom. */
export function PreviewExpandShell({
  expanded,
  onToggleExpanded,
  children,
}: {
  expanded: boolean
  onToggleExpanded: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "ai-chat-component-edit-preview-shell max-w-full min-w-0",
        expanded && "ai-chat-component-edit-preview-shell--expanded",
      )}
    >
      <div className="ai-chat-component-edit-preview-shell-scroll max-w-full min-w-0 break-words [overflow-wrap:anywhere]">
        {children}
      </div>
      <div className="ai-chat-component-edit-preview-shell-footer flex justify-center border-t border-border/60 bg-card/95 py-0.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpanded()
          }}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse preview" : "Expand preview"}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  )
}
