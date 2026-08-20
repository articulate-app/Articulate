"use client"

/**
 * Directory-style row for Users / Projects lists: name + secondary column + ⋯ menu.
 * Projects use a colored folder icon (no logos); users keep avatars.
 */

import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal } from "lucide-react"
import { cn, formatCompactDateDisplay } from "@/lib/utils"
import type { GlobalSearchDocument } from "../../lib/global-search-types"
import {
  pinnedItemKey,
  readHomeSidebarPinnedItems,
  writeHomeSidebarPinnedItems,
  type HomeSidebarPinnedItem,
  type HomeSidebarRecentsFeedKey,
} from "../../lib/home-sidebar-recents-cache"
import { deleteProject } from "../../lib/services/projects"
import { softDeleteUser } from "../../lib/services/users"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { ProjectSettingsPanel } from "../projects/ProjectSettingsPanel"
import { LeftVisual } from "../search/SearchResultRow"

function asIsoString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  return null
}

function resolveLastUpdate(
  item: GlobalSearchDocument,
  recentAtOverride?: string | null,
): string | null {
  if (typeof recentAtOverride === "string" && recentAtOverride.trim()) {
    return recentAtOverride.trim()
  }
  const raw = item.raw ?? {}
  return (
    asIsoString(raw.updated_at) ??
    asIsoString(raw.last_interaction_at) ??
    asIsoString(raw.last_seen_at) ??
    asIsoString(raw.recent_at) ??
    item.created_at
  )
}

function resolveUserProjectsLabel(item: GlobalSearchDocument): string {
  const raw = item.raw ?? {}
  const fromRaw =
    raw.project_count ??
    raw.projects_count ??
    raw.projectCount ??
    (Array.isArray(raw.projects) ? raw.projects.length : null)
  if (typeof fromRaw === "number" && Number.isFinite(fromRaw)) return String(fromRaw)
  if (typeof fromRaw === "string" && fromRaw.trim()) return fromRaw.trim()
  const meta = item.display_payload?.meta ?? []
  for (const entry of meta) {
    const label = entry.label?.trim().toLowerCase() ?? ""
    if (label === "projects" || label === "project_count" || label === "projects_count") {
      return entry.value?.trim() || "—"
    }
  }
  return "—"
}

export type ObjectDirectoryResultRowProps = {
  item: GlobalSearchDocument
  mode: "user" | "project"
  onSelect: (item: GlobalSearchDocument) => void
  onDeleted?: () => void
  /** Prefer sidebar-style recency (`list_home_recent_*`) when available. */
  recentAtOverride?: string | null
  /** Projects column override (batch-fetched labels for users directory). */
  secondaryOverride?: string | null
  /** Open/selected in the details pane — gray highlight like the task list. */
  isSelected?: boolean
  /** Tighter horizontal inset when nested in WorkspacePageShell. */
  denseInset?: boolean
  /** Mobile list: larger title, secondary line under the name, bigger visual. */
  layout?: "columns" | "stacked"
}

