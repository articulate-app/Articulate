import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { FetchOrClaimYdocResult } from "../../../app/lib/collaboration/seed-policy"

export function createServiceSupabase(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function createUserSupabase(url: string, anonKey: string, accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type CollabAuthorizeResult = {
  ok: boolean
  code?: string
  artifact_id?: string
  can_read?: boolean
  can_write?: boolean
  collab_enabled?: boolean
  room?: string
  user_id?: number
  full_name?: string | null
  photo?: string | null
  artifact_type?: string
  project_id?: number | null
  task_id?: number | null
  current_version?: number
}

export async function authorizeArtifactForToken(
  supabase: SupabaseClient,
  artifactId: string,
): Promise<CollabAuthorizeResult> {
  const { data, error } = await supabase.rpc("artifact_collab_authorize_v1", {
    p_artifact_id: artifactId,
  })
  if (error) {
    return { ok: false, code: error.message, artifact_id: artifactId }
  }
  const row = (data ?? {}) as CollabAuthorizeResult
  return row
}

export async function fetchOrClaimYdoc(
  service: SupabaseClient,
  artifactId: string,
): Promise<FetchOrClaimYdocResult> {
  const { data, error } = await service.rpc("collab_fetch_or_claim_ydoc_v1", {
    p_artifact_id: artifactId,
  })
  if (error) throw new Error(error.message)
  return (data ?? {}) as FetchOrClaimYdocResult
}

export async function completeYdocSeed(args: {
  service: SupabaseClient
  artifactId: string
  claimToken: string
  snapshotBase64: string
  stateVectorBase64: string
  seededFrom: string
}): Promise<{ ok: boolean; code?: string }> {
  const { data, error } = await args.service.rpc("collab_complete_ydoc_seed_v1", {
    p_artifact_id: args.artifactId,
    p_claim_token: args.claimToken,
    p_snapshot_base64: args.snapshotBase64,
    p_state_vector_base64: args.stateVectorBase64,
    p_seeded_from: args.seededFrom,
    p_schema_version: 1,
  })
  if (error) throw new Error(error.message)
  return (data ?? {}) as { ok: boolean; code?: string }
}

export async function failYdocSeed(args: {
  service: SupabaseClient
  artifactId: string
  claimToken: string
  error: string
}): Promise<void> {
  const { error } = await args.service.rpc("collab_fail_ydoc_seed_v1", {
    p_artifact_id: args.artifactId,
    p_claim_token: args.claimToken,
    p_error: args.error,
  })
  if (error) throw new Error(error.message)
}

export async function storeYdocSnapshot(args: {
  service: SupabaseClient
  artifactId: string
  snapshotBase64: string
  stateVectorBase64: string
}): Promise<{ ok: boolean; code?: string; byte_size?: number }> {
  const { data, error } = await args.service.rpc("collab_store_ydoc_snapshot_v1", {
    p_artifact_id: args.artifactId,
    p_snapshot_base64: args.snapshotBase64,
    p_state_vector_base64: args.stateVectorBase64,
  })
  if (error) throw new Error(error.message)
  return (data ?? {}) as { ok: boolean; code?: string; byte_size?: number }
}

export async function loadArtifactContent(
  service: SupabaseClient,
  artifactId: string,
): Promise<{ content_json: unknown; content_text: string | null; metadata: Record<string, unknown> | null }> {
  const { data, error } = await service
    .from("artifacts")
    .select("content_json, content_text, metadata")
    .eq("id", artifactId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error("artifact_not_found")
  return {
    content_json: data.content_json,
    content_text: typeof data.content_text === "string" ? data.content_text : null,
    metadata: data.metadata && typeof data.metadata === "object" ? data.metadata as Record<string, unknown> : null,
  }
}
