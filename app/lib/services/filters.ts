import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export interface FilterOptions {
  users: { value: string; label: string }[]
  statuses: { value: string; label: string; color: string; order_priority?: number; project_id?: string | number }[]
  projects: { value: string; label: string }[]
  contentTypes: { value: string; label: string }[]
  productionTypes: { value: string; label: string }[]
  languages: { value: string; label: string }[]
  channels: { value: string; label: string }[]
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const supabase = createClientComponentClient()
  
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name')
      .order('full_name')
    if (usersError) throw usersError
    const mappedUsers = (users || [])
      .filter(user => user.id && user.full_name)
      .map(user => ({ value: user.id, label: user.full_name }))

    const { data: statuses, error: statusesError } = await supabase
      .from('project_statuses')
      .select('id, name, color, order_priority, project_id')
      .order('name')
    if (statusesError) throw statusesError
    
    // More robust deduplication by name only
    const statusMap = new Map<string, any>()
    
    ;(statuses || []).forEach(status => {
      if (!status.name || typeof status.name !== 'string') return
      
      // Use the first occurrence of each status name, or the one with the lowest ID
      if (!statusMap.has(status.name) || (statusMap.get(status.name).id > status.id)) {
        statusMap.set(status.name, status)
      }
    })
    
    const dedupedStatuses = Array.from(statusMap.values())
    
    const mappedStatuses = dedupedStatuses.map(status => ({ 
      value: status.name, // Use name as value for Typesense filtering
      label: status.name, 
      color: status.color, 
      order_priority: status.order_priority, 
      project_id: status.project_id 
    }))

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, active')
      .order('name')
    if (projectsError) throw projectsError
    const mappedProjects = (projects || [])
      .filter(project => project.id && project.name)
      .map(project => ({ value: project.id, label: project.name, active: project.active }))

    const { data: contentTypes, error: contentTypesError } = await supabase
      .from('content_types')
      .select('id, title')
      .order('title')
    if (contentTypesError) throw contentTypesError
    const mappedContentTypes = (contentTypes || [])
      .filter(type => type.id && type.title)
      .map(type => ({ value: type.id, label: type.title }))

    const { data: productionTypes, error: productionTypesError } = await supabase
      .from('production_types')
      .select('id, title')
      .order('title')
    if (productionTypesError) throw productionTypesError
    const mappedProductionTypes = (productionTypes || [])
      .filter(type => type.id && type.title)
      .map(type => ({ value: type.id, label: type.title }))

    const { data: languages, error: languagesError } = await supabase
      .from('languages')
      .select('id, code, long_name')
      .order('long_name')
    if (languagesError) {
      throw languagesError
    }
    const languageOptions = (languages || [])
      .filter(lang => lang.id && lang.code && lang.long_name)
      .map(lang => ({ value: lang.id, label: `${lang.long_name} (${lang.code})` }))

    // Fetch channels
    const { data: channels, error: channelsError } = await supabase
      .from('channels')
      .select('id, name')
      .order('name')
    if (channelsError) throw channelsError
    const mappedChannels = (channels || []).map(channel => ({ value: String(channel.id), label: channel.name }))

    return {
      users: mappedUsers,
      statuses: mappedStatuses,
      projects: mappedProjects,
      contentTypes: mappedContentTypes,
      productionTypes: mappedProductionTypes,
      languages: languageOptions,
      channels: mappedChannels,
    }
  } catch (error) {
    throw error
  }
} 