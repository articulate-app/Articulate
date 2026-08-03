"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, Loader2, Plus, X } from "lucide-react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { toast } from "../ui/use-toast"
import { useTaskChannelList, type TaskChannelRow } from "@/hooks/use-task-channel-list"
import { cn } from "@/lib/utils"
import { ProjectChannelsManager } from "../projects/OverviewConfigDropdowns"

type TaskOverviewChannelsPillProps = {
  taskId: number
  projectId?: number | null
  bootstrapTaskChannels?: unknown
  preferredChannelId?: number | null
  onChannelChange?: (channelId: number | null) => void
  className?: string
  /** `field` = overview grid row (Select-like). `pill` = compact header trigger. */
  variant?: "pill" | "field"
}

/**
 * Compact multi-select channels control for task overview (task_channels).
 * Field variant matches other overview Select triggers; chips live inside the dropdown.
 */
export function TaskOverviewChannelsPill({
  taskId,
  projectId = null,
  bootstrapTaskChannels,
  preferredChannelId = null,
  onChannelChange,
  className,
  variant = "pill",
}: TaskOverviewChannelsPillProps) {
  const supabase = createClientComponentClient()
  const {
    channels,
    setChannels,
    selectedChannelId,
    setSelectedChannelId,
    isLoading,
  } = useTaskChannelList({
    taskId,
    bootstrapTaskChannels,
    skipInitialTaskChannelsFetch: bootstrapTaskChannels != null,
    preferredChannelId,
    onChannelChange,
  })

  const [availableChannels, setAvailableChannels] = useState<TaskChannelRow[]>([])
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set())
  const [isOpen, setIsOpen] = useState(false)
  const [isManageOpen, setIsManageOpen] = useState(false)

  const fetchAvailableChannels = useCallback(async () => {
    if (!projectId) {
      const { data, error } = await supabase.from("channels").select("id, name").order("name")
      if (error) throw error
      const attached = new Set(channels.map((c) => c.channel_id))
      setAvailableChannels(
        ((data ?? []) as any[])
          .map((row) => ({ channel_id: Number(row.id), name: String(row.name ?? "") }))
          .filter((row) => Number.isFinite(row.channel_id) && !attached.has(row.channel_id)),
      )
      return
    }
    const { data, error } = await supabase
      .from("project_channels")
      .select("channel_id, channels!inner(id, name)")
      .eq("project_id", projectId)
    if (error) throw error
    const attached = new Set(channels.map((c) => c.channel_id))
    setAvailableChannels(
      ((data ?? []) as any[])
        .map((row) => {
          const channel = Array.isArray(row.channels) ? row.channels[0] : row.channels
          return {
            channel_id: Number(row.channel_id ?? channel?.id),
            name: String(channel?.name ?? ""),
          }
        })
        .filter((row) => Number.isFinite(row.channel_id) && !attached.has(row.channel_id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
  }, [channels, projectId, supabase])

  useEffect(() => {
    if (!isOpen) return
    void fetchAvailableChannels().catch(() => setAvailableChannels([]))
  }, [isOpen, fetchAvailableChannels])

  const handleAddChannel = async (channelId: number) => {
    const meta = availableChannels.find((c) => c.channel_id === channelId)
    if (!meta) return
    const previous = channels
    const previousAvailable = availableChannels
    // Optimistic: update attached list + remove from available before the network round-trip.
    setChannels((prev) =>
      prev.some((c) => c.channel_id === channelId)
        ? prev
        : [...prev, meta].sort((a, b) => a.name.localeCompare(b.name)),
    )
    setAvailableChannels((prev) => prev.filter((c) => c.channel_id !== channelId))
    setSelectedChannelId(channelId)
    onChannelChange?.(channelId)
    try {
      const { error } = await supabase.from("task_channels").insert({
        task_id: taskId,
        channel_id: channelId,
      })
      if (error) throw error
    } catch (err: any) {
      setChannels(previous)
      setAvailableChannels(previousAvailable)
      toast({
        title: "Failed to add channel",
        description: err?.message ?? "Could not add channel.",
        variant: "destructive",
      })
    }
  }

  const handleRemoveChannel = async (channelId: number) => {
    const previous = channels
    const previousSelected = selectedChannelId
    const remaining = channels.filter((c) => c.channel_id !== channelId)
    const nextActive =
      selectedChannelId === channelId ? (remaining[0]?.channel_id ?? null) : selectedChannelId
    setRemovingIds((prev) => new Set(prev).add(channelId))
    setChannels(remaining)
    if (selectedChannelId === channelId) {
      setSelectedChannelId(nextActive)
      onChannelChange?.(nextActive)
    }
    try {
      const { error } = await supabase
        .from("task_channels")
        .delete()
        .eq("task_id", taskId)
        .eq("channel_id", channelId)
      if (error) throw error
    } catch (err: any) {
      setChannels(previous)
      setSelectedChannelId(previousSelected)
      onChannelChange?.(previousSelected)
      toast({
        title: "Failed to remove channel",
        description: err?.message ?? "Could not remove channel.",
        variant: "destructive",
      })
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(channelId)
        return next
      })
    }
  }

  const triggerLabel = useMemo(() => {
    if (isLoading) return "Loading…"
    if (channels.length === 0) return "Select channels"
    if (channels.length === 1) return channels[0].name
    if (channels.length === 2) return `${channels[0].name}, ${channels[1].name}`
    return `${channels[0].name} +${channels.length - 1}`
  }, [channels, isLoading])

  const channelChips = (
    <div className="flex flex-wrap items-center gap-1">
      {channels.map((channel) => (
        <span
          key={channel.channel_id}
          className={cn(
            "inline-flex h-5 items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 text-[11px] text-gray-600",
            selectedChannelId === channel.channel_id && "border-gray-300 text-gray-800",
            removingIds.has(channel.channel_id) && "opacity-60",
          )}
        >
          <button
            type="button"
            className="max-w-[9rem] truncate"
            onClick={() => {
              setSelectedChannelId(channel.channel_id)
              onChannelChange?.(channel.channel_id)
            }}
          >
            {channel.name}
          </button>
          <button
            type="button"
            className="p-0.5 text-gray-300 hover:text-gray-600"
            disabled={removingIds.has(channel.channel_id)}
            onClick={() => void handleRemoveChannel(channel.channel_id)}
            aria-label={`Remove ${channel.name}`}
          >
            {removingIds.has(channel.channel_id) ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <X className="h-2.5 w-2.5" />
            )}
          </button>
        </span>
      ))}
      {channels.length === 0 && !isLoading ? (
        <span className="text-xs text-gray-400">No channels yet.</span>
      ) : null}
    </div>
  )

  const dropdownBody = (
    <div className="space-y-2">
      {channelChips}
      <div className="border-t border-gray-100 pt-2">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
          Add channel
        </div>
        <div className="max-h-44 space-y-0.5 overflow-y-auto">
          {availableChannels.length > 0 ? (
            availableChannels.map((channel) => (
              <button
                key={channel.channel_id}
                type="button"
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => void handleAddChannel(channel.channel_id)}
              >
                <Plus className="h-3 w-3 text-gray-400" />
                {channel.name}
              </button>
            ))
          ) : (
            <p className="px-2 py-1.5 text-xs text-gray-500">No channels available to add.</p>
          )}
        </div>
        {projectId ? (
          <>
            <div className="my-1 border-t border-gray-100" />
            <button
              type="button"
              className="w-full rounded px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50"
              onClick={() => {
                setIsOpen(false)
                setIsManageOpen(true)
              }}
            >
              Manage project channels
            </button>
          </>
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          {variant === "field" ? (
            <button
              type="button"
              className={cn(
                "flex h-10 min-h-10 w-full min-w-0 items-center justify-between rounded-md border border-gray-200 bg-white px-3 text-sm leading-none text-gray-900 hover:bg-gray-50",
                className,
              )}
              title="Manage channels"
              aria-label="Manage channels"
            >
              <span
                className={cn(
                  "min-w-0 truncate text-left font-normal",
                  channels.length === 0 && "text-gray-400",
                )}
              >
                {triggerLabel}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-gray-400 opacity-60" />
            </button>
          ) : (
            <button
              type="button"
              className={cn(
                "inline-flex h-5 max-w-[11rem] shrink-0 items-center gap-1 overflow-hidden rounded-full border border-gray-200 bg-white px-2 text-[10px] font-medium text-gray-700 hover:bg-gray-50",
                className,
              )}
              title="Manage channels"
              aria-label="Manage channels"
            >
              <span className="min-w-0 truncate">{triggerLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
            </button>
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn(
            "p-2",
            variant === "field" ? "w-[var(--radix-popover-trigger-width)] min-w-[16rem]" : "w-[min(92vw,18rem)]",
          )}
        >
          {dropdownBody}
        </PopoverContent>
      </Popover>
      {projectId != null ? (
        <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Manage project channels</DialogTitle>
            </DialogHeader>
            <ProjectChannelsManager
              projectId={projectId}
              variant="list"
              onChannelsChanged={() => {
                void fetchAvailableChannels().catch(() => undefined)
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
