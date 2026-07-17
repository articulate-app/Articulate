"use client"

import { type ReactNode, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Check, ChevronDown, Loader2, Lock, Plus } from "lucide-react"

import { UserAvatar } from "../UserAvatar"
import { Button } from "../ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { cn } from "@/lib/utils"
import { getImageUrl } from "../../lib/public-media"
import { toast } from "../ui/use-toast"

type RowOption = {
  id: number
  label: string
  subtitle?: string | null
  photo?: string | null
}

type AddPayload = {
  value: string
  code?: string
}

function summarizeLabels(labels: string[], max = 2) {
  if (labels.length === 0) return "None"
  if (labels.length <= max) return labels.join(", ")
  return `${labels.slice(0, max).join(", ")} +${labels.length - max}`
}

function DropdownRow({
  label,
  selectedSummary,
  options,
  selectedIds,
  onToggle,
  onPinnedAdd,
  isSelectionEnabled = true,
  addLabel,
  addVariant = "single",
  hideOptionsWhenAdding = false,
  showAvatars = false,
  readOnlyEntries,
  disabled = false,
}: {
  label: string
  selectedSummary: ReactNode
  options: RowOption[]
  selectedIds: Set<number>
  onToggle: (id: number, selected: boolean) => void | Promise<void>
  onPinnedAdd: (payload: AddPayload) => boolean | Promise<boolean>
  isSelectionEnabled?: boolean
  addLabel: string
  addVariant?: "single" | "language"
  hideOptionsWhenAdding?: boolean
  showAvatars?: boolean
  /** Non-editable entries shown at the bottom of the list (e.g. watchers the current user cannot manage). */
  readOnlyEntries?: RowOption[]
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isAddInlineOpen, setIsAddInlineOpen] = useState(false)
  const [addDraft, setAddDraft] = useState("")
  const [addCodeDraft, setAddCodeDraft] = useState("")

  const handleSaveAdd = async () => {
    const ok = await onPinnedAdd({
      value: addDraft.trim(),
      code: addCodeDraft.trim(),
    })
    if (ok) {
      setAddDraft("")
      setAddCodeDraft("")
      setIsAddInlineOpen(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-900">{label}</Label>
      <div className="w-full">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-700 transition hover:border-gray-300",
                disabled && "pointer-events-none opacity-60",
              )}
              aria-label={`Select ${label}`}
            >
              <div className="min-w-0 flex-1 truncate text-left">{selectedSummary}</div>
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(92vw,28rem)] p-0" align="end">
            <Command>
              {!(isAddInlineOpen && hideOptionsWhenAdding) ? (
                <>
                  <CommandInput
                    placeholder={`Search ${label.toLowerCase()}...`}
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList className="max-h-[280px]">
                    <CommandEmpty>No options found.</CommandEmpty>
                    <CommandGroup>
                      {options.map((opt) => {
                        const isSelected = selectedIds.has(opt.id)
                        return (
                          <CommandItem
                            key={opt.id}
                            value={`${opt.label} ${opt.subtitle ?? ""}`}
                            onSelect={() => {
                              if (!isSelectionEnabled) return
                              onToggle(opt.id, !isSelected)
                            }}
                            className={cn(!isSelectionEnabled && "pointer-events-none opacity-60")}
                          >
                            <div className="flex w-full min-w-0 items-center gap-2">
                              <div className="flex h-4 w-4 items-center justify-center">
                                <Check className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                              </div>
                              {showAvatars ? (
                                <UserAvatar
                                  name={opt.label}
                                  photoUrl={opt.photo ? getImageUrl(opt.photo) : null}
                                  size="xs"
                                />
                              ) : null}
                              <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                            </div>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                    {readOnlyEntries && readOnlyEntries.length > 0 ? (
                      <CommandGroup heading="Managed elsewhere">
                        {readOnlyEntries.map((entry) => (
                          <CommandItem
                            key={`readonly-${entry.id}`}
                            value={`readonly ${entry.label} ${entry.subtitle ?? ""}`}
                            disabled
                            className="pointer-events-none opacity-60"
                          >
                            <div className="flex w-full min-w-0 items-center gap-2">
                              <div className="flex h-4 w-4 items-center justify-center">
                                <Lock className="h-3.5 w-3.5 text-gray-400" />
                              </div>
                              {showAvatars ? (
                                <UserAvatar
                                  name={entry.label}
                                  photoUrl={entry.photo ? getImageUrl(entry.photo) : null}
                                  size="xs"
                                />
                              ) : null}
                              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ) : null}
                  </CommandList>
                </>
              ) : null}
              <div className="border-t border-gray-200 p-1">
                {!isAddInlineOpen ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-full justify-start px-2 text-gray-600 hover:text-gray-900"
                    onClick={() => {
                      setAddDraft(search)
                      setAddCodeDraft("")
                      setIsAddInlineOpen(true)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {addLabel}
                  </Button>
                ) : (
                  <div className="space-y-2 p-2">
                    <Input
                      value={addDraft}
                      onChange={(event) => setAddDraft(event.target.value)}
                      placeholder={
                        addVariant === "language" ? "Language name (e.g. Portuguese)" : `Type ${label.toLowerCase()}...`
                      }
                      className="h-8"
                    />
                    {addVariant === "language" ? (
                      <Input
                        value={addCodeDraft}
                        onChange={(event) => setAddCodeDraft(event.target.value.toUpperCase())}
                        placeholder="Language code (e.g. PT)"
                        className="h-8"
                        maxLength={8}
                      />
                    ) : null}
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                          setIsAddInlineOpen(false)
                          setAddDraft("")
                          setAddCodeDraft("")
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 px-2"
                        onClick={handleSaveAdd}
                        disabled={!addDraft.trim() || (addVariant === "language" && !addCodeDraft.trim())}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

type ProjectChannelsQueryData = {
  selected: Array<{ channel_id: number; name: string | null; is_enabled: boolean | null }>
  all: Array<{ id: number; name: string }>
}

/**
 * Self-contained "Project Channels" management UI (query + mutation).
 * Single source of truth shared by the project Overview pane and any modal that needs
 * to manage a project's channels (e.g. opened from Task Details).
 *
 * - `variant="dropdown"` (default): compact labeled row + popover used in the Overview pane.
 * - `variant="list"`: direct list of every channel with a per-row Add/Added action, used in
 *   the "Manage project channels" modal opened from Task Details.
 */
export function ProjectChannelsManager({
  projectId,
  disabled = false,
  variant = "dropdown",
  onChannelsChanged,
}: {
  projectId: number
  disabled?: boolean
  variant?: "dropdown" | "list"
  onChannelsChanged?: () => void
}) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()
  const channelsQueryKey = ["overview-project-channels", projectId] as const
  const [pendingChannelIds, setPendingChannelIds] = useState<Set<number>>(() => new Set())

  const { data: channelsData, isLoading: channelsLoading } = useQuery<ProjectChannelsQueryData>({
    queryKey: channelsQueryKey,
    queryFn: async () => {
      const [projectChannelsRes, allChannelsRes] = await Promise.all([
        supabase
          .from("v_project_channels_resolved")
          .select("channel_id, name, is_enabled")
          .eq("project_id", projectId),
        supabase.from("channels").select("id, name").order("name"),
      ])
      if (projectChannelsRes.error) throw projectChannelsRes.error
      if (allChannelsRes.error) throw allChannelsRes.error
      return {
        selected: (projectChannelsRes.data ?? []) as ProjectChannelsQueryData["selected"],
        all: (allChannelsRes.data ?? []) as ProjectChannelsQueryData["all"],
      }
    },
  })

  const channelsMutation = useMutation({
    mutationFn: async ({ channelId, selected }: { channelId: number; selected: boolean }) => {
      if (selected) {
        const { error } = await supabase.rpc("project_channel_set", {
          p_project_id: projectId,
          p_channel_id: channelId,
          p_is_enabled: true,
        })
        if (error) throw error
        return
      }
      const { error } = await supabase.rpc("project_channel_set", {
        p_project_id: projectId,
        p_channel_id: channelId,
        p_is_enabled: false,
      })
      if (error) throw error
    },
    onMutate: async ({ channelId, selected }) => {
      setPendingChannelIds((prev) => {
        const next = new Set(prev)
        next.add(channelId)
        return next
      })
      await queryClient.cancelQueries({ queryKey: channelsQueryKey })
      const previous = queryClient.getQueryData<ProjectChannelsQueryData>(channelsQueryKey)
      queryClient.setQueryData<ProjectChannelsQueryData>(channelsQueryKey, (old) => {
        if (!old) return old
        const name = old.all.find((channel) => channel.id === channelId)?.name ?? null
        const selectedArr = old.selected.slice()
        const idx = selectedArr.findIndex((channel) => channel.channel_id === channelId)
        if (idx >= 0) {
          selectedArr[idx] = { ...selectedArr[idx], is_enabled: selected }
        } else if (selected) {
          selectedArr.push({ channel_id: channelId, name, is_enabled: true })
        }
        return { ...old, selected: selectedArr }
      })
      return { previous }
    },
    onError: (error: any, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(channelsQueryKey, context.previous)
      }
      toast({ title: "Error", description: error?.message ?? "Failed to update channels", variant: "destructive" })
    },
    onSettled: (_data, _error, variables) => {
      setPendingChannelIds((prev) => {
        const next = new Set(prev)
        next.delete(variables.channelId)
        return next
      })
      queryClient.invalidateQueries({ queryKey: channelsQueryKey })
      onChannelsChanged?.()
    },
  })

  const channelOptions = useMemo<RowOption[]>(
    () => (channelsData?.all ?? []).map((channel) => ({ id: channel.id, label: channel.name })),
    [channelsData?.all],
  )
  const channelSelectedIds = useMemo(
    () =>
      new Set<number>(
        (channelsData?.selected ?? [])
          .filter((channel) => channel.is_enabled !== false)
          .map((channel) => channel.channel_id),
      ),
    [channelsData?.selected],
  )

  if (variant === "list") {
    if (channelsLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )
    }

    const allChannels = channelsData?.all ?? []
    if (allChannels.length === 0) {
      return <p className="py-6 text-center text-sm text-gray-500">No channels available.</p>
    }

    return (
      <div className="-mx-1 max-h-[60vh] overflow-y-auto">
        <ul className="divide-y divide-gray-100">
          {allChannels.map((channel) => {
            const isEnabled = channelSelectedIds.has(channel.id)
            const isRowPending = pendingChannelIds.has(channel.id)
            return (
              <li key={channel.id} className="flex items-center justify-between gap-3 px-1 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{channel.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant={isEnabled ? "ghost" : "outline"}
                  className={cn(
                    "h-7 min-w-[76px] justify-center text-sm",
                    isEnabled ? "text-gray-500 hover:text-gray-900" : "text-gray-700",
                  )}
                  disabled={disabled || isRowPending}
                  onClick={() => channelsMutation.mutate({ channelId: channel.id, selected: !isEnabled })}
                >
                  {isRowPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isEnabled ? (
                    "Added"
                  ) : (
                    "Add"
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const isBusy = disabled || channelsLoading || channelsMutation.isPending

  return (
    <DropdownRow
      label="Project Channels"
      selectedSummary={summarizeLabels(
        channelOptions.filter((option) => channelSelectedIds.has(option.id)).map((option) => option.label),
      )}
      options={channelOptions}
      selectedIds={channelSelectedIds}
      onToggle={(id, selected) => channelsMutation.mutate({ channelId: id, selected })}
      onPinnedAdd={async ({ value }) => {
        const nextName = value.trim()
        if (!nextName) return false

        const existing = channelOptions.find((option) => option.label.toLowerCase() === nextName.toLowerCase())
        if (existing) {
          channelsMutation.mutate({ channelId: existing.id, selected: true })
          return true
        }

        const { data: inserted, error: insertError } = await supabase
          .from("channels")
          .insert({ name: nextName })
          .select("id")
          .single()
        if (insertError || !inserted) {
          toast({ title: "Error", description: insertError?.message || "Failed to create channel", variant: "destructive" })
          return false
        }

        const { error: assignError } = await supabase.rpc("project_channel_set", {
          p_project_id: projectId,
          p_channel_id: inserted.id,
          p_is_enabled: true,
        })
        if (assignError) {
          toast({ title: "Error", description: assignError.message, variant: "destructive" })
          return false
        }

        queryClient.invalidateQueries({ queryKey: channelsQueryKey })
        onChannelsChanged?.()
        return true
      }}
      addLabel="Add channel"
      hideOptionsWhenAdding
      disabled={isBusy}
    />
  )
}

export function OverviewConfigDropdowns({ projectId }: { projectId: number }) {
  const supabase = createClientComponentClient()
  const queryClient = useQueryClient()

  const { data: languagesData, isLoading: languagesLoading } = useQuery({
    queryKey: ["overview-project-languages", projectId],
    queryFn: async () => {
      const [projectLanguagesRes, allLanguagesRes] = await Promise.all([
        supabase
          .from("project_languages")
          .select("language_id, is_deleted, languages!inner(id, code, long_name)")
          .eq("project_id", projectId)
          .is("is_deleted", false),
        supabase.from("languages").select("id, code, long_name").order("long_name"),
      ])
      if (projectLanguagesRes.error) throw projectLanguagesRes.error
      if (allLanguagesRes.error) throw allLanguagesRes.error
      return {
        selected: (projectLanguagesRes.data ?? []) as unknown as Array<{
          language_id: number
          languages: { id: number; code: string; long_name: string }
        }>,
        all: (allLanguagesRes.data ?? []) as Array<{ id: number; code: string; long_name: string }>,
      }
    },
  })

  const { data: contentTypesData, isLoading: contentTypesLoading } = useQuery({
    queryKey: ["overview-project-content-types", projectId],
    queryFn: async () => {
      const [enabledRes, allRes] = await Promise.all([
        supabase
          .from("project_content_type_settings")
          .select("content_type_id")
          .eq("project_id", projectId),
        supabase.from("content_types").select("id, title").order("title"),
      ])
      if (enabledRes.error) throw enabledRes.error
      if (allRes.error) throw allRes.error
      return {
        selectedIds: new Set<number>((enabledRes.data ?? []).map((row: any) => row.content_type_id)),
        all: (allRes.data ?? []) as Array<{ id: number; title: string }>,
      }
    },
  })

  const assignLanguageToProject = async (languageId: number) => {
    const { data: existing, error: existingError } = await supabase
      .from("project_languages")
      .select("language_id, is_deleted")
      .eq("project_id", projectId)
      .eq("language_id", languageId)
      .maybeSingle()

    if (existingError) throw existingError

    if (!existing) {
      const { error } = await supabase.from("project_languages").insert({
        project_id: projectId,
        language_id: languageId,
        is_primary: false,
        is_deleted: false,
      })
      if (error) throw error
      return
    }

    if (existing.is_deleted) {
      const { error } = await supabase
        .from("project_languages")
        .update({ is_deleted: false })
        .eq("project_id", projectId)
        .eq("language_id", languageId)
      if (error) throw error
    }
  }

  const languagesMutation = useMutation({
    mutationFn: async ({ languageId, selected }: { languageId: number; selected: boolean }) => {
      if (selected) {
        const { error } = await supabase.from("project_languages").insert({
          project_id: projectId,
          language_id: languageId,
          is_primary: false,
          is_deleted: false,
        })
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from("project_languages")
        .update({ is_deleted: true })
        .eq("project_id", projectId)
        .eq("language_id", languageId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overview-project-languages", projectId] })
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message ?? "Failed to update languages", variant: "destructive" })
    },
  })

  const contentTypesMutation = useMutation({
    mutationFn: async ({ contentTypeId, selected }: { contentTypeId: number; selected: boolean }) => {
      if (selected) {
        const { error } = await supabase.from("project_content_type_settings").upsert({
          project_id: projectId,
          content_type_id: contentTypeId,
        })
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from("project_content_type_settings")
        .delete()
        .eq("project_id", projectId)
        .eq("content_type_id", contentTypeId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overview-project-content-types", projectId] })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message ?? "Failed to update content types",
        variant: "destructive",
      })
    },
  })

  const languageOptions = useMemo<RowOption[]>(
    () =>
      (languagesData?.all ?? []).map((language) => ({
        id: language.id,
        label: `${language.long_name} (${language.code})`,
      })),
    [languagesData?.all],
  )
  const languageSelectedIds = useMemo(
    () => new Set<number>((languagesData?.selected ?? []).map((language) => language.language_id)),
    [languagesData?.selected],
  )

  const contentTypeOptions = useMemo<RowOption[]>(
    () => (contentTypesData?.all ?? []).map((contentType) => ({ id: contentType.id, label: contentType.title })),
    [contentTypesData?.all],
  )
  const contentTypeSelectedIds = useMemo(
    () => contentTypesData?.selectedIds ?? new Set<number>(),
    [contentTypesData?.selectedIds],
  )

  const isBusy =
    languagesLoading ||
    contentTypesLoading ||
    languagesMutation.isPending ||
    contentTypesMutation.isPending

  if (languagesLoading || contentTypesLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6 py-1">
      <ProjectChannelsManager projectId={projectId} />

      <DropdownRow
        label="Languages"
        selectedSummary={summarizeLabels(
          languageOptions.filter((option) => languageSelectedIds.has(option.id)).map((option) => option.label),
        )}
        options={languageOptions}
        selectedIds={languageSelectedIds}
        onToggle={(id, selected) => languagesMutation.mutate({ languageId: id, selected })}
        onPinnedAdd={async ({ value, code }) => {
          const nextName = value.trim()
          const nextCode = (code || "").trim().toUpperCase()
          if (!nextName || !nextCode) return false

          const existing = (languagesData?.all ?? []).find(
            (language) =>
              language.long_name.toLowerCase() === nextName.toLowerCase() ||
              language.code.toLowerCase() === nextCode.toLowerCase(),
          )
          if (existing) {
            await assignLanguageToProject(existing.id)
            queryClient.invalidateQueries({ queryKey: ["overview-project-languages", projectId] })
            return true
          }

          const { data: inserted, error: insertError } = await supabase
            .from("languages")
            .insert({
              long_name: nextName,
              code: nextCode,
            })
            .select("id")
            .single()

          if (insertError || !inserted) {
            toast({ title: "Error", description: insertError?.message || "Failed to create language", variant: "destructive" })
            return false
          }

          await assignLanguageToProject(inserted.id)
          queryClient.invalidateQueries({ queryKey: ["overview-project-languages", projectId] })
          return true
        }}
        addLabel="Add language"
        addVariant="language"
        hideOptionsWhenAdding
        disabled={isBusy}
      />

      <DropdownRow
        label="Content Types"
        selectedSummary={summarizeLabels(
          contentTypeOptions.filter((option) => contentTypeSelectedIds.has(option.id)).map((option) => option.label),
        )}
        options={contentTypeOptions}
        selectedIds={contentTypeSelectedIds}
        onToggle={(id, selected) => contentTypesMutation.mutate({ contentTypeId: id, selected })}
        onPinnedAdd={async ({ value }) => {
          const nextTitle = value.trim()
          if (!nextTitle) return false

          const existing = (contentTypesData?.all ?? []).find(
            (contentType) => contentType.title.toLowerCase() === nextTitle.toLowerCase(),
          )

          let contentTypeId = existing?.id ?? null
          if (!contentTypeId) {
            const { data: inserted, error: insertError } = await supabase
              .from("content_types")
              .insert({ title: nextTitle })
              .select("id")
              .single()
            if (insertError || !inserted) {
              toast({ title: "Error", description: insertError?.message || "Failed to create content type", variant: "destructive" })
              return false
            }
            contentTypeId = inserted.id
          }

          if (!contentTypeId) {
            toast({ title: "Error", description: "Failed to create content type", variant: "destructive" })
            return false
          }

          const { error: assignError } = await supabase.from("project_content_type_settings").upsert({
            project_id: projectId,
            content_type_id: contentTypeId,
          })
          if (assignError) {
            toast({ title: "Error", description: assignError.message, variant: "destructive" })
            return false
          }

          queryClient.invalidateQueries({ queryKey: ["overview-project-content-types", projectId] })
          return true
        }}
        addLabel="Add content type"
        hideOptionsWhenAdding
        disabled={isBusy}
      />
    </div>
  )
}
