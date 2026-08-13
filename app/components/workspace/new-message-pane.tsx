"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Loader2, Search, X } from "lucide-react"
import { UserAvatar } from "../UserAvatar"
import { Button } from "../ui/button"
import { getImageUrl } from "../../lib/public-media"
import { getOrCreateUserThread } from "../../lib/services/users"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { TASK_DETAILS_HEADER_ROW_CLASS } from "../tasks/pane-header-tokens"
import { cn } from "@/lib/utils"
import { useCurrentUserStore } from "../../store/current-user"

type DirectoryUser = {
  id: number
  full_name: string | null
  email: string | null
  photo: string | null
}

export type NewMessagePaneProps = {
  paneId: WorkspacePaneId
  onClose?: () => void
}

/**
 * Start a DM with anyone — pick a person, then open the shared thread UI.
 */
export function NewMessagePane({ paneId, onClose }: NewMessagePaneProps) {
  const supabase = createClientComponentClient()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const [query, setQuery] = useState("")
  const [openingUserId, setOpeningUserId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const usersQuery = useQuery({
    queryKey: ["new-message-directory-users"],
    queryFn: async () => {
      const { data, error: loadError } = await supabase
        .from("view_users_i_can_see")
        .select("id, full_name, email, photo")
        .order("full_name")
      if (loadError) throw loadError
      return (data ?? []) as DirectoryUser[]
    },
    staleTime: 60_000,
  })

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = (usersQuery.data ?? []).filter(
      (user) => Number(user.id) !== Number(publicUserId),
    )
    if (!needle) return rows.slice(0, 40)
    return rows
      .filter((user) => {
        const name = (user.full_name || "").toLowerCase()
        const email = (user.email || "").toLowerCase()
        return name.includes(needle) || email.includes(needle)
      })
      .slice(0, 40)
  }, [publicUserId, query, usersQuery.data])

  const openThreadWithUser = async (user: DirectoryUser) => {
    if (openingUserId != null) return
    setError(null)
    setOpeningUserId(user.id)
    try {
      const { data, error: createError } = await getOrCreateUserThread(user.id)
      if (createError) throw createError
      const threadId =
        typeof data === "object" && data && "id" in data
          ? Number((data as { id?: number }).id)
          : Number(data)
      if (!Number.isFinite(threadId) || threadId <= 0) {
        throw new Error("Could not open conversation")
      }
      openWorkspaceView(
        {
          type: "thread",
          id: threadId,
          title: user.full_name?.trim() || user.email || "Message",
        },
        {
          pane: paneId,
          source: `new-message-open-thread:${paneId}`,
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start conversation")
    } finally {
      setOpeningUserId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className={cn(TASK_DETAILS_HEADER_ROW_CLASS, "sticky top-0 z-10")}>
        <h1 className="min-w-0 truncate text-[13px] font-medium text-gray-800">
          New message
        </h1>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people…"
            autoFocus
            className="h-10 w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Pick someone to open a conversation in the thread view.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {usersQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading people…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-gray-500">
            No people found.
          </div>
        ) : (
          filteredUsers.map((user) => {
            const name = user.full_name?.trim() || user.email || `User ${user.id}`
            const isOpening = openingUserId === user.id
            return (
              <button
                key={user.id}
                type="button"
                disabled={openingUserId != null}
                onClick={() => void openThreadWithUser(user)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-60"
              >
                <UserAvatar
                  name={name}
                  photoUrl={getImageUrl(user.photo)}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {name}
                  </span>
                  {user.email ? (
                    <span className="block truncate text-xs text-gray-500">
                      {user.email}
                    </span>
                  ) : null}
                </span>
                {isOpening ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
                ) : null}
              </button>
            )
          })
        )}
      </div>

      {error ? (
        <div className="shrink-0 border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  )
}
