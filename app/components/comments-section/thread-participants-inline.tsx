import React, { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Button } from "../ui/button"

interface ThreadParticipantsInlineProps {
  threadId: number
  allowRemove?: boolean
  projectId: number
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
}

function getInitials(name: string | undefined | null) {
  if (!name || typeof name !== 'string') return "?"
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function _ThreadParticipantsInline({ threadId, allowRemove = false, projectId }: ThreadParticipantsInlineProps) {
  const supabase = createClientComponentClient()
  const [watchers, setWatchers] = useState<Watcher[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [allProjectUsers, setAllProjectUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [isRemoving, setIsRemoving] = useState<number | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Ref to track last fetched threadId
  const lastFetchedThreadId = React.useRef<number | null>(null);

  useEffect(() => {
    // Prevent duplicate fetches for the same threadId
    if (lastFetchedThreadId.current === threadId) {
      return;
    }
    lastFetchedThreadId.current = threadId;
    let isMounted = true;
    async function fetchParticipantsAndProjectUsers() {
      setIsLoading(true);
      setError(null);
      let isMounted = true;
      try {
        // 1. Fetch the thread to get task_id (if needed for other reasons)
        const { data: thread, error: threadError } = await supabase
          .from('threads')
          .select('id, task_id')
          .eq('id', threadId)
          .single();
        if (threadError || !thread) throw new Error('Thread not found');
        // 2. Use projectId prop directly!
        const { data: projectWatchers, error: projectWatchersError } = await supabase
          .from('project_watchers')
          .select('user_id, users (id, full_name, email, photo)')
          .eq('project_id', projectId);
        if (projectWatchersError) throw new Error('Project watchers fetch failed');
        // 3. Fetch thread watchers (participants)
        const { data: threadWatchers, error: threadWatchersError } = await supabase
          .from('thread_watchers')
          .select('watcher_id')
          .eq('thread_id', threadId);
        if (threadWatchersError) throw new Error('Thread watchers fetch failed');
        // 4. Filter project users by thread watcher ids
        const watcherIds = threadWatchers?.map((tw: any) => tw.watcher_id) || [];
        const participants = (projectWatchers || [])
          .map((pw: any) => pw.users)
          .filter((user: any) => user && watcherIds.includes(user.id));
        if (isMounted) {
          setAllProjectUsers(projectWatchers?.map((pw: any) => pw.users).filter(Boolean) || []);
          setWatchers(participants);
          setUsers(prevUsers => {
            const isSame = prevUsers.length === participants.length && prevUsers.every((u, i) => u.id === participants[i].id);
            if (!isSame) {
              return participants;
            }
            return prevUsers;
          });
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('[ThreadParticipantsInline] Error fetching participants:', err);
        if (isMounted) {
          setError(err.message || 'Failed to load participants');
          setIsLoading(false);
        }
      }
    }
    fetchParticipantsAndProjectUsers();
    return () => {
      isMounted = false;
    };
  }, [threadId, projectId]);

  const handleRemove = async (watcherId: number) => {
    if (!window.confirm("Remove this participant?")) return
    setIsRemoving(watcherId)
    await supabase
      .from('thread_watchers')
      .delete()
      .eq('thread_id', threadId)
      .eq('watcher_id', watcherId)
    // Refresh participants
    const { data: threadWatchers } = await supabase
      .from('thread_watchers')
      .select('*')
      .eq('thread_id', threadId)
    setWatchers(threadWatchers || [])
    setIsRemoving(null)
  }

  // Add participant logic
  const handleAdd = async (userId: number) => {
    setIsAdding(true)
    setError(null)
    const { error } = await supabase
      .from('thread_watchers')
      .insert({ thread_id: threadId, watcher_id: userId, added_by: currentUserId })
    if (error) setError("Failed to add participant")
    // Refresh participants
    // Re-fetch all participants and project users
    const { data: threadWatchers } = await supabase
      .from('thread_watchers')
      .select('*')
      .eq('thread_id', threadId)
    setWatchers(threadWatchers || [])
    // Update users in thread
    const watcherIds = (threadWatchers || []).map(w => w.watcher_id)
    setUsers(allProjectUsers.filter(u => watcherIds.includes(u.id)))
    setIsAdding(false)
    setPopoverOpen(false)
    setSearch("")
  }

  // Filter users for add popover
  const filteredUsers = allProjectUsers.filter(u =>
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())) &&
    !watchers.some(w => w.watcher_id === u.id)
  )

  if (isLoading) return <div className="text-xs text-muted-foreground">Loading participants...</div>

  return (
    <div className="flex items-center gap-1">
      {users.map(user => (
        <div key={user.id} className="relative group flex flex-col items-center">
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
              onClick={() => handleRemove(user.id)}
              disabled={isRemoving === user.id}
              title="Remove participant"
              aria-label="Remove participant"
            >×</button>
          )}
        </div>
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
            {filteredUsers.length > 0 ? filteredUsers.slice(0, 8).map(u => (
              <div
                key={u.id}
                className="flex items-center gap-2 px-2 py-1 hover:bg-accent cursor-pointer text-xs rounded"
                onClick={() => handleAdd(u.id)}
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
    </div>
  )
} 

export const ThreadParticipantsInline = React.memo(_ThreadParticipantsInline); 