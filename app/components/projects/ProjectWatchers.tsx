"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Loader2, UserPlus, X } from "lucide-react"
import { Button } from "../ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { toast } from "../ui/use-toast"
import {
  getProjectWatchers,
  addProjectWatcher,
  removeProjectWatcher,
  type ProjectWatcher,
} from "../../lib/services/projects-briefing"

interface ProjectWatchersProps {
  projectId: number
}

interface User {
  id: number
  full_name: string | null
  email: string | null
  photo: string | null
}

/**
 * Get user initials from full name or email
 */
function getInitials(name: string | null | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

export function ProjectWatchers({ projectId }: ProjectWatchersProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()

  const [popoverOpen, setPopoverOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  // Fetch watchers
  const {
    data: watchers,
    isLoading: watchersLoading,
    error: watchersError,
  } = useQuery({
    queryKey: ["project-watchers", projectId],
    queryFn: async () => {
      const result = await getProjectWatchers(projectId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  // Fetch all users for the selector
  const {
    data: allUsers,
    isLoading: usersLoading,
  } = useQuery({
    queryKey: ["users-for-watchers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("view_users_i_can_see")
        .select("id, full_name, email, photo")
        .order("full_name")

      if (error) throw error
      return (data || []) as User[]
    },
    enabled: popoverOpen, // Only fetch when popover is opened
  })

  // Add watcher mutation
  const addMutation = useMutation({
    mutationFn: async (userId: number) => {
      const result = await addProjectWatcher(projectId, userId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-watchers", projectId] })
      toast({
        title: "Success",
        description: "Watcher added successfully",
      })
      setPopoverOpen(false)
      setSearch("")
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add watcher",
        variant: "destructive",
      })
    },
  })

  // Remove watcher mutation
  const removeMutation = useMutation({
    mutationFn: async (watcherId: number) => {
      const result = await removeProjectWatcher(watcherId)
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-watchers", projectId] })
      toast({
        title: "Success",
        description: "Watcher removed successfully",
      })
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove watcher",
        variant: "destructive",
      })
    },
  })

  // Filter users that are not already watchers
  const availableUsers = useMemo(() => {
    if (!allUsers || !watchers) return []
    const watcherUserIds = new Set(watchers.map((w) => w.user_id))
    return allUsers.filter((u) => !watcherUserIds.has(u.id))
  }, [allUsers, watchers])

  // Filter by search term
  const filteredUsers = useMemo(() => {
    if (!search) return availableUsers
    const lowerSearch = search.toLowerCase()
    return availableUsers.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(lowerSearch) ||
        u.email?.toLowerCase().includes(lowerSearch)
    )
  }, [availableUsers, search])

  const handleAdd = async (userId: number) => {
    setIsAdding(true)
    try {
      await addMutation.mutateAsync(userId)
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemove = async (watcherId: number) => {
    await removeMutation.mutateAsync(watcherId)
  }

  if (watchersLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (watchersError) {
    return (
      <div className="text-sm text-red-600">
        Error loading watchers: {(watchersError as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Watchers</h3>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              disabled={isAdding}
            >
              <UserPlus className="w-4 h-4" />
              Add Watcher
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  Search Users
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Type name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={isAdding}
                  autoFocus
                />
              </div>

              <div className="max-h-56 overflow-y-auto border rounded">
                {usersLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 transition-colors"
                      onClick={() => handleAdd(u.id)}
                    >
                      {u.photo ? (
                        <img
                          src={u.photo}
                          alt={u.full_name || u.email || "User"}
                          className="w-7 h-7 rounded-full object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[11px] font-semibold text-white border border-gray-200">
                          {getInitials(u.full_name || u.email)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {u.full_name || u.email}
                        </div>
                        {u.full_name && u.email && (
                          <div className="text-xs text-gray-500 truncate">
                            {u.email}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500 px-3 py-6 text-center">
                    {search ? "No users found" : "All users are already watchers"}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Watchers List */}
      <div className="space-y-2">
        {watchers && watchers.length > 0 ? (
          watchers.map((watcher) => (
            <div
              key={watcher.watcher_id}
              className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {watcher.photo ? (
                <img
                  src={watcher.photo}
                  alt={watcher.full_name || watcher.email || "User"}
                  className="w-9 h-9 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-semibold text-white border border-gray-200">
                  {getInitials(watcher.full_name || watcher.email)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {watcher.full_name || watcher.email || "Unknown User"}
                </div>
                {watcher.full_name && watcher.email && (
                  <div className="text-xs text-gray-500 truncate">
                    {watcher.email}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => handleRemove(watcher.watcher_id)}
                disabled={removeMutation.isPending}
                title="Remove watcher"
              >
                {removeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
              </Button>
            </div>
          ))
        ) : (
          <div className="text-sm text-gray-500 text-center py-6 border border-dashed border-gray-300 rounded-lg">
            No watchers yet. Add someone to start watching this project.
          </div>
        )}
      </div>
    </div>
  )
}

