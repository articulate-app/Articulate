"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { ChevronRight, Loader2 } from "lucide-react"
import { getImageUrl } from "@/lib/public-media"
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "../ui/dropdown-menu"
import { Input } from "../ui/input"

type ProjectOption = {
  id: number
  name: string
  color?: string | null
  logo?: string | null
}

export function ProjectPickSubmenu({
  label,
  icon,
  disabled = false,
  onPick,
}: {
  label: string
  icon?: ReactNode
  disabled?: boolean
  onPick: (project: { id: number; name: string }) => void
}) {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [search, setSearch] = useState("")

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-minimal"],
    queryFn: async (): Promise<ProjectOption[]> => {
      const { data, error } = await supabase
        .from("v_projects_minimal")
        .select("id, name, color, logo")
        .order("name")
      if (error) throw error
      return (data ?? [])
        .filter((row) => row?.id != null && row?.name)
        .map((row) => ({
          id: Number(row.id),
          name: String(row.name),
          color: row.color ?? null,
          logo: row.logo ?? null,
        }))
    },
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => project.name.toLowerCase().includes(query))
  }, [projects, search])

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2" disabled={disabled}>
        {icon}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        sideOffset={6}
        className="max-h-[min(360px,70vh)] min-w-[14rem] overflow-y-auto p-0"
      >
        <div
          className="sticky top-0 z-[1] border-b border-border bg-popover p-2"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Input
            placeholder="Search projects…"
            className="h-8 text-sm"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>
        <div className="p-1">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading projects…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">No projects found</div>
          ) : (
            filtered.map((project) => {
              const logoUrl = getImageUrl(project.logo)
              return (
                <DropdownMenuItem
                  key={project.id}
                  className="gap-2"
                  onSelect={() => onPick({ id: project.id, name: project.name })}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
                    ) : (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: project.color || "#e5e7eb" }}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                </DropdownMenuItem>
              )
            })
          )}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
