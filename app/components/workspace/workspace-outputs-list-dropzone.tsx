"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Loader2, Upload } from "lucide-react"
import { openArtifactCenterTab } from "../../../features/artifacts/open-artifact-center-tab"
import {
  filesFromDataTransfer,
  importFileToArtifactContent,
  isFileImportDrag,
  isImportableArtifactFile,
  isPointInsideRelatedOutputsZone,
  OUTPUTS_DROPZONE_ATTR,
} from "../../../features/artifacts/import-file-to-artifact"
import { useCurrentUserStore } from "../../store/current-user"
import { readWorkspaceOutputCreateScopeFromSearch } from "../../lib/workspace-create-output"
import {
  persistImportedWorkspaceOutput,
  workspaceImportErrorMessage,
} from "../../lib/workspace-import-output"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { cn } from "../../lib/utils"

export function WorkspaceOutputsListDropzone({
  openPane,
  children,
}: {
  openPane: WorkspacePaneId
  children: ReactNode
}) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const currentUserId = useCurrentUserStore((state) => state.publicUserId)
  const dropRootRef = useRef<HTMLDivElement | null>(null)
  const isDragOverRef = useRef(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const importFiles = useCallback(
    async (incoming: File[]) => {
      const files = incoming.filter(isImportableArtifactFile)
      if (incoming.length > 0 && files.length === 0) {
        setImportError("Use a Word, PDF, or text file.")
        return
      }
      if (files.length === 0) return
      setIsDragOver(false)
      setImportError(null)
      setIsImporting(true)
      try {
        const scope = readWorkspaceOutputCreateScopeFromSearch(
          new URLSearchParams(window.location.search),
        )
        let lastId: string | null = null
        let lastTitle: string | null = null
        for (const file of files) {
          let imported
          try {
            imported = await importFileToArtifactContent(file)
          } catch (error) {
            throw new Error(
              `Could not read ${file.name}: ${workspaceImportErrorMessage(error, "unsupported file")}`,
            )
          }
          const created = await persistImportedWorkspaceOutput({
            imported,
            metadata: { import_kind: "file", import_file_name: file.name },
            changeSummary: `Imported ${file.name}`,
            currentUserId,
            scope,
          })
          lastId = created.id
          lastTitle = created.title
        }
        await queryClient.invalidateQueries({ queryKey: ["global-search"] })
        await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
        if (lastId) {
          openArtifactCenterTab({
            artifactId: lastId,
            title: lastTitle,
            pane: openPane,
            pathname: pathname || undefined,
          })
        }
      } catch (error) {
        setImportError(workspaceImportErrorMessage(error, "Failed to add file"))
      } finally {
        setIsImporting(false)
      }
    },
    [currentUserId, openPane, pathname, queryClient],
  )

  useEffect(() => {
    const onWindowDragOver = (event: DragEvent) => {
      if (!isFileImportDrag(event.dataTransfer)) return
      const overZone = isPointInsideRelatedOutputsZone(
        dropRootRef.current,
        event.clientX,
        event.clientY,
      )
      if (!overZone) {
        if (isDragOverRef.current) {
          isDragOverRef.current = false
          setIsDragOver(false)
        }
        return
      }
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
      if (!isDragOverRef.current) {
        isDragOverRef.current = true
        setIsDragOver(true)
      }
    }
    const onWindowDrop = (event: DragEvent) => {
      if (!isFileImportDrag(event.dataTransfer)) {
        if (isDragOverRef.current) {
          isDragOverRef.current = false
          setIsDragOver(false)
        }
        return
      }
      if (!isPointInsideRelatedOutputsZone(dropRootRef.current, event.clientX, event.clientY)) {
        if (isDragOverRef.current) {
          isDragOverRef.current = false
          setIsDragOver(false)
        }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      isDragOverRef.current = false
      setIsDragOver(false)
      void importFiles(filesFromDataTransfer(event.dataTransfer))
    }
    const onWindowDragEnd = () => {
      if (!isDragOverRef.current) return
      isDragOverRef.current = false
      setIsDragOver(false)
    }
    window.addEventListener("dragenter", onWindowDragOver, true)
    window.addEventListener("dragover", onWindowDragOver, true)
    window.addEventListener("drop", onWindowDrop, true)
    window.addEventListener("dragend", onWindowDragEnd, true)
    return () => {
      window.removeEventListener("dragenter", onWindowDragOver, true)
      window.removeEventListener("dragover", onWindowDragOver, true)
      window.removeEventListener("drop", onWindowDrop, true)
      window.removeEventListener("dragend", onWindowDragEnd, true)
    }
  }, [importFiles])

  return (
    <div
      ref={dropRootRef}
      {...{ [OUTPUTS_DROPZONE_ATTR]: "true" }}
      className="relative h-full min-h-0"
    >
      {children}
      {importError ? (
        <p className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-md bg-white/95 px-3 py-1.5 text-xs text-red-600 shadow-sm">
          {importError}
        </p>
      ) : null}
      {isDragOver || isImporting ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed px-4",
            isDragOver
              ? "border-sky-400 bg-sky-50/90"
              : "border-transparent bg-white/60",
          )}
        >
          <p className="inline-flex items-center gap-2 text-center text-sm font-medium text-sky-800">
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            {isImporting ? "Adding file…" : "Drop to add as an output"}
          </p>
        </div>
      ) : null}
    </div>
  )
}
