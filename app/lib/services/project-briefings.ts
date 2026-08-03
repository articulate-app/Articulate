import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

/**
 * Types for project briefings
 */
export interface ProjectBriefingType {
  project_id: number
  briefing_type_id: number
  display_title: string
  display_description: string | null
  global_title?: string
  global_description?: string | null
  custom_title?: string | null
  custom_description?: string | null
  is_default: boolean
  position: number | null
  components_count: number
}

export interface ProjectBriefingComponent {
  project_id: number
  briefing_type_id: number
  component_id: number
  component_title: string
  component_description: string | null
  effective_title: string
  effective_description: string | null
  position: number | null
  source: 'global' | 'project'
}

export interface ProjectComponent {
  id: number
  project_id: number
  title: string
  description: string | null
  rules: string | null
  created_at: string
  updated_at: string
}

export interface Variant {
  variant_id: string
  content_type_id: number
  content_type_title: string
  channel_id: number | null
  channel_name: string | null
  language_id: number
  language_code: string
  briefing_type_id: number | null
  matches_briefing: boolean
}

export type ProjectComponentUsageTemplateRow = {
  briefing_type_id: number
  briefing_type_title: string
  position: number | null
}

export type ProjectComponentUsageCtChannelRow = {
  content_type_id: number
  content_type_title: string
  channel_id: number
  channel_title: string
  briefing_type_id: number
  briefing_type_title: string
  position: number | null
  custom_title: string | null
  custom_description: string | null
}

export type ProjectComponentUsage = {
  templates: ProjectComponentUsageTemplateRow[]
  ctChannel: ProjectComponentUsageCtChannelRow[]
}

export type ProjectComponentUsageIndex = Record<number, { usage_labels: string[] }>

export type ComponentIndexItem = {
  key: string // `${kind}:${componentId}`
  kind: 'project' | 'global'
  component_id: number // project: project_component_id; global: briefing_component_id
  title: string
  description: string | null
  usage_labels: string[]
}

/**
 * Row shape returned by RPC project_components_latest(p_project_id).
 * One row per component_key (global + project, excluding task-only).
 */
export type ProjectComponentListRow = {
  component_key: string // 'g:<id>' | 'p:<id>'
  component_id: number
  is_project_component: boolean
  effective_title: string
  effective_description: string | null
  source: 'global' | 'project'
}

function toSortedUniqueNumberArray(values: Array<number | null | undefined>) {
  return Array.from(new Set(values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))).sort(
    (a, b) => a - b
  )
}

/**
 * Fetch the up-to-date list of all project-saved components (global + project) from RPC.
 * Excludes task-only components. One row per component_key; title/description prefer PCCB/PBTC overrides.
 */
export async function fetchProjectComponentsLatest(
  projectId: number
): Promise<{ data: ProjectComponentListRow[] | null; error: any }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc('project_components_latest', {
    p_project_id: projectId,
  })
  if (error) return { data: null, error }
  return { data: (data ?? []) as ProjectComponentListRow[], error: null }
}

/** Normalize RPC component_key (e.g. "p:123", "g:456", or "project:123", "global:456") to ComponentIndexItem key. */
function normalizeComponentKey(component_key: string): { key: string; kind: 'project' | 'global'; component_id: number } {
  const raw = String(component_key).trim()
  const parts = raw.split(':')
  const id = parseInt(parts[1] ?? '', 10)
  const component_id = Number.isFinite(id) ? id : 0
  const lower = raw.toLowerCase()
  if (lower.startsWith('p:') || lower.startsWith('project:')) {
    return { key: `project:${component_id}`, kind: 'project', component_id }
  }
  return { key: `global:${component_id}`, kind: 'global', component_id }
}

/**
 * Load a union list of project + global components for the Project Components list.
 * Uses RPC project_components_latest as source of truth (effective_title / effective_description).
 * Fetches usage labels from template + CT×channel for filtering/display and merges.
 */
