"use client"

import { useQueries, useQuery } from "@tanstack/react-query"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { getProjectStatuses } from "../lib/services/projectStatuses"

const FIVE_MINUTES = 5 * 60 * 1000
const THIRTY_MINUTES = 30 * 60 * 1000

export const projectSharedQueryKeys = {
  projectStatuses: (projectId: number) => ["project-shared", "project-statuses", projectId] as const,
  projectChannelsResolved: (projectId: number) => ["project-shared", "project-channels-resolved", projectId] as const,
  projectLanguages: (projectId: number) => ["project-shared", "project-languages", projectId] as const,
  projectBriefingTypes: (projectId: number) => ["project-shared", "project-briefing-types", projectId] as const,
  projectContentTypeSettings: (projectId: number) =>
    ["project-shared", "project-content-type-settings", projectId] as const,
  globalContentTypes: () => ["global-ref", "content-types"] as const,
  globalLanguages: () => ["global-ref", "languages"] as const,
  globalFilterOptions: () => ["filterOptions"] as const,
}

const PROJECT_SHARED_QUERY_DEFAULTS = {
  staleTime: FIVE_MINUTES,
  gcTime: THIRTY_MINUTES,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
}

export function useProjectStatusesQuery(projectId?: number | null) {
  return useQuery({
    queryKey: projectId ? projectSharedQueryKeys.projectStatuses(projectId) : ["project-shared", "project-statuses", "none"],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return []
      const { data } = await getProjectStatuses(projectId)
      return data ?? []
    },
    ...PROJECT_SHARED_QUERY_DEFAULTS,
  })
}

export function useProjectChannelsResolvedQuery(projectId?: number | null) {
  const supabase = createClientComponentClient()
  return useQuery({
    queryKey: projectId
      ? projectSharedQueryKeys.projectChannelsResolved(projectId)
      : ["project-shared", "project-channels-resolved", "none"],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return []
      const { data, error } = await supabase
        .from("v_project_channels_resolved")
        .select("channel_id, name, is_enabled, is_default, position")
        .eq("project_id", projectId)
        .order("position", { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
    ...PROJECT_SHARED_QUERY_DEFAULTS,
  })
}

export function useProjectContentTypeSettingsQuery(projectId?: number | null) {
  const supabase = createClientComponentClient()
  return useQuery({
    queryKey: projectId
      ? projectSharedQueryKeys.projectContentTypeSettings(projectId)
      : ["project-shared", "project-content-type-settings", "none"],
    enabled: !!projectId,
    queryFn: async () => {
      if (!projectId) return []
      const { data, error } = await supabase
        .from("project_content_type_settings")
        .select("content_type_id")
        .eq("project_id", projectId)
      if (error) throw error
      return data ?? []
    },
    ...PROJECT_SHARED_QUERY_DEFAULTS,
  })
}

export function useGlobalContentTypesQuery() {
  const supabase = createClientComponentClient()
  return useQuery({
    queryKey: projectSharedQueryKeys.globalContentTypes(),
    queryFn: async () => {
      const { data, error } = await supabase.from("content_types").select("id,title").order("title", { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: THIRTY_MINUTES,
    gcTime: THIRTY_MINUTES,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Warm shared project/global caches in the page shell.
 * This runs in background and does not block tab navigation.
 */
export function usePrefetchProjectSharedQueries(projectId?: number | null) {
  const supabase = createClientComponentClient()
  const isEnabled = !!projectId

  useQueries({
    queries: [
      {
        queryKey: projectId ? projectSharedQueryKeys.projectStatuses(projectId) : ["project-shared", "project-statuses", "none"],
        enabled: isEnabled,
        queryFn: async () => {
          if (!projectId) return []
          const { data } = await getProjectStatuses(projectId)
          return data ?? []
        },
        ...PROJECT_SHARED_QUERY_DEFAULTS,
      },
      {
        queryKey: projectId
          ? projectSharedQueryKeys.projectChannelsResolved(projectId)
          : ["project-shared", "project-channels-resolved", "none"],
        enabled: isEnabled,
        queryFn: async () => {
          if (!projectId) return []
          const { data, error } = await supabase
            .from("v_project_channels_resolved")
            .select("channel_id,name,is_enabled,is_default,position")
            .eq("project_id", projectId)
            .order("position", { ascending: true, nullsFirst: false })
          if (error) throw error
          return data ?? []
        },
        ...PROJECT_SHARED_QUERY_DEFAULTS,
      },
      {
        queryKey: projectId ? projectSharedQueryKeys.projectLanguages(projectId) : ["project-shared", "project-languages", "none"],
        enabled: isEnabled,
        queryFn: async () => {
          if (!projectId) return []
          const { data, error } = await supabase
            .from("project_languages")
            .select("language_id,is_primary,languages!inner(id,code,long_name)")
            .eq("project_id", projectId)
            .eq("is_deleted", false)
          if (error) throw error
          return data ?? []
        },
        ...PROJECT_SHARED_QUERY_DEFAULTS,
      },
      {
        queryKey: projectId
          ? projectSharedQueryKeys.projectBriefingTypes(projectId)
          : ["project-shared", "project-briefing-types", "none"],
        enabled: isEnabled,
        queryFn: async () => {
          if (!projectId) return []
          const { data, error } = await supabase
            .from("project_briefing_types")
            .select("briefing_type_id,briefing_types!inner(id,title,description)")
            .eq("project_id", projectId)
            .order("position", { ascending: true })
          if (error) throw error
          return data ?? []
        },
        ...PROJECT_SHARED_QUERY_DEFAULTS,
      },
      {
        queryKey: projectId
          ? projectSharedQueryKeys.projectContentTypeSettings(projectId)
          : ["project-shared", "project-content-type-settings", "none"],
        enabled: isEnabled,
        queryFn: async () => {
          if (!projectId) return []
          const { data, error } = await supabase
            .from("project_content_type_settings")
            .select("content_type_id")
            .eq("project_id", projectId)
          if (error) throw error
          return data ?? []
        },
        ...PROJECT_SHARED_QUERY_DEFAULTS,
      },
      {
        queryKey: projectSharedQueryKeys.globalContentTypes(),
        queryFn: async () => {
          const { data, error } = await supabase.from("content_types").select("id,title").order("title", { ascending: true })
          if (error) throw error
          return data ?? []
        },
        staleTime: THIRTY_MINUTES,
        gcTime: THIRTY_MINUTES,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      {
        queryKey: projectSharedQueryKeys.globalLanguages(),
        queryFn: async () => {
          const { data, error } = await supabase.from("languages").select("id,code,long_name").order("long_name", { ascending: true })
          if (error) throw error
          return data ?? []
        },
        staleTime: THIRTY_MINUTES,
        gcTime: THIRTY_MINUTES,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ],
  })
}
