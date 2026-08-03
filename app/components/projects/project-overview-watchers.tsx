"use client"

import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import { ExternalLink, Loader2, UserPlus, X } from "lucide-react"

import { UserAvatar } from "../UserAvatar"
import { Button } from "../ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { TaskOverviewPreviewSection } from "../tasks/task-overview-preview-section"
import { cn } from "@/lib/utils"
import { getImageUrl } from "../../lib/public-media"
import { toast } from "../ui/use-toast"
import { buildCenterPaneSelectionSearchParams } from "../../lib/center-pane-selection-url"
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav"
import {
  getProjectWatcherCandidates,
  getProjectWatchersCurrent,
  setProjectWatchers,
  type ProjectWatcherCandidate,
  type ProjectWatcherCurrent,
} from "../../lib/services/projects-briefing"

interface ProjectOverviewWatchersProps {
  projectId: number
}

export function ProjectOverviewWatchers({ projectId }: ProjectOverviewWatchersProps) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const [isAddOpen, setIsAddOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["overview-project-watchers", projectId],
    queryFn: async () => {
      const [candidatesRes, currentRes] = await Promise.all([
        getProjectWatcherCandidates(projectId),
        getProjectWatchersCurrent(projectId),
      ])
      if (candidatesRes.error) throw candidatesRes.error
      if (currentRes.error) throw currentRes.error
      return {
        candidates: (candidatesRes.data ?? []) as ProjectWatcherCandidate[],
        current: (currentRes.data ?? []) as ProjectWatcherCurrent[],
      }
    },
  })

  const watchersMutation = useMutation({
    mutationFn: async (nextSelectedUserIds: number[]) => {
      const { error } = await setProjectWatchers(projectId, nextSelectedUserIds)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["overview-project-watchers", projectId] })
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message ?? "Failed to update watchers",
        variant: "destructive",
      })
    },
  })

  const currentWatchers = useMemo(() => data?.current ?? [], [data?.current])
  const selectedIds = useMemo(
    () =>
      new Set<number>(
        (data?.candidates ?? []).filter((candidate) => candidate.is_watcher).map((candidate) => candidate.user_id),
      ),
    [data?.candidates],
  )

  const addableUsers = useMemo(() => {
    return (data?.candidates ?? []).filter((candidate) => !candidate.is_watcher)
  }, [data?.candidates])

  const handleToggle = useCallback(
    (userId: number) => {
      if (watchersMutation.isPending) return
      const next = new Set(selectedIds)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      watchersMutation.mutate(Array.from(next))
    },
    [selectedIds, watchersMutation],
  )

  const handleOpenProfile = useCallback(
    (userId: number) => {
      setIsAddOpen(false)
      const base = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      )
      const next = buildCenterPaneSelectionSearchParams({
        currentSearchParams: base,
        entity: "user",
        id: userId,
      })
      next.delete("stackTaskId")
      next.delete("stackUserId")
      next.delete("stackTeamId")
      shallowReplaceSearchParams(pathname, next, "project-overview-watcher-open")
    },
    [pathname],
  )

  const addPopover = (
    <Popover open={isAddOpen} onOpenChange={setIsAddOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={watchersMutation.isPending}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add watcher
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(90vw,20rem)] p-0" align="end">
        <Command>
          <CommandInput
            placeholder="Search project users…"
            disabled={watchersMutation.isPending}
          />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>No users found</CommandEmpty>
            <CommandGroup>
              {addableUsers.map((user) => {
                const displayName = user.full_name || user.email || `User #${user.user_id}`
                return (
                  <CommandItem
                    key={user.user_id}
                    value={`${user.full_name ?? ""} ${user.email ?? ""} ${user.user_id}`}
                    className={cn(
                      "cursor-pointer",
                      watchersMutation.isPending && "pointer-events-none opacity-50",
                    )}
                    onSelect={() => {
                      handleToggle(user.user_id)
                      setIsAddOpen(false)
                    }}
                  >
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <UserAvatar
                        name={displayName}
                        photoUrl={user.photo ? getImageUrl(user.photo) : null}
                        size="xs"
                      />
                      <span className="min-w-0 flex-1 truncate" title={displayName}>
                        {displayName}
                      </span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )

  return (
    <TaskOverviewPreviewSection title="Watchers" headerActions={addPopover}>
      {isLoading && currentWatchers.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : currentWatchers.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
          No watchers yet. Add someone to start watching this project.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {currentWatchers.map((watcher) => {
            const displayName = watcher.full_name || watcher.email || `User #${watcher.user_id}`
            const isManageable = watcher.is_manageable !== false
            return (
              <li
                key={watcher.watcher_id ?? watcher.user_id}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <UserAvatar
                  name={displayName}
                  photoUrl={watcher.photo ? getImageUrl(watcher.photo) : null}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">{displayName}</div>
                  {watcher.full_name && watcher.email ? (
                    <div className="truncate text-xs text-gray-500">{watcher.email}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  title={`Open ${displayName}`}
                  aria-label={`Open ${displayName}`}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  onClick={() => handleOpenProfile(watcher.user_id)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                {isManageable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove watcher"
                    aria-label={`Remove ${displayName}`}
                    disabled={watchersMutation.isPending}
                    onClick={() => handleToggle(watcher.user_id)}
                  >
                    {watchersMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </TaskOverviewPreviewSection>
  )
}
