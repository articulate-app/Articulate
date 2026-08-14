"use client"

/**
 * Cross-project brand templates list — same page chrome as Open something / Projects.
 */

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Loader2, MoreHorizontal } from "lucide-react"
import { cn, formatCompactDateDisplay } from "@/lib/utils"
import { getImageUrl } from "../../lib/public-media"
import {
  fetchAllProjectTemplates,
  type ProjectTemplateListItem,
} from "../../lib/services/project-templates"
import {
  createEmptyProjectDesignTemplate,
  fetchProjectBrandKit,
} from "../../lib/services/project-brand-kit"
import type { TemplateAssetViewKind } from "../../lib/template-asset-view"
import { buildTemplateWorkspaceId } from "../../lib/template-selection-url"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import { AttachmentFileKindIcon } from "../../../features/ai-chat/AttachmentFileChip"
import type { AttachmentFileKind } from "../../../features/ai-chat/attachment-file-meta"
import { WorkspaceHostPaneProvider } from "./workspace-host-pane-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { ProjectSettingsPanel } from "../projects/ProjectSettingsPanel"
import { objectPaneCenteredStateClass } from "../search/object-pane-content"
import {
  WorkspacePageAddButton,
  WorkspacePageSearchInput,
  WorkspacePageShell,
} from "./workspace-page-shell"

type ProjectOption = {
  id: number
  name: string
  logo: string | null
  color: string | null
}

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
        <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{item.title}</span>
        <span className="w-36 shrink-0 truncate text-right text-sm text-gray-500">
          {item.projectName}
        </span>
        <span className="w-28 shrink-0 truncate text-right text-sm text-gray-500">
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
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const [searchValue, setSearchValue] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [settingsProjectId, setSettingsProjectId] = useState<number | null>(null)
  const [settingsTemplateId, setSettingsTemplateId] = useState<string | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [projectSearch, setProjectSearch] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const templatesQuery = useQuery({
    queryKey: ["workspace-template-list"],
    queryFn: fetchAllProjectTemplates,
    staleTime: 30_000,
  })

  const projectsQuery = useQuery({
    queryKey: ["workspace-template-add-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,logo,color")
        .eq("active", true)
        .order("name")
        .limit(200)
      if (error) throw error
      return ((data ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const id = Number(row.id)
          if (!Number.isFinite(id) || id <= 0) return null
          return {
            id,
            name: (typeof row.name === "string" && row.name.trim()) || `Project ${id}`,
            logo: typeof row.logo === "string" ? row.logo : null,
            color: typeof row.color === "string" ? row.color : null,
          } satisfies ProjectOption
        })
        .filter((row): row is ProjectOption => row != null)
    },
    enabled: isAddOpen,
    staleTime: 60_000,
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

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase()
    const items = projectsQuery.data ?? []
    if (!q) return items.slice(0, 40)
    return items
      .filter((project) => project.name.toLowerCase().includes(q))
      .slice(0, 40)
  }, [projectSearch, projectsQuery.data])

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

  const handleAddTemplateForProject = async (project: ProjectOption) => {
    if (isCreating) return
    setCreateError(null)
    setIsCreating(true)
    try {
      const brandKit = await fetchProjectBrandKit(project.id)
      const { template, error } = await createEmptyProjectDesignTemplate({
        projectId: project.id,
        brandKit,
        title: "Untitled template",
      })
      if (error || !template) {
        throw error ?? new Error("Could not create template")
      }
      setSelectedTemplateId(template.id)
      setSettingsTemplateId(template.id)
      setSettingsProjectId(project.id)
      setIsAddOpen(false)
      setProjectSearch("")
      void queryClient.invalidateQueries({ queryKey: ["workspace-template-list"] })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create template")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <WorkspaceHostPaneProvider pane={paneId}>
      <WorkspacePageShell
        title="Templates"
        subtitle="Search and open a brand template."
        actions={
          <Popover
            open={isAddOpen}
            onOpenChange={(open) => {
              setIsAddOpen(open)
              if (!open) {
                setProjectSearch("")
                setCreateError(null)
              }
            }}
          >
            <PopoverTrigger asChild>
              <WorkspacePageAddButton label="Add template" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <div className="space-y-2">
                <p className="px-1 text-xs text-gray-500">Choose a project for the new template.</p>
                <input
                  type="search"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  placeholder="Search projects…"
                  autoFocus
                  className="h-8 w-full rounded-md border border-gray-200 px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
                <div className="max-h-64 overflow-y-auto">
                  {projectsQuery.isLoading ? (
                    <div className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading projects…
                    </div>
                  ) : filteredProjects.length === 0 ? (
                    <div className="px-2 py-6 text-center text-xs text-gray-500">
                      No projects found.
                    </div>
                  ) : (
                    filteredProjects.map((project) => {
                      const logoUrl = getImageUrl(project.logo)
                      return (
                        <button
                          key={project.id}
                          type="button"
                          disabled={isCreating}
                          onClick={() => void handleAddTemplateForProject(project)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-60"
                        >
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={logoUrl}
                              alt=""
                              className="h-5 w-5 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: project.color || "#d1d5db" }}
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate text-gray-900">
                            {project.name}
                          </span>
                          {isCreating ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
                          ) : null}
                        </button>
                      )
                    })
                  )}
                </div>
                {createError ? (
                  <p className="px-1 text-xs text-red-600">{createError}</p>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        }
      >
        <WorkspacePageSearchInput
          value={searchValue}
          onChange={setSearchValue}
          placeholder="Search templates…"
        />

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
            <div className="sticky top-0 z-10 flex items-center gap-3 bg-white px-1 py-1.5">
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
                  key={`${item.projectId}:${item.id}`}
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
