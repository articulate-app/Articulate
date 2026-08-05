import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

export type ProjectGoogleOAuthStatus = {
  connected: boolean
  id?: number
  project_id?: number
  google_account_email?: string | null
  scopes?: string[]
  status?: string
  has_refresh_token?: boolean
  last_error?: string | null
  created_at?: string
  updated_at?: string
}

export type GoogleConnectedPropertiesResponse = {
  connectionId: number
  googleAccountEmail: string | null
  searchConsoleSites: Array<{ siteUrl: string; permissionLevel?: string }>
  analyticsProperties: Array<{
    propertyId: string
    displayName: string
    accountName?: string
  }>
}

export async function getProjectGoogleOAuthStatus(
  projectId: number,
): Promise<ProjectGoogleOAuthStatus> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.rpc("fn_get_project_google_oauth_status", {
    p_project_id: projectId,
  })
  if (error) throw error
  return (data ?? { connected: false }) as ProjectGoogleOAuthStatus
}

export async function listGoogleConnectedProperties(
  projectId: number,
): Promise<GoogleConnectedPropertiesResponse> {
  const response = await fetch(
    `/api/auth/google/properties?project_id=${encodeURIComponent(String(projectId))}`,
    { method: "GET", credentials: "same-origin" },
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Failed to list Google properties",
    )
  }
  return payload as GoogleConnectedPropertiesResponse
}

export async function selectGoogleConnectedProperties(args: {
  projectId: number
  gscPropertyUrl?: string | null
  gaPropertyId?: string | null
}): Promise<void> {
  const response = await fetch("/api/auth/google/select", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: args.projectId,
      gscPropertyUrl: args.gscPropertyUrl ?? null,
      gaPropertyId: args.gaPropertyId ?? null,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Failed to save properties",
    )
  }
}

export async function disconnectProjectGoogleOAuth(projectId: number): Promise<void> {
  const response = await fetch("/api/auth/google/disconnect", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Failed to disconnect Google",
    )
  }
}
