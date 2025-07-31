import React, { useEffect, useState } from "react"
import { SupabaseTableData } from "../../../hooks/use-infinite-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { z } from "zod"
import type { Database } from "../../../lib/types/database"
import { MentionsInfiniteList } from "./mentions-infinite-list";
import { useCurrentUserStore } from '../../store/current-user';

export interface MentionsListProps {
  threadId: number
}

const editSchema = z.object({
  comment: z.string().min(1, "Comment cannot be empty").max(2000),
})

// New version: expects mentions data to already include user info (no users table query)
export function MentionsList({ threadId }: MentionsListProps) {
  console.log('[MentionsList] Rendered for threadId:', threadId);
  // All user info should come from the mentions data provided by the parent/edge function
  // Remove all userId/userMap state and effects
  const [reloadCount, setReloadCount] = useState(0)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const currentPublicUserId = useCurrentUserStore((s) => s.publicUserId);

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
    // You may want to update this to use an edge function for editing
    // For now, keep the existing logic
    const supabase = createClientComponentClient()
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
    // You may want to update this to use an edge function for deleting
    // For now, keep the existing logic
    const supabase = createClientComponentClient()
    const { error } = await supabase
      .from('mentions')
      .delete()
      .eq('id', mention.id)
    if (!error) setReloadCount((c) => c + 1)
    setDeletingId(null)
    setIsProcessing(false)
  }

  return (
    <MentionsInfiniteList
      reloadCount={reloadCount}
      threadId={threadId}
      currentPublicUserId={currentPublicUserId}
      queryKey={`thread-${threadId}`}
      // userId and userMap are no longer needed
      editingId={editingId}
      isProcessing={isProcessing}
      deletingId={deletingId}
      editValue={editValue}
      editError={editError}
      handleEdit={handleEdit}
      handleEditSave={handleEditSave}
      setEditingId={setEditingId}
      setEditValue={setEditValue}
      handleDelete={handleDelete}
    />
  )
} 