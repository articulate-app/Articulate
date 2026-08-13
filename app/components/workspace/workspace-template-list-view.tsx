"use client"

/**
 * Cross-project brand templates list — same directory chrome as Users / Projects.
 */

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, MoreHorizontal, Search } from "lucide-react"
import { cn, formatCompactDateDisplay } from "@/lib/utils"
import { getImageUrl } from "../../lib/public-media"
import {
  fetchAllProjectTemplates,
  type ProjectTemplateListItem,
} from "../../lib/services/project-templates"
import { buildTemplateWorkspaceId } from "../../lib/template-selection-url"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import { WorkspaceHostPaneProvider } from "./workspace-host-pane-context"
import { InlineSearchInput } from "../tasks/InlineSearchInput"
import { IconTooltip } from "../ui/icon-tooltip"
import {
  PANE_CHROME_ICON_BUTTON_CLASS,
  PANE_CHROME_ICON_CLASS,
} from "../tasks/pane-header-tokens"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { ProjectSettingsPanel } from "../projects/ProjectSettingsPanel"
import { ObjectPaneScrollShell, objectPaneCenteredStateClass } from "../search/object-pane-content"

const DIRECTORY_CONTENT_CLASS = "mx-auto w-full max-w-2xl"

function TemplateLeadingVisual({ item }: { item: ProjectTemplateListItem }) {
  const [imageFailed, setImageFailed] = useState(false)
  const thumb = item.thumbnailUrl
  const projectLogo = getImageUrl(item.projectLogo)

  if (thumb && !imageFailed) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
        />
      </span>
    )
  }

  if (projectLogo && !imageFailed) {
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={projectLogo}
          alt=""
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
        />
      </span>
    )
  }

  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: item.projectColor || "#d1d5db" }}
        aria-hidden
      />
    </span>
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
        "group relative flex h-9 w-full items-center gap-3 px-4",
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
        <span className="min-w-0 flex-1 truncate text-xs text-gray-900">{item.title}</span>
        <span className="w-32 shrink-0 truncate text-right text-[11px] text-gray-500">
          {item.projectName}
        </span>
        <span className="w-24 shrink-0 truncate text-right text-[11px] text-gray-500">
          {formatCompactDateDisplay(item.createdAt) || "—"}
        </span>
      </button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 opacity-0 transition-opacity hover:bg-gray-200 hover:text-gray-800 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
            aria-label="Template options"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <DropdownMenuItem onSelect={() => onOpenTemplate(item)}>Open template</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenProject(item)}>Open project</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenBrandSettings(item)}>
            Edit in Brand kit
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export type WorkspaceTemplateListViewProps = {
  paneId: WorkspacePaneId
}

export function WorkspaceTemplateListView({ paneId }: WorkspaceTemplateListViewProps) {
  const [isInlineSearchOpen, setIsInlineSearchOpen] = useState(false)
  const [inlineSearchValue, setInlineSearchValue] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [settingsProjectId, setSettingsProjectId] = useState<number | null>(null)
  const [settingsTemplateId, setSettingsTemplateId] = useState<string | null>(null)

  const templatesQuery = useQuery({
    queryKey: ["workspace-template-list"],
    queryFn: fetchAllProjectTemplates,
    staleTime: 30_000,
  })

  const openPane: WorkspacePaneId = paneId === "left" ? "middle" : paneId

  const filteredItems = useMemo(() => {
    const q = inlineSearchValue.trim().toLowerCase()
    const items = templatesQuery.data ?? []
    if (!q) return items
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        (item.notes ?? "").toLowerCase().includes(q),
    )
  }, [inlineSearchValue, templatesQuery.data])

  const handleOpenTemplate = (item: ProjectTemplateListItem) => {
    setSelectedTemplateId(item.id)
    openWorkspaceView(
      {
        type: "template",
        id: buildTemplateWorkspaceId(item.projectId, item.id),
        title: item.title,
        projectId: item.projectId,
      },
      {
        pane: openPane,
        source: `workspace-template-list:${paneId}`,
      },
    )
  }

  const handleOpenProject = (item: ProjectTemplateListItem) => {
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
    setSelectedTemplateId(item.id)
    setSettingsTemplateId(item.id)
    setSettingsProjectId(item.projectId)
  }

  return (
    <WorkspaceHostPaneProvider pane={paneId}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-10 min-h-10 max-h-10 shrink-0 items-center gap-1 overflow-hidden border-b border-gray-200/80 bg-white pl-4 pr-1.5">
          {isInlineSearchOpen ? (
            <InlineSearchInput
              isOpen
              fullWidth
              value={inlineSearchValue}
              onChange={setInlineSearchValue}
              onClose={() => {
                setIsInlineSearchOpen(false)
                setInlineSearchValue("")
              }}
              placeholder="Search templates..."
            />
          ) : (
            <>
              <div className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                Templates
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <IconTooltip label="Search">
                  <button
                    type="button"
                    className={PANE_CHROME_ICON_BUTTON_CLASS}
                    aria-label="Search"
                    onClick={() => setIsInlineSearchOpen(true)}
                  >
                    <Search className={PANE_CHROME_ICON_CLASS} />
                  </button>
                </IconTooltip>
              </div>
            </>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ObjectPaneScrollShell>
            {templatesQuery.isError ? (
              <div className={objectPaneCenteredStateClass()}>Unable to load templates.</div>
            ) : templatesQuery.isLoading ? (
              <div className={objectPaneCenteredStateClass()}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading templates...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className={objectPaneCenteredStateClass()}>
                {inlineSearchValue.trim() ? "No templates match your search." : "No templates yet."}
              </div>
            ) : (
              <div className={cn("flex min-h-full flex-col py-1", DIRECTORY_CONTENT_CLASS)}>
                <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-1.5">
                  <span className="min-w-0 flex-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Name
                  </span>
                  <span className="w-32 shrink-0 text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Project
                  </span>
                  <span className="w-24 shrink-0 text-right text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Created
                  </span>
                  <span className="w-7 shrink-0" aria-hidden />
                </div>
                {filteredItems.map((item) => (
                  <TemplateDirectoryRow
                    key={`${item.projectId}:${item.id}`}
                    item={item}
                    isSelected={selectedTemplateId === item.id}
                    onOpenTemplate={handleOpenTemplate}
                    onOpenProject={handleOpenProject}
                    onOpenBrandSettings={handleOpenBrandSettings}
                  />
                ))}
              </div>
            )}
          </ObjectPaneScrollShell>
        </div>
      </div>
      {settingsProjectId != null ? (
        <ProjectSettingsPanel
          open
          projectId={settingsProjectId}
          initialCategory="brand"
          initialTemplateId={settingsTemplateId}
          onClose={() => {
            setSettingsProjectId(null)
            setSettingsTemplateId(null)
          }}
        />
      ) : null}
    </WorkspaceHostPaneProvider>
  )
}
