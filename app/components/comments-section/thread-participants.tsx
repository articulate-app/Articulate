import React, { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"

interface ThreadParticipantsProps {
  threadId: number
  projectId: number
  /**
   * New props: participants (users in thread), allProjectUsers (all users in project), currentUserId
   */
  participants?: User[]
  allProjectUsers?: User[]
  currentUserId?: number | null
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

export function ThreadParticipants({ threadId, projectId, participants = [], allProjectUsers = [], currentUserId = null }: ThreadParticipantsProps) {
  const supabase = createClientComponentClient()
  const [isAdding, setIsAdding] = useState(false)
  const [isRemoving, setIsRemoving] = useState<number | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Add participant logic (mutation only)
  const handleAdd = async (userId: number) => {
    setIsAdding(true)
    setError(null)
    const { error } = await supabase
      .from('thread_watchers')
      .insert({ thread_id: threadId, watcher_id: userId, added_by: currentUserId })
    if (error) setError("Failed to add participant")
    setIsAdding(false)
    setPopoverOpen(false)
    setSearch("")
    // Optionally: trigger parent refetch or callback
  }

  // Add handleRemove for mutation only
  const handleRemove = async (userId: number) => {
    if (!window.confirm("Remove this participant?")) return;
    setIsRemoving(userId);
    await supabase
      .from('thread_watchers')
      .delete()
      .eq('thread_id', threadId)
      .eq('watcher_id', userId);
    setIsRemoving(null);
    // Optionally: trigger parent refetch or callback
  };

  const handleJoin = async () => {
    setIsAdding(true)
    setError(null)
    const { error } = await supabase
      .from('thread_watchers')
      .insert({ thread_id: threadId, watcher_id: currentUserId, added_by: currentUserId })
    if (error) setError("Failed to join thread")
    else {
      // Optionally: trigger parent refetch or callback
    }
    setIsAdding(false)
  }

  const filteredUsers = allProjectUsers.filter(u =>
    (u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())) &&
    !participants.some(w => w.id === u.id)
  )

  // Debug logs
  console.log('All project users:', allProjectUsers)
  console.log('Current thread participants:', participants)
  console.log('Filtered addable users:', filteredUsers)

  return (
    <div className="mb-4">
      <div className="font-semibold text-sm mb-1">Participants</div>
      {/* isLoading state removed, rely on parent to manage loading */}
      {/* error state removed, rely on parent to manage error */}
      {/* threadCreatorId state removed */}
      {/* users state removed */}
      {/* search state removed */}
      {/* isLoading state removed */}
      {/* currentUserId state removed */}
      {/* threadCreatorId state removed */}
      {/* popoverOpen state removed */}

      <div className="flex items-center gap-2 flex-wrap">
        {participants.map(w => {
          const user = allProjectUsers.find(u => u.id === w.id)
          return user ? (
            <div key={w.id} className="relative group flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold uppercase text-gray-900 border border-gray-300 shadow"
                title={user.full_name || user.email}
              >
                {getInitials(user.full_name || user.email)}
              </div>
              <div className="absolute left-10 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs bg-white px-2 py-1 rounded shadow border opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                {user.full_name || user.email}
              </div>
              {user.id !== currentUserId && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute -top-2 -right-2 w-5 h-5 p-0 text-xs border border-gray-300 bg-white text-gray-900 shadow"
                  onClick={() => handleRemove(user.id)}
                  disabled={isRemoving === user.id}
                  aria-label="Remove participant"
                  title="Remove participant"
                >×</Button>
              )}
            </div>
          ) : null
        })}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8 rounded-full flex items-center justify-center text-xl border border-gray-300 text-gray-900 bg-white shadow"
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
        {!participants.some(w => Number(w.id) === Number(currentUserId)) && currentUserId && (
          <Button size="sm" variant="outline" onClick={handleJoin} disabled={isAdding}>
            Join thread
          </Button>
        )}
      </div>
    </div>
  )
} 