export async function loadProjectComponentIndex(
  projectId: number
): Promise<{ data: ComponentIndexItem[] | null; error: any }> {
  const supabase = createClientComponentClient()

  try {
    const { data: rows, error: rpcError } = await fetchProjectComponentsLatest(projectId)
    if (rpcError) throw rpcError
    const listRows = rows ?? []

    const itemsByKey = new Map<string, ComponentIndexItem>()
    for (const row of listRows) {
      const { key, kind, component_id } = normalizeComponentKey(row.component_key)
      itemsByKey.set(key, {
        key,
        kind,
        component_id,
        title: row.effective_title,
        description: row.effective_description ?? null,
        usage_labels: [],
      })
    }

    if (itemsByKey.size === 0) {
      return { data: [], error: null }
    }

    const briefingTypesRes = await supabase
      .from('v_project_briefing_types')
      .select('briefing_type_id, display_title')
      .eq('project_id', projectId)
    if (briefingTypesRes.error) throw briefingTypesRes.error
    const briefingTypeTitleById = new Map<number, string>(
      ((briefingTypesRes.data || []) as any[]).map((bt: any) => [bt.briefing_type_id, bt.display_title])
    )

    const [templateResolvedRes, ctRes] = await Promise.all([
      supabase
        .from('v_project_briefing_types_components_resolved')
        .select('briefing_type_id, component_id, is_project_component')
        .eq('project_id', projectId),
      supabase
        .from('project_ct_channel_briefing_components')
        .select('content_type_id, channel_id, briefing_type_id, briefing_component_id, project_component_id')
        .eq('project_id', projectId),
    ])
    if (templateResolvedRes.error) throw templateResolvedRes.error
    if (ctRes.error) throw ctRes.error

    const templateGlobalRows = (templateResolvedRes.data || []) as Array<{
      briefing_type_id: number
      component_id: number
      is_project_component: boolean
    }>
    const ctRows = (ctRes.data || []) as Array<{
      content_type_id: number
      channel_id: number
      briefing_type_id: number | null
      briefing_component_id: number | null
      project_component_id: number | null
    }>

    const contentTypeIds = toSortedUniqueNumberArray(ctRows.map(r => r.content_type_id))
    const channelIds = toSortedUniqueNumberArray(ctRows.map(r => r.channel_id))
    const defaultBriefingTypeByPair = new Map<string, number | null>()
    if (ctRows.some(r => r.briefing_type_id == null)) {
      const defaultsRes = await supabase
        .from('project_ct_channel_briefings')
        .select('content_type_id, channel_id, briefing_type_id, is_default')
        .eq('project_id', projectId)
        .eq('is_default', true)
        .in('content_type_id', contentTypeIds)
        .in('channel_id', channelIds)
      if (defaultsRes.error) throw defaultsRes.error
      ;((defaultsRes.data || []) as any[]).forEach((row: any) => {
        defaultBriefingTypeByPair.set(`${row.content_type_id}:${row.channel_id}`, row.briefing_type_id ?? null)
      })
    }

    for (const row of templateGlobalRows) {
      const key = `global:${row.component_id}`
      const item = itemsByKey.get(key)
      if (!item) continue
      const briefingTitle = briefingTypeTitleById.get(row.briefing_type_id) ?? `Briefing ${row.briefing_type_id}`
      item.usage_labels.push(normalizeUsageLabel([briefingTitle]))
    }

    const [contentTypesRes, channelsRes] = await Promise.all([
      contentTypeIds.length ? supabase.from('content_types').select('id, title').in('id', contentTypeIds) : Promise.resolve({ data: [], error: null } as any),
      channelIds.length ? supabase.from('channels').select('id, name').in('id', channelIds) : Promise.resolve({ data: [], error: null } as any),
    ])
    if (contentTypesRes.error) throw contentTypesRes.error
    if (channelsRes.error) throw channelsRes.error
    const contentTypeTitleById = new Map<number, string>(((contentTypesRes.data || []) as any[]).map((ct: any) => [ct.id, ct.title]))
    const channelTitleById = new Map<number, string>(((channelsRes.data || []) as any[]).map((ch: any) => [ch.id, ch.name]))

    for (const row of ctRows) {
      const effectiveBriefingTypeId =
        row.briefing_type_id ?? defaultBriefingTypeByPair.get(`${row.content_type_id}:${row.channel_id}`) ?? null
      if (!effectiveBriefingTypeId) continue
      const briefingTitle = briefingTypeTitleById.get(effectiveBriefingTypeId) ?? `Briefing ${effectiveBriefingTypeId}`
      const channelTitle = channelTitleById.get(row.channel_id) ?? `Channel ${row.channel_id}`
      const contentTypeTitle = contentTypeTitleById.get(row.content_type_id) ?? `Content type ${row.content_type_id}`
      const label = normalizeUsageLabel([briefingTitle, channelTitle, contentTypeTitle])
      if (typeof row.project_component_id === 'number') {
        const item = itemsByKey.get(`project:${row.project_component_id}`)
        if (item) item.usage_labels.push(label)
      }
      if (typeof row.briefing_component_id === 'number') {
        const item = itemsByKey.get(`global:${row.briefing_component_id}`)
        if (item) item.usage_labels.push(label)
      }
    }

    for (const item of itemsByKey.values()) {
      item.usage_labels = Array.from(new Set(item.usage_labels))
    }

    const items = Array.from(itemsByKey.values()).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'project' ? -1 : 1
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    })

    return { data: items, error: null }
  } catch (error: any) {
    return { data: null, error }
  }
}

