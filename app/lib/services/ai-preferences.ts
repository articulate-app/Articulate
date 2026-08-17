import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export type AiPreferenceStatus = "candidate" | "active" | "rejected" | "superseded"
export type AiPreferenceScope = "user" | "user_project" | "project"
export type AiPreferenceCategory = "tone" | "terminology" | "structure" | "formatting" | "other"

export type AiPreference = {
  id: string
  scope: AiPreferenceScope
  user_id: number | null
  project_id: number | null
  category: AiPreferenceCategory
  rule: string
  confidence: number
  evidence_count: number
  status: AiPreferenceStatus
  applies_to?: Record<string, unknown> | null
  first_observed_at?: string | null
  last_observed_at?: string | null
  editable: boolean
}

export async function listAiPreferences(projectId?: number | null, includeCandidates = true) {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("ai_list_preferences_v1", {
    p_project_id: projectId ?? null,
    p_include_candidates: includeCandidates,
  })
  if (error) throw error
  return (data?.preferences ?? []) as AiPreference[]
}

export async function updateAiPreference(args: {
  id: string
  rule?: string
  action?: "update" | "forget" | "activate"
}) {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("ai_update_preference_v1", {
    p_preference_id: args.id,
    p_rule: args.rule ?? null,
    p_action: args.action ?? "update",
  })
  if (error) throw error
  return data
}

export async function createAiPreference(args: {
  rule: string
  category: AiPreferenceCategory
  scope: AiPreferenceScope
  projectId?: number | null
}) {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("ai_create_preference_v1", {
    p_rule: args.rule.trim(),
    p_category: args.category,
    p_scope: args.scope,
    p_project_id: args.projectId ?? null,
  })
  if (error) throw error
  return data
}

export async function changeAiPreferenceScope(args: {
  id: string
  scope: AiPreferenceScope
  projectId?: number | null
}) {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("ai_change_preference_scope_v1", {
    p_preference_id: args.id,
    p_scope: args.scope,
    p_project_id: args.projectId ?? null,
  })
  if (error) throw error
  return data
}
