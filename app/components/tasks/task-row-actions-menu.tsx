"use client"

import * as React from "react"
import { FolderInput, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  currentTitle?: string | null
  onRename: (title: string) => void
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
  currentTitle = "",
  onRename,
  onChangeProject,
  onDelete,
}: TaskRowActionsMenuProps) {
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [projectOpen, setProjectOpen] = React.useState(false)
  const [renameDraft, setRenameDraft] = React.useState(currentTitle || "")
  const [projectDraft, setProjectDraft] = React.useState(
    currentProjectId == null ? "" : String(currentProjectId),
  )

  React.useEffect(() => {
    if (!renameOpen) return
    setRenameDraft(currentTitle || "")
  }, [currentTitle, renameOpen])

  React.useEffect(() => {
    if (!projectOpen) return
    setProjectDraft(currentProjectId == null ? "" : String(currentProjectId))
  }, [currentProjectId, projectOpen])

  if (disabled) return null

  return (
    <>
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
              setRenameOpen(true)
            }}
          >
            <Pencil className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
            Edit name
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={() => {
              setProjectOpen(true)
            }}
          >
            <FolderInput className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
            Edit project
          </DropdownMenuItem>
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

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogTitle>Edit task name</DialogTitle>
          <div className="py-2">
            <input
              type="text"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-300"
              placeholder="Task name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const nextTitle = renameDraft.trim()
                if (!nextTitle) return
                onRename(nextTitle)
                setRenameOpen(false)
              }}
              disabled={!renameDraft.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
        <DialogContent>
          <DialogTitle>Edit project</DialogTitle>
          <div className="py-2">
            <select
              value={projectDraft}
              onChange={(event) => setProjectDraft(event.target.value)}
              className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-300"
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={String(project.id)} value={String(project.id)}>
                  {project.label}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProjectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChangeProject(projectDraft)
                setProjectOpen(false)
              }}
              disabled={projectDraft === (currentProjectId == null ? "" : String(currentProjectId))}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
