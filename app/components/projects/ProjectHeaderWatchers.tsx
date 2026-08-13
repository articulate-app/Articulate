"use client"

import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import { ExternalLink } from "lucide-react"

import { UserAvatar } from "../UserAvatar"
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

interface ProjectHeaderWatchersProps {
  projectId: number
}

export function ProjectHeaderWatchers({ projectId }: ProjectHeaderWatchersProps) {
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const hostPane = useWorkspaceHostPane()
  const [isOpen, setIsOpen] = useState(false)

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
      toast({ title: "Error", description: error?.message ?? "Failed to update watchers", variant: "destructive" })
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

  const options = useMemo(() => {
    const byId = new Map<number, ProjectWatcherCandidate | ProjectWatcherCurrent>()
    for (const watcher of currentWatchers) {
      byId.set(watcher.user_id, watcher)
    }
    for (const candidate of data?.candidates ?? []) {
      byId.set(candidate.user_id, candidate)
    }
    return Array.from(byId.values())
  }, [currentWatchers, data?.candidates])

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
      setIsOpen(false)
      openWorkspaceView(
        { type: "user", id: userId },
        {
          pane: hostPane,
          pathname,
          source: "project-header-watcher-open",
        },
      )
    },
    [hostPane, pathname],
  )

  if (isLoading && currentWatchers.length === 0) {
    return (
      <div className="inline-flex h-7 min-w-[2.5rem] items-center rounded-full bg-transparent px-1.5">
        <span className="text-[10px] text-gray-400">…</span>
      </div>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-[140px] items-center gap-1 overflow-hidden rounded-full bg-transparent px-1.5 py-0.5 hover:bg-gray-50"
          title="Manage watchers"
          aria-label="Manage watchers"
        >
          <div className="flex items-center -space-x-1">
            {currentWatchers.slice(0, 3).map((watcher) => (
              <UserAvatar
                key={watcher.watcher_id ?? watcher.user_id}
                name={watcher.full_name || watcher.email || `User #${watcher.user_id}`}
                photoUrl={watcher.photo ? getImageUrl(watcher.photo) : null}
                size="xs"
                className="h-5 w-5 min-h-5 min-w-5"
              />
            ))}
          </div>
          {currentWatchers.length > 3 ? (
            <span className="text-[10px] text-gray-500">+{currentWatchers.length - 3}</span>
          ) : currentWatchers.length === 0 ? (
            <span className="px-1 text-[10px] text-gray-500">Watchers</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(90vw,20rem)] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search project users…" disabled={watchersMutation.isPending} />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>No users found</CommandEmpty>
            <CommandGroup>
              {options.map((user) => {
                const isWatcher = selectedIds.has(user.user_id)
                const displayName = user.full_name || user.email || `User #${user.user_id}`
                const isManageable = "is_manageable" in user ? user.is_manageable !== false : true
                return (
                  <CommandItem
                    key={user.user_id}
                    value={`${user.full_name ?? ""} ${user.email ?? ""} ${user.user_id}`}
                    className={cn(
                      "group cursor-pointer",
                      (watchersMutation.isPending || !isManageable) && "pointer-events-none opacity-50",
                    )}
                    onSelect={() => {
                      if (!isManageable) return
                      handleToggle(user.user_id)
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
                      <button
                        type="button"
                        title={`Open ${displayName}`}
                        aria-label={`Open ${displayName}`}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleOpenProfile(user.user_id)
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-medium",
                          isWatcher ? "text-gray-700" : "text-gray-400",
                        )}
                      >
                        {isWatcher ? "Watching" : "Add"}
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
}
