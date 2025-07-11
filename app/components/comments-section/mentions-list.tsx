import React, { useEffect, useState } from "react"
import { InfiniteList } from "../ui/infinite-list"
import { SupabaseTableData } from "../../../hooks/use-infinite-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { z } from "zod"
import type { Database } from "../../../lib/types/database"

export interface MentionsListProps {
  threadId: number
}

const editSchema = z.object({
  comment: z.string().min(1, "Comment cannot be empty").max(2000),
})

export function MentionsList({ threadId }: MentionsListProps) {
  const [reloadCount, setReloadCount] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const supabase = createClientComponentClient()
  const [userId, setUserId] = useState<number | null>(null)
  const [userMap, setUserMap] = useState<Record<number, { full_name?: string; email?: string }>>({})

  useEffect(() => {
    // Fetch the current user's public user ID from the users table
    const fetchUserId = async () => {
      const { data: authData } = await supabase.auth.getUser()
      const authUid = authData?.user?.id
      if (!authUid) return
      const { data: userRows } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUid)
        .maybeSingle()
      if (userRows?.id) setUserId(userRows.id)
    }
    fetchUserId()
  }, [supabase])

  useEffect(() => {
    const channel = supabase.channel(`mentions-thread-${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mentions',
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          setReloadCount((c) => c + 1)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mentions',
          filter: `thread_id=eq.${threadId}`,
        },
        () => setReloadCount((c) => c + 1)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'mentions',
          filter: `thread_id=eq.${threadId}`,
        },
        () => setReloadCount((c) => c + 1)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, threadId])

  useEffect(() => {
    const controller = new AbortController();
    async function fetchUserMap() {
      const { data: mentionsData } = await supabase
        .from('mentions')
        .select('created_by')
        .eq('thread_id', threadId)
        // @ts-ignore
        .abortSignal ? .abortSignal(controller.signal) : .signal ? .signal(controller.signal) : undefined;
      const userIds = Array.from(new Set((mentionsData || []).map((m: any) => m.created_by).filter((id: any) => typeof id === 'number')));
      if (userIds.length === 0) return;
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds)
        // @ts-ignore
        .abortSignal ? .abortSignal(controller.signal) : .signal ? .signal(controller.signal) : undefined;
      const map: Record<number, { full_name?: string; email?: string }> = {};
      for (const u of usersData || []) {
        map[u.id] = { full_name: u.full_name, email: u.email };
      }
      setUserMap(map);
    }
    fetchUserMap();
    return () => controller.abort();
  }, [threadId, reloadCount]);

  const handleEdit = (mention: SupabaseTableData<'mentions'>) => {
    setEditingId(mention.id)
    setEditValue(mention.comment || "")
    setEditError(null)
  }

  const handleEditSave = async (mention: SupabaseTableData<'mentions'>) => {
    setIsProcessing(true)
    setEditError(null)
    const validation = editSchema.safeParse({ comment: editValue })
    if (!validation.success) {
      setEditError(validation.error.errors[0].message)
      setIsProcessing(false)
      return
    }
    const { error } = await supabase
      .from('mentions')
      .update({ comment: editValue })
      .eq('id', mention.id)
    if (error) {
      setEditError("Failed to update comment")
    } else {
      setEditingId(null)
      setReloadCount((c) => c + 1)
    }
    setIsProcessing(false)
  }

  const handleDelete = async (mention: SupabaseTableData<'mentions'>) => {
    if (!window.confirm("Delete this comment? This cannot be undone.")) return
    setIsProcessing(true)
    setDeletingId(mention.id)
    const { error } = await supabase
      .from('mentions')
      .delete()
      .eq('id', mention.id)
    if (!error) setReloadCount((c) => c + 1)
    setDeletingId(null)
    setIsProcessing(false)
  }

  return (
    <InfiniteList<'mentions', Database["public"]["Tables"]["mentions"]["Row"]>
      key={reloadCount}
      tableName={"mentions"}
      columns="*"
      pageSize={20}
      trailingQuery={(query) => query.eq('thread_id', threadId).order('created_at', { ascending: false })}
      renderNoResults={() => (
        <div className="text-center text-muted-foreground py-10">No comments yet.</div>
      )}
      renderSkeleton={(count) => (
        <div className="flex flex-col gap-2 px-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="h-8 w-full bg-muted animate-pulse rounded" />
          ))}
        </div>
      )}
    >
      {(mentions) => (
        <div className="flex flex-col-reverse gap-4 p-4">
          {mentions.map((mention) => {
            const isOwn = userId != null && mention.created_by === userId
            console.log('mention.id:', mention.id, 'userId:', userId, 'mention.created_by:', mention.created_by, 'isOwn:', isOwn)
            const displayName = typeof mention.created_by === 'number'
              ? userMap[mention.created_by]?.full_name || userMap[mention.created_by]?.email || mention.created_by
              : mention.created_by
            return (
              <div key={mention.id} className="bg-white rounded shadow p-3 flex flex-col gap-1 relative">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{displayName}</span>
                  <span>•</span>
                  <span>{mention.created_at ? new Date(mention.created_at).toLocaleString() : ''}</span>
                </div>
                {isOwn && (
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    {editingId === mention.id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleEditSave(mention)} disabled={isProcessing}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={isProcessing}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(mention)} disabled={isProcessing}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(mention)} disabled={isProcessing || deletingId === mention.id}>
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {editingId === mention.id ? (
                  <>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      disabled={isProcessing}
                      maxLength={2000}
                      autoFocus
                    />
                    {editError && <span className="text-xs text-destructive mt-1">{editError}</span>}
                  </>
                ) : (
                  <div className="text-sm whitespace-pre-line">{mention.comment}</div>
                )}
                {mention.attachment && (
                  <a
                    href={mention.attachment}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline mt-1"
                  >
                    View Attachment
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </InfiniteList>
  )
} 