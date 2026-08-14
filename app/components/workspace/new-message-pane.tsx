"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Loader2 } from "lucide-react"
import { UserAvatar } from "../UserAvatar"
import { getImageUrl } from "../../lib/public-media"
import { getOrCreateUserThread } from "../../lib/services/users"
import { openWorkspaceView } from "../../lib/open-workspace-view"
import type { WorkspacePaneId } from "../../lib/workspace-view"
import { useCurrentUserStore } from "../../store/current-user"
import { WorkspacePageSearchInput, WorkspacePageShell } from "./workspace-page-shell"

type DirectoryUser = {
  id: number
  full_name: string | null
  email: string | null
  photo: string | null
}

export type NewMessagePaneProps = {
  paneId: WorkspacePaneId
  /** @deprecated Close lives on the tab strip; page UI has no “x”. */
  onClose?: () => void
}

/**
 * Start a DM with anyone — pick a person, then open the shared thread UI.
 */
export function NewMessagePane({ paneId }: NewMessagePaneProps) {
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
    <WorkspacePageShell
      title="New message"
      subtitle="Pick someone to open a conversation."
    >
      <WorkspacePageSearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search people…"
        autoFocus
      />

      {usersQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading people…
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-gray-500">No people found.</div>
      ) : (
        <div className="flex flex-col">
          {filteredUsers.map((user) => {
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
                <UserAvatar name={name} photoUrl={getImageUrl(user.photo)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {name}
                  </span>
                  {user.email ? (
                    <span className="block truncate text-xs text-gray-500">{user.email}</span>
                  ) : null}
                </span>
                {isOpening ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      {error ? (
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
    </WorkspacePageShell>
  )
}
