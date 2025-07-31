import React, { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '../ui/dialog';

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
  full_name: string
  email: string
  auth_user_id: string
}

function getInitials(name: string | undefined | null) {
  if (!name || typeof name !== 'string') return "?"
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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
    console.log('Adding participant:', { threadId, watcherId: userId, currentUserId });
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

  // Remove allProjectUsers state, use prop
  console.log('allProjectUsers:', allProjectUsers);
  console.log('allProjectUsers ids:', allProjectUsers.map(u => u.id));
  console.log('pendingParticipants:', pendingParticipants);
  console.log('pendingParticipants ids:', pendingParticipants.map(u => u && u.id));
  const safeParticipants = Array.isArray(participants) ? participants.filter(Boolean) : [];
  const filteredUsers = allProjectUsers.filter(u =>
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())) &&
    !safeParticipants.some(w => w && w.id === u.id)
  )
  console.log('filteredUsers (non-pending mode):', filteredUsers);

  if (pendingMode) {
    // Pending mode: show pendingParticipants avatars and add/search UI
    // Use pendingParticipants if not empty, otherwise use participants (project watchers)
    const displayParticipants = pendingParticipants.length > 0 ? pendingParticipants.filter(Boolean) : safeParticipants;
    console.log('displayParticipants (pending mode):', displayParticipants);
    // Debug log for pending participants
    console.log('DEBUG: pendingParticipants', pendingParticipants);
    console.log('DEBUG: displayParticipants', displayParticipants);
    return (
      <div className="flex items-center gap-1">
        {displayParticipants.map((user, idx) => (
          user ? (
            <div key={`pending-participant-${user.id ?? `idx-${idx}`}`} className="relative group flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold uppercase text-gray-900 border border-gray-300 shadow"
                title={user.full_name || user.email}
              >
                {getInitials(user.full_name || user.email)}
              </div>
              {setPendingParticipants && setRemovedParticipants && (
                <button
                  type="button"
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  onClick={() => {
                    if (typeof setPendingParticipants === 'function') {
                      const next = pendingParticipants.filter((u: any) => u && u.auth_user_id !== user.auth_user_id);
                      setPendingParticipants(next);
                    }
                    if (typeof setRemovedParticipants === 'function') {
                      setRemovedParticipants([...(removedParticipants || []), user]);
                    }
                  }}
                  title="Remove participant"
                  aria-label="Remove participant"
                >×</button>
              )}
            </div>
          ) : null
        ))}
        {/* Add participant popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="w-7 h-7 rounded-full flex items-center justify-center text-xl border border-gray-300 text-gray-900 bg-white shadow"
              aria-label="Add participant"
              title="Add participant"
            >+
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2">
            <input
              type="text"
              className="w-full border rounded px-2 py-1 text-xs mb-2"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-40 overflow-y-auto">
              {allProjectUsers.filter(u => {
                const isInPending = pendingParticipants.some(p => {
                  const match = p && Number(p.id) === Number(u.id);
                  if (match) {
                    console.log('DROPDOWN FILTER: Exclude user', u, 'because id matches pending', p, 'u.id:', u.id, 'p.id:', p && p.id);
                  }
                  return match;
                });
                const passes = (u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())) && !isInPending;
                if (passes) {
                  console.log('Dropdown candidate (pending mode):', u, 'not in pendingParticipants');
                }
                return passes;
              }).slice(0, 8).map(u => (
                <div
                  key={u.id}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer text-xs rounded"
                  onClick={() => {
                    // Always add the full user object from allProjectUsers (by id)
                    const userToAdd = allProjectUsers.find(apu => apu.id === u.id) || u;
                    setPendingParticipants && setPendingParticipants([
                      ...pendingParticipants.filter(Boolean).filter(p => !!p.id),
                      userToAdd
                    ]);
                  }}
                  title={`Add ${u.full_name || u.email}`}
                >
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold uppercase text-gray-900 border border-gray-300">
                    {getInitials(u.full_name || u.email)}
                  </div>
                  <span>{u.full_name || u.email}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
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

  // Debug log for participants
  console.log('ThreadParticipantsInline participants:', participants);
  return (
    <div className="flex items-center gap-1">
      {participants.map((user, idx) => (
        user ? (
          <div key={`participant-${user.id ?? `idx-${idx}`}`} className="relative group flex flex-col items-center">
            <div
              className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold uppercase text-gray-900 border border-gray-300 shadow"
              title={user.full_name || user.email}
            >
              {getInitials(user.full_name || user.email)}
            </div>
            {allowRemove && user.id !== currentUserId && (
              <button
                type="button"
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                onClick={() => { if (typeof user.id === 'number') { setShowRemoveDialog(true); setRemovingUserId(user.id); } }}
                disabled={isRemoving === user.id}
                title="Remove participant"
                aria-label="Remove participant"
              >×</button>
            )}
          </div>
        ) : null
      ))}
      {/* Add participant popover */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="w-7 h-7 rounded-full flex items-center justify-center text-xl border border-gray-300 text-gray-900 bg-white shadow"
            aria-label="Add participant"
            title="Add participant"
          >+
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2">
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
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold uppercase text-gray-900 border border-gray-300">
                    {getInitials(u.full_name || u.email)}
                  </div>
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