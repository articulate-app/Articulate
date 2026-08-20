"use client"

/**
 * Cross-project brand templates list — same page chrome as Open something / Projects.
 */

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, MoreHorizontal } from "lucide-react"
import { cn, formatCompactDateDisplay } from "@/lib/utils"
import {
  fetchAllProjectTemplates,
  type ProjectTemplateListItem,
} from "../../lib/services/project-templates"
import {
  createUserDesignTemplateFromFiles,
  createUserDesignTemplateFromUrl,
  TEMPLATE_FILE_ACCEPT,
} from "../../lib/services/user-design-templates"
import type { TemplateAssetViewKind } from "../../lib/template-asset-view"
import { buildTemplateWorkspaceId } from "../../lib/template-selection-url"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import { AttachmentFileKindIcon } from "../../../features/ai-chat/AttachmentFileChip"
import type { AttachmentFileKind } from "../../../features/ai-chat/attachment-file-meta"
import { useMobileDetection } from "../../hooks/use-mobile-detection"
import { WorkspaceHostPaneProvider } from "./workspace-host-pane-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { ProjectSettingsPanel } from "../projects/ProjectSettingsPanel"
import { objectPaneCenteredStateClass } from "../search/object-pane-content"
import {
  WorkspacePageSearchInput,
  WorkspacePageShell,
} from "./workspace-page-shell"
import { WorkspaceAddImportPopover } from "./workspace-add-import-popover"

function templateKindToAttachmentKind(
  kind: TemplateAssetViewKind | null,
): AttachmentFileKind {
  switch (kind) {
    case "docx":
      return "word"
    case "pdf":
      return "pdf"
    case "image":
      return "image"
    case "html":
      return "html"
    default:
      return "file"
  }
}

function TemplateLeadingVisual({ item }: { item: ProjectTemplateListItem }) {
  return (
    <AttachmentFileKindIcon
      kind={templateKindToAttachmentKind(item.primaryKind)}
      size="sm"
    />
  )
}

