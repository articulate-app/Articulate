"use client"

import type { SupabaseClient } from "@supabase/supabase-js"

export type CreateThreadWithFirstMessageInput = {
  createdBy: number
  title?: string | null
  participantIds: number[]
  firstMessageHtml: string
  projectId?: number | null
  taskId?: number | null
  userId?: number | null
}

export async function createThreadWithFirstMessage(
  supabase: SupabaseClient,
  input: CreateThreadWithFirstMessageInput,
): Promise<{ threadId: number; mentionId: number | null; createdAt: string }> {
  const normalizedMessage = (input.firstMessageHtml ?? "").trim()
  if (!normalizedMessage) {
    throw new Error("Please write a first message.")
  }

  const uniqueParticipants = Array.from(
    new Set(
      input.participantIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  )
  if (uniqueParticipants.length < 1) {
    throw new Error("Select at least one participant.")
  }

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .insert([
      {
        title: input.title?.trim() ? input.title.trim() : null,
        created_by: input.createdBy,
        project_id: input.projectId ?? null,
        task_id: input.taskId ?? null,
        user_id: input.userId ?? null,
      },
    ])
    .select("id")
    .single()

  if (threadError) throw threadError
  if (!thread?.id) throw new Error("Failed to create thread")

  const watcherRows = uniqueParticipants.map((watcherId) => ({
    thread_id: thread.id,
    watcher_id: watcherId,
    added_by: input.createdBy,
  }))
  if (watcherRows.length > 0) {
    const { error: watchersError } = await supabase.from("thread_watchers").insert(watcherRows)
    if (watchersError) throw watchersError
  }

  const { data: mention, error: mentionError } = await supabase
    .from("mentions")
    .insert({
      thread_id: thread.id,
      comment: normalizedMessage,
      created_by: input.createdBy,
      created_at: new Date().toISOString(),
    })
    .select("id, created_at")
    .single()
  if (mentionError) throw mentionError

  return {
    threadId: thread.id,
    mentionId: mention?.id ?? null,
    createdAt: mention?.created_at ?? new Date().toISOString(),
  }
}