/**
 * Fetch project briefing types from view
 */
export async function fetchProjectBriefingTypes(
  projectId: number
): Promise<{ data: ProjectBriefingType[] | null; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase
    .from('v_project_briefing_types')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('display_title', { ascending: true })

  return { data, error }
}

/**
 * Fetch components for a briefing type from resolved view
 */
export async function fetchProjectBriefingComponents(
  projectId: number,
  briefingTypeId: number
): Promise<{ data: ProjectBriefingComponent[] | null; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase
    .from('v_project_briefing_types_components_resolved')
    .select('*')
    .eq('project_id', projectId)
    .eq('briefing_type_id', briefingTypeId)
    .order('position', { ascending: true, nullsFirst: false })
    .order('effective_title', { ascending: true })

  return { data, error }
}

/**
 * Fetch project-scoped components
 */
export async function fetchProjectComponents(
  projectId: number
): Promise<{ data: ProjectComponent[] | null; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase
    .from('project_briefing_components')
    .select('*')
    .eq('project_id', projectId)
    .order('title', { ascending: true })

  return { data, error }
}

/**
 * Update a project-scoped component by (project_id, id).
 * This is intentionally stricter than the legacy `update_project_component` RPC.
 */
export async function updateProjectComponentInProject(
  projectId: number,
  projectComponentId: number,
  updates: { title?: string; description?: string | null }
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase
    .from('project_briefing_components')
    .update({
      ...(typeof updates.title === 'string' ? { title: updates.title } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
    })
    .eq('project_id', projectId)
    .eq('id', projectComponentId)

  return { data, error }
}

function normalizeUsageLabel(parts: Array<string | null | undefined>) {
  return parts
    .map(p => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(' - ')
}

/**
 * Fetch usage rows (templates + CT×Channel briefings) for a single project component.
 * Network calls are done in parallel.
 */
export async function fetchProjectComponentUsage(
  projectId: number,
  projectComponentId: number
): Promise<{ data: ProjectComponentUsage | null; error: any }> {
  const supabase = createClientComponentClient()

  try {
    const [templatesBase, ctBase] = await Promise.all([
      supabase
        .from('project_briefing_types_components')
        .select('briefing_type_id, position')
        .eq('project_id', projectId)
        .eq('project_component_id', projectComponentId),
      supabase
        .from('project_ct_channel_briefing_components')
        .select(
          'content_type_id, channel_id, briefing_type_id, position, custom_title, custom_description'
        )
        .eq('project_id', projectId)
        .eq('project_component_id', projectComponentId),
    ])

    if (templatesBase.error) throw templatesBase.error
    if (ctBase.error) throw ctBase.error

    const templateBriefingTypeIds = Array.from(
      new Set((templatesBase.data || []).map((r: any) => r.briefing_type_id).filter(Boolean))
    ) as number[]

    const ctRows = (ctBase.data || []) as Array<{
      content_type_id: number
      channel_id: number
      briefing_type_id: number | null
      position: number | null
      custom_title: string | null
      custom_description: string | null
    }>

    const contentTypeIds = Array.from(new Set(ctRows.map(r => r.content_type_id))) as number[]
    const channelIds = Array.from(new Set(ctRows.map(r => r.channel_id))) as number[]

    const missingBriefingPairs = ctRows
      .filter(r => !r.briefing_type_id)
      .map(r => ({ content_type_id: r.content_type_id, channel_id: r.channel_id }))

    const missingPairsKey = new Set(
      missingBriefingPairs.map(p => `${p.content_type_id}:${p.channel_id}`)
    )

    const [briefingTypesRes, contentTypesRes, channelsRes, defaultsRes] = await Promise.all([
      // briefing types referenced by templates or ct rows (plus defaults)
      supabase
        .from('briefing_types')
        .select('id, title')
        .in('id', Array.from(new Set(ctRows.map(r => r.briefing_type_id).filter(Boolean) as number[])).concat(templateBriefingTypeIds)),
      supabase.from('content_types').select('id, title').in('id', contentTypeIds),
      supabase.from('channels').select('id, name').in('id', channelIds),
      missingPairsKey.size
        ? supabase
            .from('project_ct_channel_briefings')
            .select('content_type_id, channel_id, briefing_type_id, is_default')
            .eq('project_id', projectId)
            .eq('is_default', true)
            .in('content_type_id', Array.from(new Set(missingBriefingPairs.map(p => p.content_type_id))))
        : Promise.resolve({ data: [], error: null } as any),
    ])

    if (briefingTypesRes.error) throw briefingTypesRes.error
    if (contentTypesRes.error) throw contentTypesRes.error
    if (channelsRes.error) throw channelsRes.error
    if (defaultsRes.error) throw defaultsRes.error

    const briefingTypeTitleById = new Map<number, string>(
      (briefingTypesRes.data || []).map((bt: any) => [bt.id, bt.title])
    )
    const contentTypeTitleById = new Map<number, string>(
      (contentTypesRes.data || []).map((ct: any) => [ct.id, ct.title])
    )
    const channelTitleById = new Map<number, string>(
      (channelsRes.data || []).map((ch: any) => [ch.id, ch.name])
    )

    const defaultBriefingTypeByPair = new Map<string, number | null>()
    ;((defaultsRes.data || []) as any[]).forEach((row: any) => {
      defaultBriefingTypeByPair.set(`${row.content_type_id}:${row.channel_id}`, row.briefing_type_id ?? null)
    })

    const templates: ProjectComponentUsageTemplateRow[] = (templatesBase.data || []).map((row: any) => ({
      briefing_type_id: row.briefing_type_id,
      briefing_type_title: briefingTypeTitleById.get(row.briefing_type_id) ?? 'Briefing',
      position: row.position ?? null,
    }))

    const ctChannel: ProjectComponentUsageCtChannelRow[] = ctRows
      .map((row) => {
        const effectiveBriefingTypeId =
          row.briefing_type_id ?? defaultBriefingTypeByPair.get(`${row.content_type_id}:${row.channel_id}`) ?? null

        if (!effectiveBriefingTypeId) {
          // can't render without a briefing type; keep but mark id=0 so UI can filter it out
        }

        return {
          content_type_id: row.content_type_id,
          content_type_title: contentTypeTitleById.get(row.content_type_id) ?? 'Content type',
          channel_id: row.channel_id,
          channel_title: channelTitleById.get(row.channel_id) ?? 'Channel',
          briefing_type_id: effectiveBriefingTypeId ?? 0,
          briefing_type_title: effectiveBriefingTypeId
            ? briefingTypeTitleById.get(effectiveBriefingTypeId) ?? 'Briefing'
            : 'Briefing',
          position: row.position ?? null,
          custom_title: row.custom_title ?? null,
          custom_description: row.custom_description ?? null,
        }
      })
      .filter(r => r.channel_id && r.content_type_id)

    return { data: { templates, ctChannel }, error: null }
  } catch (error: any) {
    return { data: null, error }
  }
}

/**
 * Fetch a compact usage-label index for ALL project components in a project.
 * This is used to render usage chips in the left list with minimal network calls.
 */
export async function fetchProjectComponentUsageIndex(
  projectId: number
): Promise<{ data: ProjectComponentUsageIndex | null; error: any }> {
  const supabase = createClientComponentClient()

  try {
    const [templatesBase, ctBase] = await Promise.all([
      supabase
        .from('project_briefing_types_components')
        .select('project_component_id, briefing_type_id')
        .eq('project_id', projectId)
        .not('project_component_id', 'is', null),
      supabase
        .from('project_ct_channel_briefing_components')
        .select('project_component_id, content_type_id, channel_id, briefing_type_id')
        .eq('project_id', projectId)
        .not('project_component_id', 'is', null),
    ])

    if (templatesBase.error) throw templatesBase.error
    if (ctBase.error) throw ctBase.error

    const templateBriefingTypeIds = Array.from(
      new Set((templatesBase.data || []).map((r: any) => r.briefing_type_id).filter(Boolean))
    ) as number[]

    const ctRows = (ctBase.data || []) as Array<{
      project_component_id: number
      content_type_id: number
      channel_id: number
      briefing_type_id: number | null
    }>

    const contentTypeIds = Array.from(new Set(ctRows.map(r => r.content_type_id))) as number[]
    const channelIds = Array.from(new Set(ctRows.map(r => r.channel_id))) as number[]

    const missingPairs = ctRows
      .filter(r => !r.briefing_type_id)
      .map(r => ({ content_type_id: r.content_type_id, channel_id: r.channel_id }))

    const [briefingTypesRes, contentTypesRes, channelsRes, defaultsRes] = await Promise.all([
      supabase
        .from('briefing_types')
        .select('id, title')
        .in('id', Array.from(new Set(ctRows.map(r => r.briefing_type_id).filter(Boolean) as number[])).concat(templateBriefingTypeIds)),
      supabase.from('content_types').select('id, title').in('id', contentTypeIds),
      supabase.from('channels').select('id, name').in('id', channelIds),
      missingPairs.length
        ? supabase
            .from('project_ct_channel_briefings')
            .select('content_type_id, channel_id, briefing_type_id, is_default')
            .eq('project_id', projectId)
            .eq('is_default', true)
            .in('content_type_id', Array.from(new Set(missingPairs.map(p => p.content_type_id))))
        : Promise.resolve({ data: [], error: null } as any),
    ])

    if (briefingTypesRes.error) throw briefingTypesRes.error
    if (contentTypesRes.error) throw contentTypesRes.error
    if (channelsRes.error) throw channelsRes.error
    if (defaultsRes.error) throw defaultsRes.error

    const briefingTypeTitleById = new Map<number, string>(
      (briefingTypesRes.data || []).map((bt: any) => [bt.id, bt.title])
    )
    const contentTypeTitleById = new Map<number, string>(
      (contentTypesRes.data || []).map((ct: any) => [ct.id, ct.title])
    )
    const channelTitleById = new Map<number, string>(
      (channelsRes.data || []).map((ch: any) => [ch.id, ch.name])
    )

    const defaultBriefingTypeByPair = new Map<string, number | null>()
    ;((defaultsRes.data || []) as any[]).forEach((row: any) => {
      defaultBriefingTypeByPair.set(`${row.content_type_id}:${row.channel_id}`, row.briefing_type_id ?? null)
    })

    const index: ProjectComponentUsageIndex = {}
    const push = (componentId: number, label: string) => {
      if (!componentId || !label) return
      if (!index[componentId]) index[componentId] = { usage_labels: [] }
      index[componentId].usage_labels.push(label)
    }

    ;(templatesBase.data || []).forEach((row: any) => {
      const label = normalizeUsageLabel([briefingTypeTitleById.get(row.briefing_type_id) ?? 'Briefing'])
      push(row.project_component_id, label)
    })

    ctRows.forEach((row) => {
      const effectiveBriefingTypeId =
        row.briefing_type_id ?? defaultBriefingTypeByPair.get(`${row.content_type_id}:${row.channel_id}`) ?? null
      if (!effectiveBriefingTypeId) return
      const label = normalizeUsageLabel([
        briefingTypeTitleById.get(effectiveBriefingTypeId) ?? 'Briefing',
        channelTitleById.get(row.channel_id) ?? 'Channel',
        contentTypeTitleById.get(row.content_type_id) ?? 'Content type',
      ])
      push(row.project_component_id, label)
    })

    // De-dupe and keep stable ordering
    for (const key of Object.keys(index)) {
      index[Number(key)].usage_labels = Array.from(new Set(index[Number(key)].usage_labels))
    }

    return { data: index, error: null }
  } catch (error: any) {
    return { data: null, error }
  }
}

export type GlobalComponentUsageTemplateRow = {
  briefing_type_id: number
  briefing_type_title: string
  position: number | null
}

export type GlobalComponentUsageCtChannelRow = {
  content_type_id: number
  content_type_title: string
  channel_id: number
  channel_title: string
  briefing_type_id: number
  briefing_type_title: string
  position: number | null
  custom_title: string | null
  custom_description: string | null
}

export type GlobalComponentUsage = {
  system_title: string
  system_description: string | null
  templates: GlobalComponentUsageTemplateRow[]
  ctChannel: GlobalComponentUsageCtChannelRow[]
}

export async function fetchGlobalComponentUsage(
  projectId: number,
  briefingComponentId: number
): Promise<{ data: GlobalComponentUsage | null; error: any }> {
  const supabase = createClientComponentClient()

  try {
    const [systemRes, templateRes, ctRes, defaultsRes] = await Promise.all([
      supabase
        .from('briefing_components')
        .select('id, title, description')
        .eq('id', briefingComponentId)
        .single(),
      supabase
        .from('v_project_briefing_types_components_resolved')
        .select('briefing_type_id, position, component_id, is_project_component')
        .eq('project_id', projectId)
        .eq('component_id', briefingComponentId)
        .eq('is_project_component', false)
        .order('position', { ascending: true, nullsFirst: false }),
      supabase
        .from('project_ct_channel_briefing_components')
        .select('content_type_id, channel_id, briefing_type_id, position, custom_title, custom_description')
        .eq('project_id', projectId)
        .eq('briefing_component_id', briefingComponentId),
      supabase
        .from('project_ct_channel_briefings')
        .select('content_type_id, channel_id, briefing_type_id, is_default')
        .eq('project_id', projectId)
        .eq('is_default', true),
    ])

    if (systemRes.error) throw systemRes.error
    if (templateRes.error) throw templateRes.error
    if (ctRes.error) throw ctRes.error
    if (defaultsRes.error) throw defaultsRes.error

    const defaultBriefingTypeByPair = new Map<string, number | null>()
    ;(defaultsRes.data || []).forEach((row: any) => {
      defaultBriefingTypeByPair.set(`${row.content_type_id}:${row.channel_id}`, row.briefing_type_id ?? null)
    })

    const ctRows = (ctRes.data || []) as any[]
    const briefingTypeIds = new Set<number>()
    ;(templateRes.data || []).forEach((r: any) => briefingTypeIds.add(r.briefing_type_id))
    ctRows.forEach((r: any) => {
      const bt = r.briefing_type_id ?? defaultBriefingTypeByPair.get(`${r.content_type_id}:${r.channel_id}`) ?? null
      if (bt) briefingTypeIds.add(bt)
    })
    const contentTypeIds = Array.from(new Set(ctRows.map(r => r.content_type_id))) as number[]
    const channelIds = Array.from(new Set(ctRows.map(r => r.channel_id))) as number[]

    const [briefingTypesRes, contentTypesRes, channelsRes] = await Promise.all([
      briefingTypeIds.size
        ? supabase.from('briefing_types').select('id, title').in('id', Array.from(briefingTypeIds))
        : Promise.resolve({ data: [], error: null } as any),
      contentTypeIds.length
        ? supabase.from('content_types').select('id, title').in('id', contentTypeIds)
        : Promise.resolve({ data: [], error: null } as any),
      channelIds.length
        ? supabase.from('channels').select('id, name').in('id', channelIds)
        : Promise.resolve({ data: [], error: null } as any),
    ])

    if (briefingTypesRes.error) throw briefingTypesRes.error
    if (contentTypesRes.error) throw contentTypesRes.error
    if (channelsRes.error) throw channelsRes.error

    const briefingTypeTitleById = new Map<number, string>(
      (briefingTypesRes.data || []).map((bt: any) => [bt.id, bt.title])
    )
    const contentTypeTitleById = new Map<number, string>(
      (contentTypesRes.data || []).map((ct: any) => [ct.id, ct.title])
    )
    const channelTitleById = new Map<number, string>(
      (channelsRes.data || []).map((ch: any) => [ch.id, ch.name])
    )

    const templates: GlobalComponentUsageTemplateRow[] = (templateRes.data || []).map((row: any) => ({
      briefing_type_id: row.briefing_type_id,
      briefing_type_title: briefingTypeTitleById.get(row.briefing_type_id) ?? 'Briefing',
      position: row.position ?? null,
    }))

    const ctChannel: GlobalComponentUsageCtChannelRow[] = ctRows
      .map((row: any) => {
        const bt =
          row.briefing_type_id ?? defaultBriefingTypeByPair.get(`${row.content_type_id}:${row.channel_id}`) ?? null
        if (!bt) return null
        return {
          content_type_id: row.content_type_id,
          content_type_title: contentTypeTitleById.get(row.content_type_id) ?? 'Content type',
          channel_id: row.channel_id,
          channel_title: channelTitleById.get(row.channel_id) ?? 'Channel',
          briefing_type_id: bt,
          briefing_type_title: briefingTypeTitleById.get(bt) ?? 'Briefing',
          position: row.position ?? null,
          custom_title: row.custom_title ?? null,
          custom_description: row.custom_description ?? null,
        }
      })
      .filter(Boolean) as GlobalComponentUsageCtChannelRow[]

    return {
      data: {
        system_title: systemRes.data?.title ?? 'Component',
        system_description: systemRes.data?.description ?? null,
        templates,
        ctChannel,
      },
      error: null,
    }
  } catch (error: any) {
    return { data: null, error }
  }
}

/**
 * Fetch available briefing types (not yet added to project)
 */
export async function fetchAvailableBriefingTypes(
  projectId: number
): Promise<{ data: Array<{ id: number; title: string; description: string | null }> | null; error: any }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc('project_available_briefing_types', {
    p_project_id: projectId,
  })
  if (error) return { data: null, error }

  const mapped = ((data || []) as any[]).map((row: any) => ({
    id: Number(row.briefing_type_id),
    title: String(row.title ?? ''),
    description: (row.description ?? null) as string | null,
  }))

  return { data: mapped, error: null }
}

/**
 * RPC: Create custom briefing type
 */
export async function createCustomBriefing(
  projectId: number,
  title: string,
  description?: string | null
): Promise<{ data: ProjectBriefingType | null; error: any }> {
  const supabase = createClientComponentClient()

  const { data: briefingTypeId, error } = await supabase.rpc('pbt_create_custom', {
    p_project_id: projectId,
    p_title: title,
    p_description: description ?? null,
  })

  if (error) return { data: null, error }

  // Fetch the created briefing type
  const { data: briefing, error: fetchError } = await supabase
    .from('v_project_briefing_types')
    .select('*')
    .eq('project_id', projectId)
    .eq('briefing_type_id', briefingTypeId)
    .single()

  return { data: briefing, error: fetchError }
}

/**
 * RPC: Add briefing type to project
 */
export async function addProjectBriefingType(
  projectId: number,
  briefingTypeId: number,
  isDefault?: boolean,
  position?: number | null
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbt_add', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_is_default: isDefault ?? false,
  })

  return { data, error }
}

