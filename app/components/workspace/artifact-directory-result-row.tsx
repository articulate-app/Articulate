"use client"

/**
 * Outputs directory row: title + project + created + ⋯ (rename / delete).
 */

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { FolderPlus, LayoutTemplate, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { cn, formatCompactDateDisplay } from "@/lib/utils"
import { AttachmentFileKindIcon } from "../../../features/ai-chat/AttachmentFileChip"
import type { AttachmentFileKind } from "../../../features/ai-chat/attachment-file-meta"
import { resolveArtifactDirectoryFileKindFromRow } from "../../lib/artifacts/artifact-file-kind"
import type { GlobalSearchDocument } from "../../lib/global-search-types"
import { isArtifactRevisionConflictError } from "../../lib/artifacts/artifact-types"
import { buildCenterPaneTabKey, useCenterPaneTabsStore } from "../../store/center-pane-tabs"
import {
  attachArtifactToProject,
  deleteArtifact,
  getArtifact,
  saveWorkspaceArtifact,
} from "../../lib/services/artifacts"
import { createProjectDesignTemplateFromArtifact } from "../../lib/services/project-brand-kit"
import { toast } from "../ui/use-toast"
import { ProjectPickDialog } from "./project-pick-dialog"
import { ProjectPickSubmenu } from "./project-pick-submenu"
import {
  applyArtifactCachePatch,
  forgetDeletedArtifact,
} from "../../../features/artifacts/artifact-query-cache"
import { Button } from "../ui/button"
import { ConfirmDialog } from "../ui/confirm-dialog"
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
  fileKindOverride?: AttachmentFileKind | null
  isSelected?: boolean
  denseInset?: boolean
}

export function ArtifactDirectoryResultRow({
  item,
  onSelect,
  projectLabelOverride = null,
  createdAtOverride = null,
  fileKindOverride = null,
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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const title = renamedTitle ?? resolveTitle(item)
  const [renameDraft, setRenameDraft] = useState(title)

  useEffect(() => {
    setRenamedTitle(null)
  }, [artifactId])

  const existingProjectId =
    (typeof item.project_id === "number" && item.project_id > 0 ? item.project_id : null)
    ?? (typeof item.raw?.project_id === "number" && item.raw.project_id > 0
      ? item.raw.project_id
      : null)
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
  const fileKind: AttachmentFileKind =
    fileKindOverride
    ?? (typeof item.raw?.file_kind === "string" ? item.raw.file_kind as AttachmentFileKind : null)
    ?? resolveArtifactDirectoryFileKindFromRow({
      title,
      artifact_type: item.raw?.artifact_type,
      import_file_name: item.raw?.import_file_name,
      import_kind: item.raw?.import_kind,
      metadata: item.raw?.metadata,
    })

  const invalidateLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["global-search"] }),
      queryClient.invalidateQueries({ queryKey: ["artifact-directory-meta"] }),
      queryClient.invalidateQueries({ queryKey: ["task-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["project-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["ai-thread-artifacts"] }),
      queryClient.invalidateQueries({ queryKey: ["artifact"] }),
      queryClient.invalidateQueries({ queryKey: ["deleted-artifacts"] }),
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

  const saveAsProjectTemplate = async (projectId: number, projectName?: string) => {
    const result = await createProjectDesignTemplateFromArtifact({
      projectId,
      artifactId,
      title,
      notes: `Saved from output “${title}”.`,
    })
    if (result.error || !result.template) {
      throw result.error ?? new Error("Could not save as project template")
    }
    toast({
      title: "Saved as project template",
      description: projectName ? `${title} · ${projectName}` : title,
    })
    await queryClient.invalidateQueries({ queryKey: ["project-brand-kit", projectId] })
  }

  const handlePickProject = async (
    mode: "attach" | "template",
    project: { id: number; name: string },
  ) => {
    if (!artifactId || isBusy) return
    setIsBusy(true)
    try {
      if (mode === "attach" || !existingProjectId) {
        const attached = await attachArtifactToProject({ artifactId, projectId: project.id })
        if (attached.artifact) applyArtifactCachePatch(queryClient, attached.artifact)
        await invalidateLists()
        if (mode === "attach") {
          toast({ title: "Added to project", description: project.name })
        }
      }
      if (mode === "template") {
        await saveAsProjectTemplate(project.id, project.name)
      }
    } catch (error) {
      toast({
        title: mode === "template" ? "Could not save template" : "Could not add to project",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setIsBusy(false)
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!artifactId || isBusy) return
    if (!existingProjectId) return
    setIsBusy(true)
    try {
      await saveAsProjectTemplate(existingProjectId, projectLabel === "—" ? undefined : projectLabel)
    } catch (error) {
      toast({
        title: "Could not save template",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setIsBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!artifactId || isBusy) return
    setIsBusy(true)
    try {
      await deleteArtifact({ artifactId })
      forgetDeletedArtifact(queryClient, artifactId)
      closeCenterTab(buildCenterPaneTabKey("artifact", artifactId))
      setDeleteOpen(false)
      await invalidateLists()
    } catch (error) {
      console.error("Failed to delete artifact", error)
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
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <AttachmentFileKindIcon kind={fileKind} size="sm" />
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
            {existingProjectId ? null : (
              <ProjectPickSubmenu
                label="Add to project"
                icon={<FolderPlus className="h-4 w-4 text-gray-500" strokeWidth={1.75} />}
                disabled={isBusy}
                onPick={(project) => {
                  void handlePickProject("attach", project)
                }}
              />
            )}
            {existingProjectId ? (
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => {
                  void handleSaveAsTemplate()
                }}
              >
                <LayoutTemplate className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
                Save as project template
              </DropdownMenuItem>
            ) : (
              <ProjectPickSubmenu
                label="Save as project template"
                icon={<LayoutTemplate className="h-4 w-4 text-gray-500" strokeWidth={1.75} />}
                disabled={isBusy}
                onPick={(project) => {
                  void handlePickProject("template", project)
                }}
              />
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-red-600 focus:text-red-600"
              onSelect={() => setDeleteOpen(true)}
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

      {/* Project pick is inline in the ⋯ menu (ProjectPickSubmenu). */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete output"
        description="This output will move to Deleted. You can restore it or delete it permanently from the Outputs list."
        confirmLabel="Delete"
        busy={isBusy}
        busyLabel="Deleting…"
        onOpenChange={(open) => {
          if (!isBusy) setDeleteOpen(open)
        }}
        onConfirm={() => {
          void handleDelete()
        }}
      />
    </>
  )
}
