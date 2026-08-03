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

type ProjectOption = {
  id: number
  name: string
  color?: string | null
  logo?: string | null
}

type AddPromptToProjectPopoverProps = {
  prompt: string
  languageCode?: string | null
  preferredProjectId?: number | null
  disabled?: boolean
  className?: string
}

export function AddPromptToProjectPopover({
  prompt,
  languageCode = "pt",
  preferredProjectId = null,
  disabled = false,
  className,
}: AddPromptToProjectPopoverProps) {
  const queryClient = useQueryClient()
  const supabase = useMemo(() => createClientComponentClient(), [])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [savedProjectId, setSavedProjectId] = useState<number | null>(null)

  const { data: projects = [], isLoading: isLoadingProjects } = useQuery({
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

  const { data: chatGptToolId = null } = useQuery({
    queryKey: ["ai-tools-chatgpt-id"],
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from("ai_tools")
        .select("id")
        .eq("code", "CHATGPT")
        .eq("is_active", true)
        .maybeSingle()
      if (error) throw error
      return data?.id != null ? Number(data.id) : null
    },
    staleTime: 5 * 60_000,
  })

  const sortedProjects = useMemo(() => {
    if (!preferredProjectId) return projects
    return [...projects].sort((a, b) => {
      if (a.id === preferredProjectId) return -1
      if (b.id === preferredProjectId) return 1
      return a.name.localeCompare(b.name)
    })
  }, [preferredProjectId, projects])

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedProjects
    return sortedProjects.filter((project) => project.name.toLowerCase().includes(q))
  }, [search, sortedProjects])

  const handleSelect = async (projectId: number) => {
    const trimmed = prompt.trim()
    if (!trimmed || isSaving) return
    if (!chatGptToolId) {
      toast({
        title: "ChatGPT tool missing",
        description: "Could not find an active ChatGPT tracking tool.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const { data: promptInsert, error: promptError } = await (supabase as any).rpc(
        "fn_add_project_ai_prompt",
        {
          p_project_id: projectId,
          p_prompt_text: trimmed,
          p_notes: null,
        },
      )
      if (promptError || !promptInsert) {
        throw promptError || new Error("Failed to create AI prompt.")
      }

      const promptId = Number((promptInsert as any).id)
      const { error: toolsError } = await (supabase as any)
        .from("project_ai_prompt_tools")
        .insert({
          project_ai_prompt_id: promptId,
          ai_tool_id: chatGptToolId,
        })
      if (toolsError) throw toolsError

      // Best-effort: persist language when column exists.
      if (languageCode) {
        await (supabase as any)
          .from("project_ai_prompts")
          .update({ language_code: languageCode })
          .eq("id", promptId)
      }

      const { error: syncError } = await supabase.functions.invoke(
        "sync-project-ai-prompts",
        { body: { project_id: projectId } },
      )
      if (syncError) {
        console.warn("Prompt saved but sync failed:", syncError)
      }

      setSavedProjectId(projectId)
      void queryClient.invalidateQueries({ queryKey: ["project-ai-prompts", projectId] })
      toast({
        title: "Prompt saved",
        description: "Added to project AI visibility and sync started.",
      })
      setTimeout(() => {
        setOpen(false)
        setSavedProjectId(null)
        setSearch("")
      }, 900)
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Could not save prompt to project.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || !prompt.trim()}
          className={cn(
            "h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-900",
            className,
          )}
          aria-label="Save prompt to project"
          title="Save to project"
        >
          {savedProjectId != null ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search projects…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isLoadingProjects ? "Loading projects…" : "No projects found."}
            </CommandEmpty>
            <CommandGroup heading="Save to AI visibility">
              {filteredProjects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={String(project.id)}
                  disabled={isSaving}
                  onSelect={() => void handleSelect(project.id)}
                >
                  <span className="truncate">{project.name}</span>
                  {isSaving && savedProjectId === project.id ? (
                    <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
                  ) : savedProjectId === project.id ? (
                    <Check className="ml-auto h-3.5 w-3.5 text-emerald-600" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
