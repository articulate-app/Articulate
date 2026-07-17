"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export type UserSharedMentionRow = {
  mention_id: number
  thread_id: number
  comment: string | null
  attachment: string | null
  created_at: string | null
  created_by: number | null
  mention_created_by_name: string | null
  mention_created_by_email: string | null
  mention_created_by_photo: string | null
  participant_user_ids: number[]
  participants: Array<{
    id: number
    full_name: string | null
    photo: string | null
    email: string | null
  }>
  thread_title: string | null
  thread_context_type: "project" | "task" | "direct" | "general"
  task_id: number | null
  task_title: string | null
  project_id: number | null
  project_name: string | null
}

function normalizeContext(value: unknown): UserSharedMentionRow["thread_context_type"] {
  const v = typeof value === "string" ? value : ""
  if (v === "project" || v === "task" || v === "direct" || v === "general") return v
  return "general"
}

function parseParticipantIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => Number(entry))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    )
  }

  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parseParticipantIds(parsed)
    } catch {
      // Falls back to comma-separated format support below.
    }
    return Array.from(
      new Set(
        value
          .split(",")
          .map((entry) => Number(entry.trim()))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    )
  }

  return []
}

function normalizeMentionRow(raw: Record<string, unknown>): UserSharedMentionRow {
  const rawMentionId = raw.mention_id ?? raw.id
  const rawComment = raw.comment ?? raw.message ?? null
  const rawCreatedAt = raw.created_at ?? raw.mention_created_at ?? null
  const rawCreatedBy = raw.created_by ?? raw.mention_created_by ?? null
  const rawAuthorName = raw.mention_created_by_name ?? raw.author_name ?? raw.author_full_name ?? null
  const rawAuthorEmail = raw.mention_created_by_email ?? raw.author_email ?? null
  const rawAuthorPhoto = raw.mention_created_by_photo ?? raw.author_photo ?? null
  const rawContextType = raw.thread_context_type ?? raw.context_type ?? null
  const participants = Array.isArray(raw.participants)
    ? (raw.participants as unknown[])
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null
          const candidate = entry as Record<string, unknown>
          const id = Number(candidate.id)
          if (!Number.isFinite(id) || id <= 0) return null
          return {
            id,
            full_name: candidate.full_name != null ? String(candidate.full_name) : null,
            photo: candidate.photo != null ? String(candidate.photo) : null,
            email: candidate.email != null ? String(candidate.email) : null,
          }
        })
        .filter(Boolean) as Array<{
        id: number
        full_name: string | null
        photo: string | null
        email: string | null
      }>
    : []
  return {
    mention_id: Number(rawMentionId),
    thread_id: Number(raw.thread_id),
    comment: rawComment != null ? String(rawComment) : null,
    attachment: raw.attachment != null ? String(raw.attachment) : null,
    created_at: rawCreatedAt != null ? String(rawCreatedAt) : null,
    created_by: rawCreatedBy != null ? Number(rawCreatedBy) : null,
    mention_created_by_name: rawAuthorName != null ? String(rawAuthorName) : null,
    mention_created_by_email: rawAuthorEmail != null ? String(rawAuthorEmail) : null,
    mention_created_by_photo: rawAuthorPhoto != null ? String(rawAuthorPhoto) : null,
    participant_user_ids: parseParticipantIds(raw.participant_user_ids),
    participants,
    thread_title: raw.thread_title != null ? String(raw.thread_title) : null,
    thread_context_type: normalizeContext(rawContextType),
    task_id: raw.task_id != null ? Number(raw.task_id) : null,
    task_title: raw.task_title != null ? String(raw.task_title) : null,
    project_id: raw.project_id != null ? Number(raw.project_id) : null,
    project_name: raw.project_name != null ? String(raw.project_name) : null,
  }
}

const PAGE_SIZE = 30

export function useUserSharedMentionsInfinite(
  meUserId: number | null,
  otherUserId: number | null,
  enabled: boolean,
) {
  const supabase = createClientComponentClient()

  return useInfiniteQuery({
    queryKey: ["user-shared-mentions", meUserId, otherUserId],
    enabled: Boolean(enabled && meUserId != null && otherUserId != null && meUserId > 0 && otherUserId > 0),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = Number(pageParam) || 0
      const { data, error } = await supabase.rpc("get_user_shared_mentions", {
        p_me_user_id: meUserId,
        p_other_user_id: otherUserId,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      })
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeMentionRow)
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.length || lastPage.length < PAGE_SIZE) return undefined
      return allPages.reduce((acc, p) => acc + (p?.length ?? 0), 0)
    },
  })
}
