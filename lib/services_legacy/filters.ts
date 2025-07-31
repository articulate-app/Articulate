import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { supabase } from '../supabase'
import { FilterOption } from '../types/filters'

export async function getFilterOptions(): Promise<Record<string, FilterOption[]>> {
  const supabase = createClientComponentClient()
  
  const [
    { data: users },
    { data: statuses },
    { data: projects },
    { data: contentTypes },
    { data: productionTypes },
    { data: languages }
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, full_name')
      .order('full_name', { ascending: true }),
    supabase
      .from('project_statuses')
      .select('id, name, color')
      .order('name', { ascending: true }),
    supabase
      .from('projects')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('content_types')
      .select('id, title')
      .order('title', { ascending: true }),
    supabase
      .from('production_types')
      .select('id, title')
      .order('title', { ascending: true }),
    supabase
      .from('languages')
      .select('id, code')
      .order('code', { ascending: true })
  ])

  return {
    assignedTo: users?.map(user => ({
      id: user.id,
      label: user.full_name
    })) || [],
    status: statuses?.map(status => ({
      id: status.id,
      label: status.name,
      color: status.color
    })) || [],
    project: projects?.map(project => ({
      id: project.id,
      label: project.name
    })) || [],
    contentType: contentTypes?.map(type => ({
      id: type.id,
      label: type.title
    })) || [],
    productionType: productionTypes?.map(type => ({
      id: type.id,
      label: type.title
    })) || [],
    language: languages?.map(lang => ({
      id: lang.id,
      label: lang.code
    })) || [],
    channels: [
      { id: 'facebook', label: 'Facebook' },
      { id: 'youtube', label: 'YouTube' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'twitter', label: 'Twitter' },
      { id: 'linkedin', label: 'LinkedIn' }
    ]
  }
} 