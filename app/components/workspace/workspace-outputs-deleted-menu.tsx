"use client"

import { MoreHorizontal } from "lucide-react"
import { useArtifactDeletedStore } from "../../store/artifact-deleted-store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"

/** Outputs list ⋯ — restore / permanently delete lives here, not on a single output. */
export function WorkspaceOutputsDeletedMenu() {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          aria-label="Outputs options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem
          onSelect={() => useArtifactDeletedStore.getState().open({})}
        >
          Deleted
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