export function ObjectDirectoryResultRow({
  item,
  mode,
  onSelect,
  onDeleted,
  recentAtOverride = null,
  secondaryOverride = null,
  isSelected = false,
  denseInset = false,
  layout = "columns",
}: ObjectDirectoryResultRowProps) {
  const queryClient = useQueryClient()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [pinnedAt, setPinnedAt] = useState(() => Date.now())

  const feedKey: HomeSidebarRecentsFeedKey = mode === "user" ? "users" : "projects"
  const entityId = String(item.entity_id ?? "").trim()
  const title = item.display_payload?.title?.trim() || item.title?.trim() || "Untitled"

  const isPinned = useMemo(() => {
    void pinnedAt
    if (!entityId) return false
    return readHomeSidebarPinnedItems().some(
      (row) => pinnedItemKey(row.feedKey, row.id) === pinnedItemKey(feedKey, entityId),
    )
  }, [entityId, feedKey, pinnedAt])

  const secondary =
    mode === "user"
      ? (typeof secondaryOverride === "string" && secondaryOverride.trim()
          ? secondaryOverride.trim()
          : resolveUserProjectsLabel(item))
      : formatCompactDateDisplay(resolveLastUpdate(item, recentAtOverride)) || "—"

  const togglePin = () => {
    if (!entityId) return
    const key = pinnedItemKey(feedKey, entityId)
    const prev = readHomeSidebarPinnedItems()
    const exists = prev.some((row) => pinnedItemKey(row.feedKey, row.id) === key)
    const next: HomeSidebarPinnedItem[] = exists
      ? prev.filter((row) => pinnedItemKey(row.feedKey, row.id) !== key)
      : [
          {
            feedKey,
            id: entityId,
            title,
            pinnedAt: new Date().toISOString(),
          },
          ...prev,
        ]
    writeHomeSidebarPinnedItems(next)
    setPinnedAt(Date.now())
  }

  const handleDelete = async () => {
    if (!entityId || isBusy) return
    const label = mode === "user" ? "user" : "project"
    const confirmed = window.confirm(`Delete this ${label}? This cannot be undone from here.`)
    if (!confirmed) return
    const idNum = Number(entityId)
    if (!Number.isFinite(idNum) || idNum <= 0) return
    setIsBusy(true)
    try {
      if (mode === "user") {
        const { error } = await softDeleteUser(idNum)
        if (error) throw error
      } else {
        const { error } = await deleteProject(idNum)
        if (error) throw error
      }
      void queryClient.invalidateQueries({ queryKey: ["global-search"] })
      void queryClient.invalidateQueries({ queryKey: ["home-sidebar-recents"] })
      onDeleted?.()
    } catch (error) {
      console.error(`Failed to delete ${label}`, error)
      window.alert(`Could not delete this ${label}.`)
    } finally {
      setIsBusy(false)
    }
  }

  const projectIdNum = Number(entityId)

  return (
    <>
      <div
        className={cn(
          "group relative flex w-full items-center gap-3",
          layout === "stacked" ? "min-h-[72px] py-3" : "min-h-[52px] py-2",
          denseInset ? "px-1" : "px-4",
          isSelected ? "bg-gray-100" : "hover:bg-gray-50",
        )}
        aria-selected={isSelected}
      >
        <button
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            "flex min-w-0 flex-1 text-left",
            layout === "stacked" ? "items-center gap-3" : "items-center gap-2.5",
          )}
        >
          <LeftVisual
            payload={item.display_payload ?? { title }}
            raw={item.raw}
            isProject={mode === "project"}
            isUser={mode === "user"}
            compact={layout !== "stacked"}
          />
          {layout === "stacked" ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-medium leading-snug text-gray-900">
                {title}
              </span>
              <span className="mt-0.5 block truncate text-sm text-gray-400">{secondary}</span>
            </span>
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-[15px] leading-snug text-gray-900">{title}</span>
              <span className="w-36 shrink-0 truncate text-right text-[15px] leading-snug text-gray-500">
                {secondary}
              </span>
            </>
          )}
        </button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-opacity hover:bg-gray-200 hover:text-gray-800 focus:opacity-100 data-[state=open]:opacity-100",
                layout === "stacked"
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
              aria-label="Item options"
              onClick={(event) => event.stopPropagation()}
              disabled={isBusy}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onSelect={togglePin}>
              {isPinned ? "Unpin" : "Pin to top"}
            </DropdownMenuItem>
            {mode === "project" && Number.isFinite(projectIdNum) && projectIdNum > 0 ? (
              <DropdownMenuItem
                onSelect={() => {
                  window.setTimeout(() => setSettingsOpen(true), 0)
                }}
              >
                Settings
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onSelect={() => {
                void handleDelete()
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {mode === "project" && Number.isFinite(projectIdNum) && projectIdNum > 0 ? (
        <ProjectSettingsPanel
          open={settingsOpen}
          projectId={projectIdNum}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  )
}
