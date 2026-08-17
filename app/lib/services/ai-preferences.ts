import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export type AiPreferenceStatus = "candidate" | "active" | "rejected" | "superseded"
export type AiPreferenceScope = "user" | "user_project" | "project"

export type AiPreference = {
  id: string
  scope: AiPreferenceScope
  user_id: number | null
  project_id: number | null
  category: "tone" | "terminology" | "structure" | "formatting" | "other"
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
