"use client"

import * as React from "react"
import { FolderInput, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"

export type TaskRowProjectOption = {
  id: string | number
  label: string
}

type TaskRowActionsMenuProps = {
  disabled?: boolean
  projects?: TaskRowProjectOption[]
  currentProjectId?: string | number | null
  onRename: () => void
  onChangeProject: (projectId: string) => void
  onDelete: () => void
}

/**
 * Directory-style row overflow ("…") — appears on row hover.
 */
export function TaskRowActionsMenu({
  disabled = false,
  projects = [],
  currentProjectId = null,
  onRename,
  onChangeProject,
  onDelete,
}: TaskRowActionsMenuProps) {
  if (disabled) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Task actions"
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            "text-gray-500 opacity-0 transition-opacity",
            "hover:bg-gray-200/80 hover:text-gray-800",
            "group-hover/task-row:opacity-100 data-[state=open]:bg-gray-200/80 data-[state=open]:opacity-100",
          )}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="min-w-[11rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          className="gap-2"
          onSelect={() => {
            onRename()
          }}
        >
          <Pencil className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
          Rename
        </DropdownMenuItem>
        {projects.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <FolderInput className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
              Change project
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[min(320px,50vh)] min-w-[12rem] overflow-y-auto">
              {projects.map((project) => {
                const isCurrent = String(project.id) === String(currentProjectId ?? "")
                return (
                  <DropdownMenuItem
                    key={String(project.id)}
                    disabled={isCurrent}
                    className="gap-2"
                    onSelect={() => onChangeProject(String(project.id))}
                  >
                    <span className="min-w-0 flex-1 truncate">{project.label}</span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => onChangeProject("")}
          >
            <FolderInput className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
            Change project
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-red-600 focus:text-red-600"
          onSelect={() => onDelete()}
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