/**
 * RPC: Remove briefing type from project
 */
export async function removeProjectBriefingType(
  projectId: number,
  briefingTypeId: number
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbt_remove', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
  })

  return { data, error }
}

/**
 * RPC: Reorder briefing types
 */
export async function reorderProjectBriefingTypes(
  projectId: number,
  order: Array<{ briefing_type_id: number; position: number }>
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbt_reorder', {
    p_project_id: projectId,
    p_order: order,
  })

  return { data, error }
}

/**
 * RPC: Update briefing type metadata (custom title/description)
 */
export async function updateProjectBriefingMeta(
  projectId: number,
  briefingTypeId: number,
  customTitle: string | null,
  customDescription: string | null
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbt_update_meta', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_custom_title: customTitle,
    p_custom_description: customDescription,
  })

  return { data, error }
}

/**
 * RPC: Set default briefing type
 */
export async function setDefaultBriefingType(
  projectId: number,
  briefingTypeId: number | null
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbt_set_default', {
    // Match PostgREST RPC arg names: public.pbt_set_default(p_briefing_type_id, p_project_id)
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
  })

  return { data, error }
}

/**
 * RPC: Use global template for project briefing
 */
export async function useGlobalTemplateForProjectBriefing(
  projectId: number,
  briefingTypeId: number
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('use_global_template_for_project_briefing', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
  })

  return { data, error }
}

