'use client'

import { useEffect, useRef } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

/**
 * Normalized row from task_component_outputs (INSERT/UPDATE payload.new).
 * Used to merge into local component output state without full refetch.
 */
export interface TaskComponentOutputRow {
  task_id: number
  channel_id: number
  task_component_id: string | null
  briefing_component_id: number | null
  content_text: string | null
  content_json: unknown
  updated_at: string | null
}

export type TaskComponentOutputChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

export interface UseTaskComponentOutputsRealtimeOptions {
  /** Current task id; subscription is scoped to this task. */
  taskId: number | null
  /** Current channel id; only rows for this channel are reported (avoids overwriting wrong channel when viewing one channel). */
  channelId: number | null
  /** When false, no subscription is created. */
  enabled?: boolean
  /**
   * Called on INSERT/UPDATE/DELETE for rows in task_component_outputs for this task.
   * Only called when row.channel_id === channelId so the open view stays in sync.
   */
  onChange?: (row: TaskComponentOutputRow, event: TaskComponentOutputChangeEvent) => void
}

/**
 * Subscribes to task_component_outputs for the given task and reports INSERT/UPDATE
 * for the given channel so the task content tab can update in place without refetch.
 * Mirrors the pattern used in use-thread-mentions (channel per scope, cleanup on unmount/scope change).
 */
export function useTaskComponentOutputsRealtime({
  taskId,
  channelId,
  enabled = true,
  onChange,
}: UseTaskComponentOutputsRealtimeOptions) {
  const supabase = createClientComponentClient()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const emitIfValid = (
    raw: Record<string, unknown> | undefined,
    event: TaskComponentOutputChangeEvent
  ) => {
    const row = raw
    if (!row || typeof row.task_id !== 'number' || typeof row.channel_id !== 'number') return
    if (channelId != null && row.channel_id !== channelId) return
    const hasTaskComponentId = typeof row.task_component_id === 'string' && row.task_component_id.length > 0
    const briefingId = row.briefing_component_id != null ? Number(row.briefing_component_id) : null
    const hasBriefingId = typeof briefingId === 'number' && !Number.isNaN(briefingId)
    if (!hasTaskComponentId && !hasBriefingId) return
    const cb = onChangeRef.current
    if (!cb) return
    cb(
      {
        task_id: row.task_id,
        channel_id: row.channel_id,
        task_component_id: hasTaskComponentId ? String(row.task_component_id) : null,
        briefing_component_id: hasBriefingId ? briefingId : null,
        content_text: typeof row.content_text === 'string' ? row.content_text : null,
        content_json: row.content_json ?? null,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
      },
      event
    )
  }

  useEffect(() => {
    if (!enabled || taskId == null) return

    const channel = supabase
      .channel(`task-component-outputs-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_component_outputs',
          filter: `task_id=eq.${taskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          emitIfValid(payload.new, 'INSERT')
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'task_component_outputs',
          filter: `task_id=eq.${taskId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          emitIfValid(payload.new, 'UPDATE')
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'task_component_outputs',
          filter: `task_id=eq.${taskId}`,
        },
        (payload: { old: Record<string, unknown> }) => {
          emitIfValid(payload.old, 'DELETE')
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, taskId, channelId, enabled])
}
