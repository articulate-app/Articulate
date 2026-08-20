"use client"

import { useCallback, useState } from "react"
import { usePathname } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { openArtifactCenterTab } from "../../../features/artifacts/open-artifact-center-tab"
import {
  importFileToArtifactContent,
  importUrlToArtifactContent,
  isImportableArtifactFile,
  OUTPUTS_FILE_ACCEPT,
} from "../../../features/artifacts/import-file-to-artifact"
import {
  readWorkspaceOutputCreateScopeFromSearch,
  titleFromHttpUrl,
} from "../../lib/workspace-create-output"
import {
  persistImportedWorkspaceOutput,
  workspaceImportErrorMessage,
} from "../../lib/workspace-import-output"
import { useCurrentUserStore } from "../../store/current-user"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { WorkspaceAddImportPopover } from "./workspace-add-import-popover"

export function WorkspaceAddOutputButton({
  openPane,
}: {
  openPane: WorkspacePaneId
}) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const currentUserId = useCurrentUserStore((state) => state.publicUserId)
  const [isBusy, setIsBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const currentScope = () =>
    readWorkspaceOutputCreateScopeFromSearch(new URLSearchParams(window.location.search))

  const finishCreated = useCallback(
    async (artifactId: string, title?: string | null) => {
      await queryClient.invalidateQueries({ queryKey: ["global-search"] })
      await queryClient.invalidateQueries({ queryKey: ["task-artifacts"] })
      openArtifactCenterTab({
        artifactId,
        title,
        pane: openPane,
        pathname: pathname || undefined,
      })
      setCreateError(null)
    },
    [openPane, pathname, queryClient],
  )

  const handleSubmitUrl = useCallback(
    async (url: string) => {
      setIsBusy(true)
      setCreateError(null)
      try {
        const imported = importUrlToArtifactContent(url)
        const created = await persistImportedWorkspaceOutput({
          imported,
          metadata: { source_url: url, import_kind: "url" },
          changeSummary: `Imported URL ${titleFromHttpUrl(url)}`,
          currentUserId,
          scope: currentScope(),
        })
        await finishCreated(created.id, created.title)
      } catch (error) {
        const message = workspaceImportErrorMessage(error, "Failed to add URL")
        setCreateError(message)
        throw new Error(message)
      } finally {
        setIsBusy(false)
      }
    },
    [currentUserId, finishCreated],
  )

  const handleSubmitFiles = useCallback(
    async (files: File[]) => {
      setIsBusy(true)
      setCreateError(null)
      try {
        let lastId: string | null = null
        let lastTitle: string | null = null
        const scope = currentScope()
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
            metadata: {
              import_kind: "file",
              import_file_name: file.name,
            },
            changeSummary: `Imported ${file.name}`,
            currentUserId,
            scope,
          })
          lastId = created.id
          lastTitle = created.title
        }
        if (lastId) await finishCreated(lastId, lastTitle)
      } catch (error) {
        const message = workspaceImportErrorMessage(error, "Failed to add file")
        setCreateError(message)
        throw new Error(message)
      } finally {
        setIsBusy(false)
      }
    },
    [currentUserId, finishCreated],
  )

  return (
    <WorkspaceAddImportPopover
      triggerLabel="Add output"
      isBusy={isBusy}
      error={createError}
      fileAccept={OUTPUTS_FILE_ACCEPT}
      filterFiles={isImportableArtifactFile}
      fileHint="Drop a Word, PDF, or text file."
      onSubmitUrl={handleSubmitUrl}
      onSubmitFiles={handleSubmitFiles}
    />
  )
}