/**
 * RPC: Add global component to project briefing template
 */
export async function addGlobalComponentToBriefing(
  projectId: number,
  briefingTypeId: number,
  briefingComponentId: number,
  position?: number | null,
  customTitle?: string | null,
  customDescription?: string | null
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbtc_add_global', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_briefing_component_id: briefingComponentId,
    p_position: position ?? null,
    p_custom_title: customTitle ?? null,
    p_custom_description: customDescription ?? null,
  })

  return { data, error }
}

/**
 * RPC: Add project component to briefing template
 */
export async function addProjectComponentToBriefing(
  projectId: number,
  briefingTypeId: number,
  projectComponentId: number,
  position?: number | null,
  customTitle?: string | null,
  customDescription?: string | null
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  // Apply project component across ALL CT×Channel combos that use this briefing type
  // (see project_ct_channel_briefings). Backend handles upserting PBTC and
  // project_ct_channel_briefing_components.
  const { data, error } = await supabase.rpc('pbtc_add_project_all_channels', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_project_component_id: projectComponentId,
    p_position: position ?? null,
    p_custom_title: customTitle ?? null,
    p_custom_description: customDescription ?? null,
  })

  return { data, error }
}

/**
 * RPC: Update briefing component
 */
export async function updateBriefingComponent(
  projectId: number,
  briefingTypeId: number,
  componentId: number,
  isProjectComponent: boolean,
  updates: {
    position?: number | null
    custom_title?: string | null
    custom_description?: string | null
  }
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbtc_update', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_component_id: componentId,
    p_is_project_component: isProjectComponent,
    p_position: updates.position ?? undefined,
    p_custom_title: updates.custom_title ?? undefined,
    p_custom_description: updates.custom_description ?? undefined,
  })

  return { data, error }
}

