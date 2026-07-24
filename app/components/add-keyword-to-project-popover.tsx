"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Check, Loader2, Plus } from "lucide-react"
import { Button } from "./ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command"
import { toast } from "./ui/use-toast"
import { cn } from "@/lib/utils"
import { createClient } from "../lib/supabase/client"
import { ADS_LANGUAGE_ID_TO_PROJECT_CODE } from "../lib/keyword-ideas-metrics"
import type { KeywordIdea } from "../hooks/useKeywordPlanner"

type ProjectOption = {
  id: number
  name: string
  color?: string | null
  logo?: string | null
}

type AddKeywordToProjectPopoverProps = {
  keyword: KeywordIdea
  languageId: string
  regionId: string
  preferredProjectId?: number | null
  disabled?: boolean
  className?: string
}

export function AddKeywordToProjectPopover({
  keyword,
  languageId,
  regionId,
  preferredProjectId = null,
  disabled = false,
  className,
}: AddKeywordToProjectPopoverProps) {
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClient(), [])
  const functionsClient = useMemo(() => createClientComponentClient(), [])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null)

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ["projects-minimal"],
    queryFn: async (): Promise<ProjectOption[]> => {
      const { data, error } = await (supabase as any)
        .from("v_projects_minimal")
        .select("id, name, color, logo")
        .order("name")
      if (error) throw error
      return ((data ?? []) as ProjectOption[])
        .filter((row): row is ProjectOption => typeof row?.id === "number" && Boolean(row?.name))
        .map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color ?? null,
          logo: row.logo ?? null,
        }))
    },
    enabled: open,
    staleTime: 60_000,
  })

  const sortedProjects = useMemo(() => {
    if (!preferredProjectId) return projects
    return [...projects].sort((a, b) => {
      if (a.id === preferredProjectId) return -1
      if (b.id === preferredProjectId) return 1
      return a.name.localeCompare(b.name)
    })
  }, [preferredProjectId, projects])

  const addToProject = async (projectId: number) => {
    const term = keyword.keyword.trim()
    if (!term || isSaving) return

    setIsSaving(true)
    try {
      const languageCode = ADS_LANGUAGE_ID_TO_PROJECT_CODE[languageId] ?? ""
      const regionCode = regionId.trim()

      const { error } = await (supabase as any).rpc("fn_add_project_keyword", {
        p_project_id: projectId,
        p_keyword: term,
        p_language_code: languageCode,
        p_region_code: regionCode,
      })

      if (error) throw error

      setSavedProjectId(projectId)
      toast({
        title: "Keyword added",
        description: "Checking rankings for this project…",
      })

      const { error: fnError } = await functionsClient.functions.invoke(
        "sync-project-keyword-rankings",
        { body: { project_id: projectId } },
      )

      await queryClient.invalidateQueries({
        queryKey: ["project-keywords", projectId],
      })

      if (fnError) {
        console.error("Keyword rankings sync after add failed:", fnError)
        toast({
          title: "Keyword added, but rankings not updated",
          description: "The ranking check failed. Please try ‘Check rankings now’.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Keyword added and rankings updated",
          description: "Latest rankings have been fetched for this project.",
        })
      }

      window.setTimeout(() => setOpen(false), 450)
    } catch (error: any) {
      toast({
        title: "Error adding keyword",
        description: error?.message || "Failed to add keyword.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setSearch("")
          setSavedProjectId(null)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || isSaving}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "h-7 w-7 p-0 text-gray-400 hover:text-gray-900",
            className,
          )}
          title="Add to project keywords"
          aria-label={`Add ${keyword.keyword} to project keywords`}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(92vw,18rem)] p-0"
        align="end"
        onClick={(event) => event.stopPropagation()}
      >
        <Command>
          <CommandInput
            placeholder="Search projects..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[220px]">
            {isLoadingProjects ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading projects…
              </div>
            ) : (
              <>
                <CommandEmpty>No projects found.</CommandEmpty>
                <CommandGroup>
                  {sortedProjects.map((project) => {
                    const isJustSaved = savedProjectId === project.id
                    const isPreferred = preferredProjectId === project.id
                    return (
                      <CommandItem
                        key={project.id}
                        value={project.name}
                        disabled={isSaving}
                        onSelect={() => {
                          void addToProject(project.id)
                        }}
                      >
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <div className="flex h-4 w-4 items-center justify-center">
                            <Check
                              className={cn(
                                "h-4 w-4",
                                isJustSaved ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </div>
                          {project.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={project.logo}
                              alt=""
                              className="h-4 w-4 shrink-0 rounded-sm object-cover"
                            />
                          ) : (
                            <span
                              className="h-4 w-4 shrink-0 rounded-sm"
                              style={{
                                backgroundColor: project.color || "#e5e7eb",
                              }}
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          {isPreferred ? (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
                              Open
                            </span>
                          ) : null}
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
