"use client"

/**
 * Outputs directory row: title + project + created + ⋯ (rename / delete).
 */

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { cn, formatCompactDateDisplay } from "@/lib/utils"
import type { GlobalSearchDocument } from "../../lib/global-search-types"
import { isArtifactRevisionConflictError } from "../../lib/artifacts/artifact-types"
import { buildCenterPaneTabKey, useCenterPaneTabsStore } from "../../store/center-pane-tabs"
import {
  deleteArtifact,
  getArtifact,
  saveWorkspaceArtifact,
} from "../../lib/services/artifacts"
import {
  applyArtifactCachePatch,
  forgetDeletedArtifact,
} from "../../../features/artifacts/artifact-query-cache"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"

function resolveTitle(item: GlobalSearchDocument): string {
  return item.display_payload?.title?.trim() || item.title?.trim() || "Untitled"
}

export type ArtifactDirectoryResultRowProps = {
  item: GlobalSearchDocument
  onSelect: (item: GlobalSearchDocument) => void
  projectLabelOverride?: string | null
  createdAtOverride?: string | null
  isSelected?: boolean
  denseInset?: boolean
}

export function ArtifactDirectoryResultRow({
  item,
  onSelect,
  projectLabelOverride = null,
  createdAtOverride = null,
  isSelected = false,
  denseInset = false,
}: ArtifactDirectoryResultRowProps) {
  const queryClient = useQueryClient()
  const closeCenterTab = useCenterPaneTabsStore((s) => s.closeTab)
  const updateCenterTabTitle = useCenterPaneTabsStore((s) => s.updateTitle)
  const artifactId = String(item.entity_id ?? "").trim()
  const [renamedTitle, setRenamedTitle] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const title = renamedTitle ?? resolveTitle(item)
  const [renameDraft, setRenameDraft] = useState(title)

  useEffect(() => {
    setRenamedTitle(null)
  }, [artifactId])

  const projectLabel =
    (typeof projectLabelOverride === "string" && projectLabelOverride.trim()) ||
    item.display_payload?.left?.label?.trim() ||
    (typeof item.raw?.project_name === "string" ? item.raw.project_name.trim() : "") ||
    "—"
  const createdLabel =
    formatCompactDateDisplay(
      (typeof createdAtOverride === "string" && createdAtOverride.trim()) ||
        item.created_at ||
        (typeof item.raw?.created_at === "string" ? item.raw.created_at : null),
    ) || "—"

  const invalidateLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["global-search"] }),
      queryClient.invalidateQueries({ queryKey: ["artifact-directory-meta"] }),
      queryClient.invalidateQueries({ queryKey: ["task-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["project-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["artifact"] }),
    ])
  }

  const handleRename = async (nextTitle: string) => {
    const trimmed = nextTitle.trim() || "Untitled artifact"
    if (!artifactId || isBusy || trimmed === title) return
    setIsBusy(true)
    try {
      const current = await getArtifact({ artifactId })
      const result = await saveWorkspaceArtifact({
        artifactId,
        expectedVersion: current.snapshot.current_version,
        snapshot: {
          title: trimmed,
          status: current.snapshot.status,
          content_text: current.snapshot.content_text,
          content_json: current.snapshot.content_json,
          asset_data: current.snapshot.asset_data,
        },
        changeSource: "manual",
        changeSummary: "Renamed artifact",
      })
      if (
        isArtifactRevisionConflictError(result) ||
        ("code" in result && result.code === "artifact_revision_conflict")
      ) {
        window.alert("Could not rename — a newer version exists. Reloading…")
        await invalidateLists()
        return
      }
      setRenamedTitle(trimmed)
      updateCenterTabTitle(buildCenterPaneTabKey("artifact", artifactId), trimmed)
      if ("snapshot" in result && result.snapshot) {
        applyArtifactCachePatch(queryClient, result.snapshot)
      }
      await invalidateLists()
    } catch (error) {
      console.error("Failed to rename artifact", error)
      window.alert("Could not rename this output.")
    } finally {
      setIsBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!artifactId || isBusy) return
    const confirmed = window.confirm("Delete this output? This cannot be undone from here.")
    if (!confirmed) return
    setIsBusy(true)
    try {
      await deleteArtifact({ artifactId })
      forgetDeletedArtifact(queryClient, artifactId)
      closeCenterTab(buildCenterPaneTabKey("artifact", artifactId))
      await invalidateLists()
    } catch (error) {
      console.error("Failed to delete artifact", error)
      window.alert("Could not delete this output.")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <>
      <div
        className={cn(
          "group relative flex min-h-10 w-full min-w-0 items-center gap-2 py-2",
          denseInset ? "px-1" : "px-3",
          isSelected ? "bg-gray-100" : "hover:bg-gray-50",
        )}
        aria-selected={isSelected}
      >
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="min-w-0 flex-1 truncate text-sm font-normal text-gray-900"
            title={title}
          >
            {title}
          </span>
          <span
            className="artifact-directory-col-project text-sm font-normal text-gray-500"
            title={projectLabel === "—" ? undefined : projectLabel}
          >
            {projectLabel}
          </span>
          <span className="artifact-directory-col-created text-sm font-normal text-gray-500">
            {createdLabel}
          </span>
        </button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500",
                "opacity-0 transition-opacity hover:bg-gray-200 hover:text-gray-800",
                "group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100",
              )}
              aria-label="Output options"
              onClick={(event) => event.stopPropagation()}
              disabled={isBusy}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[11rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => {
                setRenameDraft(title)
                setRenameOpen(true)
              }}
            >
              <Pencil className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-red-600 focus:text-red-600"
              onSelect={() => {
                void handleDelete()
              }}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogTitle>Rename output</DialogTitle>
          <div className="py-2">
            <input
              type="text"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-300"
              placeholder="Output name"
              autoFocus
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                const nextTitle = renameDraft.trim()
                if (!nextTitle) return
                setRenameOpen(false)
                void handleRename(nextTitle)
              }}
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
                setRenameOpen(false)
                void handleRename(nextTitle)
              }}
              disabled={!renameDraft.trim() || isBusy}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