/**
 * RPC: Remove component from briefing template
 */
export async function removeBriefingComponent(
  projectId: number,
  briefingTypeId: number,
  componentId: number,
  isProjectComponent: boolean = false
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbtc_remove', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_component_id: componentId,
    p_is_project_component: isProjectComponent,
  })

  return { data, error }
}

/**
 * RPC: Reorder briefing components
 */
export async function reorderBriefingComponents(
  projectId: number,
  briefingTypeId: number,
  order: Array<{ component_id: number; is_project_component: boolean; position: number }>
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbtc_reorder', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_order: order,
  })

  return { data, error }
}

export type SystemBriefingComponent = {
  id: number
  title: string
  description: string | null
}

/**
 * Fetch all system (global) briefing components for project-library assignment pickers.
 */
export async function fetchSystemBriefingComponents(): Promise<{
  data: SystemBriefingComponent[] | null
  error: any
}> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from('briefing_components')
    .select('id, title, description')
    .order('title', { ascending: true })

  if (error) return { data: null, error }
  return {
    data: ((data || []) as any[]).map((row) => ({
      id: row.id as number,
      title: String(row.title ?? ''),
      description: row.description ?? null,
    })),
    error: null,
  }
}

/**
 * RPC: Assign a system component to the project library.
 */
export async function addGlobalComponentToProject(
  projectId: number,
  briefingComponentId: number
): Promise<{ error: any }> {
  const supabase = createClientComponentClient()
  const { error } = await supabase.rpc('pbc_add_global_component_to_project', {
    p_project_id: projectId,
    p_briefing_component_id: briefingComponentId,
  })
  return { error }
}

