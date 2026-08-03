import React, { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '../ui/dialog';
import { getImageUrl } from "../../lib/public-media";
import { UserHoverCard } from "../ui/user-hover-card";

interface ThreadParticipantsInlineProps {
  threadId?: number
  allowRemove?: boolean
  projectId?: number
  pendingMode?: boolean
  pendingParticipants?: any[]
  setPendingParticipants?: (p: any[]) => void
  removedParticipants?: any[]
  setRemovedParticipants?: (p: any[]) => void
  /**
   * New props: participants (users in thread), allProjectUsers (all users in project)
   */
  participants?: User[]
  allProjectUsers?: User[]
  currentUserId?: number | null
  /**
   * Callback to notify parent to refetch participants after mutation
   */
  onParticipantsChanged?: () => void
}

interface Watcher {
  id: number
  thread_id: number
  watcher_id: number
  created_at: string
  added_by: number | null
}

interface User {
  id: number
  full_name: string | null
  email: string | null
  auth_user_id?: string | null
  photo?: string | null
}

function getInitials(name: string | undefined | null) {
  if (!name || typeof name !== 'string') return "?"
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function AvatarCircle({ name, email, photo }: { name?: string | null; email?: string | null; photo?: string | null }) {
  const photoUrl = getImageUrl(photo || undefined)
  if (photoUrl) {
    // Fixed-size, block, non-shrinking circular container clips the photo cleanly; the image fills it
    // and is centered (object-cover object-center) so it is never trimmed at the top or distorted by
    // flex squashing or the inline-image baseline gap.
    return (
      <span className="block h-7 w-7 shrink-0 overflow-hidden rounded-full border border-gray-300 shadow">
        <img
          src={photoUrl}
          alt={name || email || "User"}
          className="block h-full w-full rounded-full object-cover object-center"
        />
      </span>
    )
  }
  return (
    <div className="w-7 h-7 shrink-0 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold uppercase text-gray-900 border border-gray-300 shadow">
      {getInitials(name || email)}
    </div>
  )
}

function _ThreadParticipantsInline({
  threadId,
  allowRemove = false,
  projectId,
  pendingMode = false,
  pendingParticipants = [],
  setPendingParticipants,
  removedParticipants = [],
  setRemovedParticipants,
  participants = [],
  allProjectUsers = [],
  currentUserId = null,
  onParticipantsChanged,
}: ThreadParticipantsInlineProps) {
  const supabase = createClientComponentClient()
  // Remove all local fetching state
  // const [watchers, setWatchers] = useState<Watcher[]>([])
  // const [users, setUsers] = useState<User[]>(participants)
  // const [allProjectUsers, setAllProjectUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(false)
  // const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [isRemoving, setIsRemoving] = useState<number | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);

  // Remove useEffect for fetching participants/project users

  // Add participant logic (mutation only)
  // Map from user.id (from allProjectUsers) to user_id (public user id from project_watchers)
  const handleAdd = async (userId: number) => {
    setIsAdding(true);
    setError(null);
    if (!userId || !currentUserId) {
      setError("Invalid user or current user");
      setIsAdding(false);
      return;
    }
    const { error } = await supabase
      .from('thread_watchers')
      .insert({ thread_id: threadId, watcher_id: userId, added_by: currentUserId });
    if (error) setError(error.message || "Failed to add participant");
    setIsAdding(false);
    setPopoverOpen(false);
    setSearch("");
    // Notify parent to refetch participants
    if (!error && typeof onParticipantsChanged === 'function') onParticipantsChanged();
  };

  // Remove all local refresh logic, rely on parent to update props

  const safeParticipants = Array.isArray(participants) ? participants.filter(Boolean) : [];
  const participantsWithDetails = safeParticipants.map((p: any) => {
    const fallback = allProjectUsers.find((u: any) => {
      if (Number(u.id) === Number(p?.id)) return true
      if (u?.auth_user_id && p?.auth_user_id && String(u.auth_user_id) === String(p.auth_user_id)) return true
      if (u?.email && p?.email && String(u.email).toLowerCase() === String(p.email).toLowerCase()) return true
      return false
    })
    return {
      ...fallback,
      ...p,
      photo: p?.photo ?? fallback?.photo ?? null,
      full_name: p?.full_name ?? fallback?.full_name ?? p?.email ?? fallback?.email ?? `User #${p?.id}`,
      email: p?.email ?? fallback?.email ?? null,
    }
  })
  const filteredUsers = allProjectUsers.filter(u =>
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())) &&
    !safeParticipants.some(w => w && w.id === u.id)
  )

  if (pendingMode) {
    // Pending mode: avatars open the same manage popover as add (+); remove lives inside that popover.
    const displayParticipants = pendingParticipants.length > 0 ? pendingParticipants.filter(Boolean) : safeParticipants
    const sameUser = (a: any, b: any) => {
      if (!a || !b) return false
      if (a.id != null && b.id != null) return Number(a.id) === Number(b.id)
      if (a.auth_user_id && b.auth_user_id) return String(a.auth_user_id) === String(b.auth_user_id)
      if (a.email && b.email) return String(a.email).toLowerCase() === String(b.email).toLowerCase()
      return false
    }
    const openPendingPopover = () => requestAnimationFrame(() => setPopoverOpen(true))
    const removePendingParticipant = (user: any) => {
      if (typeof setPendingParticipants === "function") {
        const base = pendingParticipants.length > 0 ? pendingParticipants.filter(Boolean) : displayParticipants
        setPendingParticipants(base.filter((u: any) => !sameUser(u, user)))
      }
      if (typeof setRemovedParticipants === "function") {
        setRemovedParticipants([...(removedParticipants || []), user])
      }
    }
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={openPendingPopover}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openPendingPopover()
          }
        }}
        className="flex min-w-0 cursor-pointer items-center gap-1"
        aria-label="View or manage participants"
        data-comment-watcher-picker-trigger="true"
      >
        {displayParticipants.map((user, idx) =>
          user ? (
            <div key={`pending-participant-${user.id ?? `idx-${idx}`}`} className="relative flex flex-col items-center">
              <UserHoverCard user={{ full_name: user.full_name, email: user.email, photo: user.photo || null }}>
                <button
                  type="button"
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    openPendingPopover()
                  }}
                  aria-label={`View participants (${user.full_name || user.email})`}
                >
                  <AvatarCircle name={user.full_name} email={user.email} photo={user.photo || null} />
                </button>
              </UserHoverCard>
            </div>
          ) : null,
        )}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-xl text-gray-900 shadow"
              aria-label="Add participant"
              title="Add participant"
              data-comment-watcher-picker-trigger="true"
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              +
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="z-[260] w-56 p-2"
            data-comment-watcher-picker="true"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {displayParticipants.length > 0 ? (
              <div className="mb-2 rounded border border-gray-200 p-2">
                <div className="mb-1 text-[11px] font-normal text-gray-500">Current participants</div>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {displayParticipants.map((user, idx) => (
                    <div
                      key={`pending-current-${user.id ?? `idx-${idx}`}`}
                      className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <AvatarCircle name={user.full_name} email={user.email} photo={user.photo || null} />
                        <span className="truncate text-xs text-gray-700">{user.full_name || user.email}</span>
                      </div>
                      {setPendingParticipants ? (
                        <button
                          type="button"
                          className="shrink-0 text-xs text-red-600 hover:underline"
                          onClick={() => removePendingParticipant(user)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <input
              type="text"
              className="mb-2 w-full rounded border px-2 py-1 text-xs"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-40 overflow-y-auto">
              {allProjectUsers
                .filter((u) => {
                  const base = pendingParticipants.length > 0 ? pendingParticipants.filter(Boolean) : displayParticipants
                  const isInPending = base.some((p: any) => sameUser(p, u))
                  return (
                    (u.full_name?.toLowerCase().includes(search.toLowerCase())
                      || u.email?.toLowerCase().includes(search.toLowerCase()))
                    && !isInPending
                  )
                })
                .slice(0, 8)
                .map((u) => (
                  <div
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent"
                    onClick={() => {
                      const userToAdd = allProjectUsers.find((apu) => apu.id === u.id) || u
                      const base = pendingParticipants.length > 0 ? pendingParticipants.filter(Boolean) : displayParticipants
                      if (base.some((p: any) => sameUser(p, userToAdd))) return
                      setPendingParticipants?.([...base, userToAdd])
                    }}
                    title={`Add ${u.full_name || u.email}`}
                  >
                    <AvatarCircle name={u.full_name} email={u.email} photo={u.photo || null} />
                    <span>{u.full_name || u.email}</span>
                  </div>
                ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }

  // Remove local isLoading, always false
  // Remove local watchers, use users prop
  // Add handleRemove for mutation only
  const handleRemove = async (userId: number) => {
    setIsRemoving(userId);
    await supabase
      .from('thread_watchers')
      .delete()
      .eq('thread_id', threadId)
      .eq('watcher_id', userId);
    setIsRemoving(null);
    setShowRemoveDialog(false);
    setRemovingUserId(null);
    // Notify parent to refetch participants
    if (typeof onParticipantsChanged === 'function') onParticipantsChanged();
  };

  if (isLoading) return <div className="text-xs text-muted-foreground">Loading participants...</div>

  const openPopover = () => requestAnimationFrame(() => setPopoverOpen(true));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPopover}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPopover(); } }}
      className="flex items-center gap-1 cursor-pointer min-w-0"
      aria-label="View or manage participants"
    >
      {participantsWithDetails.map((user, idx) => (
        user ? (
          <div key={`participant-${user.id ?? `idx-${idx}`}`} className="relative flex flex-col items-center">
            <UserHoverCard user={{ full_name: user.full_name, email: user.email, photo: user.photo || null }}>
              <button type="button" className="rounded-full" onClick={(e) => { e.stopPropagation(); openPopover(); }} aria-label={`View participants (${user.full_name || user.email})`}>
                <AvatarCircle name={user.full_name} email={user.email} photo={user.photo || null} />
              </button>
            </UserHoverCard>
          </div>
        ) : null
      ))}
      {/* Add participant popover */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="w-7 h-7 rounded-full flex items-center justify-center text-xl border border-gray-300 text-gray-900 bg-white shadow shrink-0"
            aria-label="Add participant"
            title="Add participant"
            onClick={(e) => e.stopPropagation()}
          >+
          </Button>
        </PopoverTrigger>
        <PopoverContent className="z-[260] w-56 p-2">
          {participantsWithDetails.length > 0 ? (
            <div className="mb-2 rounded border border-gray-200 p-2">
              <div className="mb-1 text-[11px] font-normal text-gray-500">Current participants</div>
              <div className="max-h-28 space-y-1 overflow-y-auto">
                {participantsWithDetails.map((user, idx) => (
                  <div key={`current-${user.id ?? `idx-${idx}`}`} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-gray-50">
                    <div className="flex min-w-0 items-center gap-2">
                      <AvatarCircle name={user.full_name} email={user.email} photo={user.photo || null} />
                      <span className="truncate text-xs text-gray-700">{user.full_name || user.email}</span>
                    </div>
                    {allowRemove && user.id !== currentUserId ? (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => {
                          if (typeof user.id === 'number') {
                            setShowRemoveDialog(true);
                            setRemovingUserId(user.id);
                          }
                        }}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-xs mb-2"
            placeholder="Search users..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            disabled={isAdding}
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto">
            {filteredUsers.length > 0 ? filteredUsers
              .filter(u => !!u.id)
              .slice(0, 8)
              .map((u, idx) => (
                <div
                  key={`add-user-${u.id ?? `idx-${idx}`}`}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer text-xs rounded"
                  onClick={() => u.id && handleAdd(u.id)}
                  title={`Add ${u.full_name || u.email}`}
                >
                  <AvatarCircle name={u.full_name} email={u.email} photo={u.photo || null} />
                  <span>{u.full_name || u.email}</span>
                </div>
              )) : (
                <div className="text-xs text-muted-foreground px-2 py-1">No users found</div>
              )}
          </div>
        </PopoverContent>
      </Popover>
      {error && <div className="text-xs text-destructive mt-1">{error}</div>}
      {/* Remove participant confirmation dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={open => { setShowRemoveDialog(open); if (!open) setRemovingUserId(null); }}>
        <DialogContent>
          <DialogTitle>Remove Participant</DialogTitle>
          <div className="py-2">Are you sure you want to remove this participant from the thread? This cannot be undone.</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRemoveDialog(false); setRemovingUserId(null); }} disabled={isRemoving !== null}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => typeof removingUserId === 'number' && handleRemove(removingUserId)} disabled={isRemoving !== null}>
              {isRemoving ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 

export const ThreadParticipantsInline = React.memo(_ThreadParticipantsInline); 