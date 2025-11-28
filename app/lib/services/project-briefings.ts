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
 * Fetch available briefing types (not yet added to project)
 */
export async function fetchAvailableBriefingTypes(
  projectId: number
): Promise<{ data: Array<{ id: number; title: string; description: string | null }> | null; error: any }> {
  const supabase = createClientComponentClient()

  // Get all briefing types
  const { data: allTypes, error: allError } = await supabase
    .from('briefing_types')
    .select('id, title, description')
    .order('title')

  if (allError) return { data: null, error: allError }

  // Get already added types
  const { data: addedTypes, error: addedError } = await supabase
    .from('project_briefing_types')
    .select('briefing_type_id')
    .eq('project_id', projectId)

  if (addedError) return { data: null, error: addedError }

  const addedIds = new Set((addedTypes || []).map(t => t.briefing_type_id))

  // Filter out already added
  const available = (allTypes || []).filter(t => !addedIds.has(t.id))

  return { data: available, error: null }
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
    project_id: projectId,
    briefing_type_id: briefingTypeId,
    is_default: isDefault ?? false,
    position: position ?? null,
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
    project_id: projectId,
    briefing_type_id: briefingTypeId,
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

  const { data, error } = await supabase.rpc('pbtc_add_project', {
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

