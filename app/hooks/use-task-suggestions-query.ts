import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

import type { SuggestionItem } from '../lib/types/planner-item'

type TaskSuggestionRow = {
  id: number
  project_id: number
  is_deleted: boolean | null
  status: string | null
  planned_for_date: string | null
  proposed_title: string | null
  ai_title: string | null
  proposed_briefing: string | null
  ai_briefing: string | null
  content_type_id: number | null
  channel_ids: number[] | null
  source_key: string | null
  created_at: string | null
  updated_at: string | null
}

type ProjectRow = {
  id: number
  name: string | null
  color: string | null
  logo?: string | null
}

function toIsoDate(value: Date): string {
  // planned_for_date is a date column (YYYY-MM-DD). Use local date -> ISO date slice.
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).toISOString().slice(0, 10)
}

function mapSuggestionRowToPlannerItem(row: TaskSuggestionRow, projectById?: Map<number, ProjectRow>): SuggestionItem {
  const title =
    row.proposed_title?.trim() ||
    row.ai_title?.trim() ||
    'Untitled suggestion'

  const briefing = (row.proposed_briefing ?? row.ai_briefing ?? null) as string | null
  const plannedDate = row.planned_for_date ?? null
  const updatedAt = row.updated_at ?? row.created_at ?? new Date().toISOString()
  const project = projectById?.get(row.project_id)

  return {
    kind: 'suggestion',
    entity_type: 'suggestion',
    entity_id: row.id,
    id: row.id,
    title,
    assigned_to_id: null,
    assigned_to_name: null,
    assigned_to_photo: null,
    project_id_int: row.project_id,
    project_name: project?.name ?? null,
    project_color: project?.color ?? null,
    project_logo: (project as any)?.logo ?? null,
    project_status_id: null,
    project_status_name: null,
    project_status_color: null,
    delivery_date: plannedDate,
    publication_date: plannedDate,
    is_overdue: null,
    is_publication_overdue: null,
    updated_at: updatedAt,
    content_type_id: row.content_type_id,
    content_type_title: null,
    production_type_id: null,
    production_type_title: null,
    language_id: null,
    language_code: null,
    search_vector: undefined,
    briefing,
    channel_ids: Array.isArray(row.channel_ids) ? row.channel_ids : [],
    source_key: row.source_key ?? null,
  }
}

export function useTaskSuggestionsQuery(args: {
  /**
   * When omitted/empty, suggestions are loaded for all projects the user can access (RLS enforced).
   * When provided, suggestions are filtered to those project ids.
   */
  projectIds?: number[] | null
  from: Date
  to: Date
  enabled?: boolean
  cacheKeyParts?: unknown[]
}) {
  const { projectIds, from, to, enabled = true, cacheKeyParts = [] } = args
  const normalizedProjectIds =
    Array.isArray(projectIds) ? projectIds.map(Number).filter((n) => Number.isFinite(n)) : []
  const projectKey =
    normalizedProjectIds.length > 0 ? normalizedProjectIds.slice().sort((a, b) => a - b).join(',') : 'all'

  return useQuery<SuggestionItem[]>({
    queryKey: ['task-suggestions', projectKey, toIsoDate(from), toIsoDate(to), ...cacheKeyParts],
    enabled: enabled,
    queryFn: async () => {
      const supabase = createClientComponentClient()
      const fromIso = toIsoDate(from)
      const toIso = toIsoDate(to)

      let query = supabase
        .from('task_suggestions')
        .select(
          [
            'id',
            'project_id',
            'is_deleted',
            'status',
            'planned_for_date',
            'proposed_title',
            'ai_title',
            'proposed_briefing',
            'ai_briefing',
            'content_type_id',
            'channel_ids',
            'source_key',
            'created_at',
            'updated_at',
          ].join(','),
        )
        // Some rows may use NULL for "not deleted" depending on legacy defaults.
        .or('is_deleted.is.null,is_deleted.eq.false')
        .eq('status', 'pending')
        .gte('planned_for_date', fromIso)
        .lte('planned_for_date', toIso)
        .order('planned_for_date', { ascending: true })

      if (normalizedProjectIds.length > 0) {
        query = query.in('project_id', normalizedProjectIds)
      }

      const { data, error } = await query
        // Some rows may use NULL for "not deleted" depending on legacy defaults.

      if (error) throw error

      const rows = (data ?? []) as unknown as TaskSuggestionRow[]

      // Best-effort: load project metadata for display parity with tasks (name/color).
      let projectById: Map<number, ProjectRow> | undefined
      try {
        const ids = Array.from(new Set(rows.map((r) => r.project_id))).filter((n) => Number.isFinite(n))
        if (ids.length > 0) {
          const { data: projects, error: projErr } = await supabase
            .from('projects')
            .select('id,name,color,logo')
            .in('id', ids)
          if (!projErr && Array.isArray(projects)) {
            projectById = new Map((projects as any[]).map((p) => [Number(p.id), p as any]))
          }
        }
      } catch {
        // ignore: suggestions still render without project metadata
      }

      return rows.map((r) => mapSuggestionRowToPlannerItem(r, projectById))
    },
    staleTime: 60_000,
  })
}