/**
 * RPC: Create project component
 */
export async function createProjectComponent(
  projectId: number,
  title: string,
  description?: string | null,
  rules?: string | null
): Promise<{ data: ProjectComponent | null; error: any }> {
  const supabase = createClientComponentClient()

  // Convert rules string to JSONB if provided
  let rulesJsonb = null
  if (rules && rules.trim()) {
    try {
      rulesJsonb = JSON.parse(rules)
    } catch {
      // If not valid JSON, treat as plain text and wrap in an object
      rulesJsonb = { text: rules }
    }
  }

  const { data, error } = await supabase.rpc('create_project_component', {
    p_project_id: projectId,
    p_title: title,
    p_description: description ?? null,
    p_rules: rulesJsonb,
  })

  if (error) return { data: null, error }

  // Fetch the created component
  const { data: component, error: fetchError } = await supabase
    .from('project_briefing_components')
    .select('*')
    .eq('id', data)
    .single()

  return { data: component, error: fetchError }
}

/**
 * RPC: Update project component
 */
export async function updateProjectComponent(
  id: number,
  updates: {
    title?: string
    description?: string | null
    rules?: string | null
  }
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('update_project_component', {
    id,
    title: updates.title,
    description: updates.description ?? undefined,
    rules: updates.rules ?? undefined,
  })

  return { data, error }
}