function TemplateDirectoryRow({
  item,
  isSelected,
  onOpenTemplate,
  onOpenProject,
  onOpenBrandSettings,
}: {
  item: ProjectTemplateListItem
  isSelected: boolean
  onOpenTemplate: (item: ProjectTemplateListItem) => void
  onOpenProject: (item: ProjectTemplateListItem) => void
  onOpenBrandSettings: (item: ProjectTemplateListItem) => void
}) {
  return (
    <div
      className={cn(
        "group relative flex min-h-10 w-full items-center gap-3 px-1 py-2",
        isSelected ? "bg-gray-100" : "hover:bg-gray-50",
      )}
      aria-selected={isSelected}
    >
      <button
        type="button"
        onClick={() => onOpenTemplate(item)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <TemplateLeadingVisual item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-gray-900">{item.title}</span>
          <span className="block truncate text-xs text-gray-500 md:hidden">{item.projectName}</span>
        </span>
        <span className="hidden w-36 shrink-0 truncate text-right text-sm text-gray-500 md:block">
          {item.projectName}
        </span>
        <span className="hidden w-28 shrink-0 truncate text-right text-sm text-gray-500 md:block">
          {formatCompactDateDisplay(item.createdAt) || "—"}
        </span>
      </button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 opacity-100 transition-opacity hover:bg-gray-200 hover:text-gray-800 focus:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
            aria-label="Template options"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <DropdownMenuItem onSelect={() => onOpenTemplate(item)}>Open template</DropdownMenuItem>
          {item.projectId != null ? (
            <>
              <DropdownMenuItem onSelect={() => onOpenProject(item)}>Open project</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenBrandSettings(item)}>
                Edit in Brand kit
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export type WorkspaceTemplateListViewProps = {
  paneId: WorkspacePaneId
}

export function WorkspaceTemplateListView({ paneId }: WorkspaceTemplateListViewProps) {
  const queryClient = useQueryClient()
  const isMobile = useMobileDetection()
  const [searchValue, setSearchValue] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [settingsProjectId, setSettingsProjectId] = useState<number | null>(null)
  const [settingsTemplateId, setSettingsTemplateId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const templatesQuery = useQuery({
    queryKey: ["workspace-template-list"],
    queryFn: fetchAllProjectTemplates,
    staleTime: 30_000,
  })

  const openPane: WorkspacePaneId = paneId === "left" ? "middle" : paneId

  const filteredItems = useMemo(() => {
    const q = searchValue.trim().toLowerCase()
    const items = templatesQuery.data ?? []
    if (!q) return items
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        (item.notes ?? "").toLowerCase().includes(q),
    )
  }, [searchValue, templatesQuery.data])

  const handleOpenTemplate = (item: ProjectTemplateListItem) => {
    setSelectedTemplateId(item.id)
    openWorkspaceView(
      {
        type: "template",
        id: buildTemplateWorkspaceId(item.projectId, item.id),
        title: item.title,
        projectId: item.projectId ?? undefined,
      },
      {
        pane: openPane,
        source: `workspace-template-list:${paneId}`,
      },
    )
  }

  const handleOpenProject = (item: ProjectTemplateListItem) => {
    if (item.projectId == null) return
    setSelectedTemplateId(item.id)
    openWorkspaceView(
      {
        type: "project",
        id: item.projectId,
        title: item.projectName,
      },
      {
        pane: openPane,
        source: `workspace-template-list:${paneId}`,
      },
    )
  }

  const handleOpenBrandSettings = (item: ProjectTemplateListItem) => {
    if (item.projectId == null) return
    setSelectedTemplateId(item.id)
    setSettingsTemplateId(item.id)
    setSettingsProjectId(item.projectId)
  }

  const openCreatedTemplate = (templateId: string, title: string) => {
    setSelectedTemplateId(templateId)
    openWorkspaceView(
      {
        type: "template",
        id: buildTemplateWorkspaceId(null, templateId),
        title,
      },
      {
        pane: openPane,
        source: `workspace-template-list:${paneId}`,
      },
    )
    void queryClient.invalidateQueries({ queryKey: ["workspace-template-list"] })
  }

  const handleSubmitUrl = async (url: string) => {
    setIsCreating(true)
    setCreateError(null)
    try {
      const template = await createUserDesignTemplateFromUrl({ url })
      openCreatedTemplate(template.id, template.title?.trim() || "Untitled template")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add URL"
      setCreateError(message)
      throw err
    } finally {
      setIsCreating(false)
    }
  }

  const handleSubmitFiles = async (files: File[]) => {
    setIsCreating(true)
    setCreateError(null)
    try {
      const template = await createUserDesignTemplateFromFiles({ files })
      openCreatedTemplate(template.id, template.title?.trim() || "Untitled template")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add file"
      setCreateError(message)
      throw err
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <WorkspaceHostPaneProvider pane={paneId}>
      <WorkspacePageShell
        title="Templates"
        subtitle="Search and open a brand template."
        hideHeadline={isMobile}
        actions={
          <>
            <WorkspacePageSearchInput
              value={searchValue}
              onChange={setSearchValue}
              placeholder="Search templates…"
              variant="header"
            />
            <WorkspaceAddImportPopover
              triggerLabel="Add template"
              isBusy={isCreating}
              error={createError}
              fileAccept={TEMPLATE_FILE_ACCEPT}
              fileHint="Drop a file here."
              onSubmitUrl={handleSubmitUrl}
              onSubmitFiles={handleSubmitFiles}
            />
          </>
        }
      >
        {templatesQuery.isError ? (
          <div className={objectPaneCenteredStateClass("h-auto py-10")}>
            Unable to load templates.
          </div>
        ) : templatesQuery.isLoading ? (
          <div className={objectPaneCenteredStateClass("h-auto py-10")}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading templates...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className={objectPaneCenteredStateClass("h-auto py-10")}>
            {searchValue.trim() ? "No templates match your search." : "No templates yet."}
          </div>
        ) : (
          <div className="flex w-full flex-col">
            <div className="sticky top-0 z-10 hidden items-center gap-3 bg-white px-1 py-1.5 md:flex">
              <span className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Name
              </span>
              <span className="w-36 shrink-0 text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Project
              </span>
              <span className="w-28 shrink-0 text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Created
              </span>
              <span className="w-7 shrink-0" aria-hidden />
            </div>
            <div className="divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <TemplateDirectoryRow
                  key={buildTemplateWorkspaceId(item.projectId, item.id)}
                  item={item}
                  isSelected={selectedTemplateId === item.id}
                  onOpenTemplate={handleOpenTemplate}
                  onOpenProject={handleOpenProject}
                  onOpenBrandSettings={handleOpenBrandSettings}
                />
              ))}
            </div>
          </div>
        )}
      </WorkspacePageShell>

      {settingsProjectId != null ? (
        <ProjectSettingsPanel
          open
          projectId={settingsProjectId}
          initialCategory="brand"
          initialTemplateId={settingsTemplateId}
          onClose={() => {
            setSettingsProjectId(null)
            setSettingsTemplateId(null)
            void queryClient.invalidateQueries({ queryKey: ["workspace-template-list"] })
          }}
        />
      ) : null}
    </WorkspaceHostPaneProvider>
  )
}
