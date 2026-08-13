"use client"

import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import { Loader2, UserPlus, X } from "lucide-react"

import { UserAvatar } from "../UserAvatar"
import { Button } from "../ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { cn } from "@/lib/utils"
import { getImageUrl } from "../../lib/public-media"
import { toast } from "../ui/use-toast"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import { useWorkspaceHostPane } from "../workspace/workspace-host-pane-context"
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
  const hostPane = useWorkspaceHostPane()
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
      openWorkspaceView(
        { type: "user", id: userId },
        {
          pane: hostPane,
          pathname,
          source: "project-overview-watcher-open",
        },
      )
    },
    [hostPane, pathname],
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Watchers</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            People notified about this project&apos;s activity. Different from team
            members — watchers do not need a seat on the team.
          </p>
        </div>
        {addPopover}
      </div>
      {isLoading && currentWatchers.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : currentWatchers.length === 0 ? (
        <div className="py-4 text-sm text-gray-500">
          No watchers yet. Add someone to start watching this project.
        </div>
      ) : (
        <div>
          {currentWatchers.map((watcher) => {
            const displayName = watcher.full_name || watcher.email || `User #${watcher.user_id}`
            const isManageable = watcher.is_manageable !== false
            return (
              <div
                key={watcher.watcher_id ?? watcher.user_id}
                className="flex items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-b-0"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  title={`Open ${displayName}`}
                  aria-label={`Open ${displayName}`}
                  onClick={() => handleOpenProfile(watcher.user_id)}
                >
                  <UserAvatar
                    name={displayName}
                    photoUrl={watcher.photo ? getImageUrl(watcher.photo) : null}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {displayName}
                    </div>
                    <p className="truncate text-sm text-gray-500">
                      {watcher.email || "No email"}
                    </p>
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {isManageable ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                      title="Remove watcher"
                      aria-label={`Remove ${displayName}`}
                      disabled={watchersMutation.isPending}
                      onClick={() => handleToggle(watcher.user_id)}
                    >
                      {watchersMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  ) : (
                    <span
                      className="px-1 text-[10px] text-gray-400"
                      title="You don't have permission to remove this watcher"
                    >
                      Locked
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