/**
 * RPC: Delete project component
 */
export async function deleteProjectComponent(
  id: number
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('delete_project_component', {
    id,
  })

  return { data, error }
}

/**
 * RPC: Fetch variants for project (repurposed from project_ct_variants_seo)
 * Note: This will need to be adapted based on the actual RPC signature
 */
export async function fetchProjectVariants(
  projectId: number,
  briefingTypeId?: number | null,
  channelId?: number | null,
  page: number = 1,
  pageSize: number = 25
): Promise<{ data: Variant[] | null; error: any }> {
  const supabase = createClientComponentClient()

  // This will need to be adapted to the actual RPC function
  // For now, using a placeholder structure
  const { data, error } = await supabase.rpc('project_ct_variants_seo', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId ?? null,
    p_channel_id: channelId ?? null,
    p_page: page,
    p_page_size: pageSize,
  })

  return { data, error }
}

/**
 * RPC: Set briefing on variant
 */
export async function setVariantBriefing(
  variantId: string,
  briefingTypeId: number | null
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('variant_set_briefing', {
    variant_id: variantId,
    briefing_type_id: briefingTypeId,
  })

  return { data, error }
}

/**
 * RPC: Set briefing constraints
 */
export async function setBriefingConstraints(
  projectId: number,
  briefingTypeId: number,
  briefing: {
    name: string
    description: string
  },
  constraints: {
    tone?: string | null
    audience?: string | null
    length?: string | null
    cta?: string | null
    seo?: {
      meta_title_pattern?: string | null
      meta_description_pattern?: string | null
    } | null
    assets?: {
      required?: string[] | null
      optional?: string[] | null
    } | null
  }
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbt_set_constraints', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_custom_title: briefing.name,
    p_custom_description: briefing.description,
    p_tone: constraints.tone ?? null,
    p_audience: constraints.audience ?? null,
    p_length_spec: constraints.length ?? null,
    p_cta: constraints.cta ?? null,
    p_seo_meta_title_pattern: constraints.seo?.meta_title_pattern ?? null,
    p_seo_meta_description_pattern: constraints.seo?.meta_description_pattern ?? null,
    p_assets_required: constraints.assets?.required ?? null,
    p_assets_optional: constraints.assets?.optional ?? null,
    p_constraints_json: constraints ?? null,
  })

  return { data, error }
}

/**
 * RPC: Bulk add project components from outline
 */
export async function bulkAddProjectComponentsFromOutline(
  projectId: number,
  briefingTypeId: number,
  items: Array<{
    label: string
    purpose: string
    guidance: string
    suggested_word_count: number | null
    subheads: Array<{ label: string; guidance: string }>
  }>
): Promise<{ data: any; error: any }> {
  const supabase = createClientComponentClient()

  const { data, error } = await supabase.rpc('pbtc_bulk_add_project_from_outline', {
    p_project_id: projectId,
    p_briefing_type_id: briefingTypeId,
    p_items: items,
  })

  return { data, error }
}

