import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

import type { SuggestionItem } from '../lib/types/planner-item'

type TaskSuggestionRow = {
  id: number
  project_id: number
  assigned_to_id?: number | null
  assigned_to_name?: string | null
  assigned_to_photo?: string | null
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

type ContentTypeRow = {
  id: number
  title: string | null
}

type ChannelRow = {
  id: number
  name: string | null
}

function toIsoDate(value: Date): string {
  // planned_for_date is a date column (YYYY-MM-DD). Use local date -> ISO date slice.
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).toISOString().slice(0, 10)
}

function normalizeIds(values: number[] | null | undefined): number[] {
  if (!Array.isArray(values)) return []
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
}

function mapSuggestionRowToPlannerItem(args: {
  row: TaskSuggestionRow
  projectById?: Map<number, ProjectRow>
  contentTypeById?: Map<number, ContentTypeRow>
  channelById?: Map<number, ChannelRow>
}): SuggestionItem {
  const { row, projectById, contentTypeById, channelById } = args
  const title =
    row.proposed_title?.trim() ||
    row.ai_title?.trim() ||
    'Untitled suggestion'

  const briefing = (row.proposed_briefing ?? row.ai_briefing ?? null) as string | null
  const plannedDate = row.planned_for_date ?? null
  const updatedAt = row.updated_at ?? row.created_at ?? new Date().toISOString()
  const project = projectById?.get(row.project_id)
  const channelIds = normalizeIds(row.channel_ids)
  const channelNames = channelIds
    .map((id) => channelById?.get(id)?.name ?? null)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  const contentType = row.content_type_id != null ? contentTypeById?.get(Number(row.content_type_id)) : null

  return {
    kind: 'suggestion',
    board_item_id: `suggestion:${row.id}`,
    entity_type: 'suggestion',
    entity_id: row.id,
    id: row.id,
    suggestion_id: row.id,
    title,
    assigned_to_id: row.assigned_to_id ?? null,
    assigned_to_name: row.assigned_to_name ?? null,
    assigned_to_photo: row.assigned_to_photo ?? null,
    project_id_int: row.project_id,
    project_name: project?.name ?? null,
    project_color: project?.color ?? null,
    project_logo: (project as any)?.logo ?? null,
    project_status_id: -1,
    project_status_name: 'Suggestions',
    project_status_color: null,
    delivery_date: plannedDate,
    publication_date: plannedDate,
    is_overdue: null,
    is_publication_overdue: null,
    updated_at: updatedAt,
    created_at: row.created_at ?? null,
    planned_for_date: plannedDate,
    content_type_id: row.content_type_id,
    content_type_title: contentType?.title ?? null,
    production_type_id: null,
    production_type_title: null,
    language_id: null,
    language_code: null,
    channel_names: channelNames,
    search_vector: undefined,
    briefing,
    channel_ids: channelIds,
    source_key: row.source_key ?? null,
    raw_suggestion: row,
  }
}

