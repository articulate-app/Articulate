import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export type ProjectComponentChannelPolicy = "optional" | "required" | "excluded"

export type ProjectComponentChannelPolicyRow = {
  channel_id: number
  channel_name: string
  policy: ProjectComponentChannelPolicy
  required: boolean
  position: number | null
}

export type ProjectComponentChannelPoliciesResponse = {
  ok: true
  project_id: number
  project_component_id: number | null
  briefing_component_id: number | null
  channels: ProjectComponentChannelPolicyRow[]
}

export type ProjectChannelComponentRef =
  | { kind: "project"; projectComponentId: number }
  | { kind: "global"; briefingComponentId: number }

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function normalizePolicy(value: unknown): ProjectComponentChannelPolicy {
  if (value === "required" || value === "excluded" || value === "optional") return value
  return "optional"
}

function normalizeChannelRow(row: unknown): ProjectComponentChannelPolicyRow | null {
  if (!row || typeof row !== "object") return null
  const record = row as Record<string, unknown>
  const channelId = toFiniteNumber(record.channel_id)
  if (channelId == null) return null
  const policy = normalizePolicy(record.policy)
  const required =
    record.required === true || policy === "required"
  const position = toFiniteNumber(record.position)
  return {
    channel_id: channelId,
    channel_name: toTrimmedString(record.channel_name) ?? `Channel ${channelId}`,
    policy,
    required,
    position,
  }
}

export function parseProjectComponentChannelPoliciesResponse(
  raw: unknown,
): ProjectComponentChannelPoliciesResponse | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (record.ok !== true) return null
  const projectId = toFiniteNumber(record.project_id)
  if (projectId == null) return null
  const projectComponentId = toFiniteNumber(record.project_component_id)
  const briefingComponentId = toFiniteNumber(record.briefing_component_id)
  if ((projectComponentId == null) === (briefingComponentId == null)) return null
  const channels = Array.isArray(record.channels)
    ? record.channels
        .map((row) => normalizeChannelRow(row))
        .filter((row): row is ProjectComponentChannelPolicyRow => row != null)
    : []
  return {
    ok: true,
    project_id: projectId,
    project_component_id: projectComponentId,
    briefing_component_id: briefingComponentId,
    channels,
  }
}

export async function fetchProjectComponentChannelPolicies(args: {
  projectId: number
  component: ProjectChannelComponentRef
}): Promise<{ data: ProjectComponentChannelPoliciesResponse | null; error: Error | null }> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("ai_get_project_component_channel_policies_v1", {
    p_project_id: args.projectId,
    p_project_component_id: args.component.kind === "project" ? args.component.projectComponentId : null,
    p_briefing_component_id: args.component.kind === "global" ? args.component.briefingComponentId : null,
  })
  if (error) return { data: null, error: new Error(error.message) }
  const parsed = parseProjectComponentChannelPoliciesResponse(data)
  if (!parsed) {
    return { data: null, error: new Error("Invalid channel policies response") }
  }
  return { data: parsed, error: null }
}

export async function setProjectChannelComponentPolicy(args: {
  projectId: number
  channelId: number
  component: ProjectChannelComponentRef
  required: boolean
  position: number | null
}): Promise<{ error: Error | null }> {
  const supabase = createClientComponentClient()
  const { error } = await supabase.rpc("ai_set_project_channel_component_policy_v1", {
    p_project_id: args.projectId,
    p_channel_id: args.channelId,
    p_policy: args.required ? "required" : "optional",
    p_position: args.required ? args.position : null,
    p_briefing_component_id: args.component.kind === "global" ? args.component.briefingComponentId : null,
    p_project_component_id: args.component.kind === "project" ? args.component.projectComponentId : null,
    p_guidance: null,
    p_rules: null,
  })
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export function projectComponentChannelPoliciesQueryKey(
  projectId: number,
  component: ProjectChannelComponentRef,
) {
  return [
    "projBriefings:library:channelPolicies",
    projectId,
    component.kind,
    component.kind === "project" ? component.projectComponentId : component.briefingComponentId,
  ] as const
}
