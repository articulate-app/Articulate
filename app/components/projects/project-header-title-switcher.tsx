"use client"

import { useCallback, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Check, ChevronDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { buildCenterPaneSelectionSearchParams } from "../../lib/center-pane-selection-url"
import { buildRightPaneSelectionSearchParams } from "../../lib/right-pane-selection-url"
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav"
import { useCenterPaneTabsStore } from "../../store/center-pane-tabs"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { getImageUrl } from "../../lib/public-media"

type ProjectOption = {
  id: number
  name: string
  color: string | null
  logo: string | null
}

export function ProjectHeaderTitleSwitcher({
  projectId,
  title,
}: {
  projectId: number
  title: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const upsertTab = useCenterPaneTabsStore((s) => s.upsertTab)
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [open, setOpen] = useState(false)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-minimal"],
    queryFn: async (): Promise<ProjectOption[]> => {
      const { data, error } = await supabase
        .from("v_projects_minimal")
        .select("id, name, color, logo")
        .order("name")
      if (error) throw error
      return (data ?? [])
        .filter((row: any) => row?.id != null && row?.name)
        .map((row: any) => ({
          id: Number(row.id),
          name: String(row.name),
          color: row.color ?? null,
          logo: row.logo ?? null,
        }))
    },
    enabled: open,
    staleTime: 60_000,
  })

  const handleSelect = useCallback(
    (nextProjectId: number, nextName: string) => {
      if (nextProjectId === projectId) {
        setOpen(false)
        return
      }

      const base = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      )
      const currentTab =
        base.get("centerTab") ?? base.get("rightTab") ?? base.get("tab")
      const hasCenterProject = base.has("centerProjectId")
      const hasRightProject = base.has("rightProjectId")
      const isStandaloneProjectRoute = /^\/projects\/\d+/.test(pathname)

      if (isStandaloneProjectRoute && !hasCenterProject && !hasRightProject) {
        setOpen(false)
        router.push(`/projects/${nextProjectId}`)
        return
      }

      if (hasRightProject && !hasCenterProject) {
        const next = buildRightPaneSelectionSearchParams({
          currentSearchParams: base,
          entity: "project",
          id: nextProjectId,
          tab: currentTab && currentTab !== "overview" ? currentTab : null,
        })
        setOpen(false)
        shallowReplaceSearchParams(pathname, next, "project-header-switch")
        return
      }

      upsertTab({
        kind: "project",
        id: String(nextProjectId),
        title: nextName,
      })
      const next = buildCenterPaneSelectionSearchParams({
        currentSearchParams: base,
        entity: "project",
        id: nextProjectId,
        tab: currentTab && currentTab !== "overview" ? currentTab : null,
      })
      setOpen(false)
      shallowReplaceSearchParams(pathname, next, "project-header-switch")
    },
    [pathname, projectId, router, upsertTab],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex min-w-0 max-w-full items-center gap-1 rounded-md text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          title="Switch project"
          aria-label="Switch project"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="truncate text-sm font-semibold text-gray-900">{title}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400 group-hover:text-gray-600" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(90vw,18rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects…" />
          <CommandList className="max-h-[280px]">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <>
                <CommandEmpty>No projects found</CommandEmpty>
                <CommandGroup>
                  {projects.map((project) => {
                    const isCurrent = project.id === projectId
                    const logoUrl = getImageUrl(project.logo)
                    return (
                      <CommandItem
                        key={project.id}
                        value={`${project.name} ${project.id}`}
                        onSelect={() => handleSelect(project.id, project.name)}
                        className={cn(isCurrent && "bg-muted")}
                      >
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-50"
                            style={
                              !logoUrl && project.color
                                ? { backgroundColor: project.color }
                                : undefined
                            }
                          >
                            {logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          {isCurrent ? <Check className="h-3.5 w-3.5 shrink-0 text-gray-700" /> : null}
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
