"use client"

import * as React from "react"
import { DropdownMenu, DropdownMenuContent } from "../ui/dropdown-menu"

/** Hosts desktop overflow menu fragments (DropdownMenuSub trees) inside the mobile options drawer. */
export function MobileSplitOverflowHost({ children }: { children: React.ReactNode }) {
  if (!children) {
    return <div className="px-4 py-6 text-center text-sm text-gray-400">Not available yet</div>
  }

  return (
    <DropdownMenu open modal={false}>
      <DropdownMenuContent
        className="relative w-[calc(100vw-2rem)] max-w-none border-0 bg-transparent p-1 shadow-none"
        side="bottom"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Picks one top-level overflow menu node by index (Navigate=0, Zoom=1 on calendar; Group=0, Sort=1 on kanban). */
export function pickOverflowMenuChild(content: React.ReactNode, index: number): React.ReactNode {
  if (content == null) return null
  const nodes = React.Children.toArray(content)
  return nodes[index] ?? null
}