export function useTaskSuggestionsQuery(args: {
  /**
   * When omitted/empty, suggestions are loaded for all projects the user can access (RLS enforced).
   * When provided, suggestions are filtered to those project ids.
   */
  projectIds?: number[] | null
  contentTypeIds?: number[] | null
  channelIds?: number[] | null
  q?: string | null
  from: Date
  to: Date
  limit?: number
  enabled?: boolean
  cacheKeyParts?: unknown[]
}) {
  const {
    projectIds,
    contentTypeIds,
    channelIds,
    q,
    from,
    to,
    limit = 500,
    enabled = true,
    cacheKeyParts = [],
  } = args
  const normalizedProjectIds =
    Array.isArray(projectIds) ? projectIds.map(Number).filter((n) => Number.isFinite(n)) : []
  const normalizedContentTypeIds =
    Array.isArray(contentTypeIds) ? contentTypeIds.map(Number).filter((n) => Number.isFinite(n)) : []
  const normalizedChannelIds =
    Array.isArray(channelIds) ? channelIds.map(Number).filter((n) => Number.isFinite(n)) : []
  const projectKey =
    normalizedProjectIds.length > 0 ? normalizedProjectIds.slice().sort((a, b) => a - b).join(',') : 'all'
  const contentTypeKey =
    normalizedContentTypeIds.length > 0
      ? normalizedContentTypeIds.slice().sort((a, b) => a - b).join(',')
      : 'all'
  const channelKey =
    normalizedChannelIds.length > 0
      ? normalizedChannelIds.slice().sort((a, b) => a - b).join(',')
      : 'all'
  const normalizedQ = (q ?? '').trim()

  return useQuery<SuggestionItem[]>({
    queryKey: [
      'task-suggestions',
      projectKey,
      contentTypeKey,
      channelKey,
      toIsoDate(from),
      toIsoDate(to),
      normalizedQ,
      limit,
      ...cacheKeyParts,
    ],
    enabled: enabled,
    queryFn: async () => {
      const supabase = createClientComponentClient()
      const fromIso = toIsoDate(from)
      const toIso = toIsoDate(to)

      const { data, error } = await supabase.rpc('task_suggestions_filtered', {
        p_project_ids: normalizedProjectIds.length > 0 ? normalizedProjectIds : null,
        p_content_type_ids: normalizedContentTypeIds.length > 0 ? normalizedContentTypeIds : null,
        p_channels: normalizedChannelIds.length > 0 ? normalizedChannelIds : null,
        p_planned_for_date_gte: fromIso,
        p_planned_for_date_lte: toIso,
        p_q: normalizedQ.length > 0 ? normalizedQ : null,
        p_limit: limit,
      })
      if (error) throw error

      const rows = Array.isArray(data) ? (data as TaskSuggestionRow[]) : []

      // Best-effort metadata lookups for display parity with tasks.
      let projectById: Map<number, ProjectRow> | undefined
      let contentTypeById: Map<number, ContentTypeRow> | undefined
      let channelById: Map<number, ChannelRow> | undefined
      try {
        const projectIdsFromRows = Array.from(
          new Set(rows.map((row) => Number(row.project_id)).filter((id) => Number.isFinite(id))),
        )
        const contentTypeIdsFromRows = Array.from(
          new Set(
            rows
              .map((row) => Number(row.content_type_id))
              .filter((id) => Number.isFinite(id)),
          ),
        )
        const channelIdsFromRows = Array.from(
          new Set(rows.flatMap((row) => normalizeIds(row.channel_ids))),
        )

        const [projectsRes, contentTypesRes, channelsRes] = await Promise.all([
          projectIdsFromRows.length > 0
            ? supabase.from('projects').select('id,name,color,logo').in('id', projectIdsFromRows)
            : Promise.resolve({ data: [], error: null } as any),
          contentTypeIdsFromRows.length > 0
            ? supabase.from('content_types').select('id,title').in('id', contentTypeIdsFromRows)
            : Promise.resolve({ data: [], error: null } as any),
          channelIdsFromRows.length > 0
            ? supabase.from('channels').select('id,name').in('id', channelIdsFromRows)
            : Promise.resolve({ data: [], error: null } as any),
        ])

        if (Array.isArray(projectsRes.data)) {
          projectById = new Map((projectsRes.data as ProjectRow[]).map((project) => [Number(project.id), project]))
        }
        if (Array.isArray(contentTypesRes.data)) {
          contentTypeById = new Map(
            (contentTypesRes.data as ContentTypeRow[]).map((row) => [Number(row.id), row]),
          )
        }
        if (Array.isArray(channelsRes.data)) {
          channelById = new Map((channelsRes.data as ChannelRow[]).map((row) => [Number(row.id), row]))
        }
      } catch {
        // ignore: suggestions still render without project metadata
      }

      return rows.map((row) =>
        mapSuggestionRowToPlannerItem({
          row,
          projectById,
          contentTypeById,
          channelById,
        }),
      )
    },
    staleTime: 60_000,
  })
}


