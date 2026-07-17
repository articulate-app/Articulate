"use client"

type EdgeFunctionSupabaseAuthClient = {
  auth: {
    getSession: () => Promise<{ data: { session: { access_token?: string } | null } }>
    refreshSession: () => Promise<{
      data: { session: { access_token?: string } | null }
      error: { message?: string } | null
    }>
  }
}

type InvokeEdgeFunctionFetchOptions = {
  supabase: EdgeFunctionSupabaseAuthClient
  url: string
  init?: Omit<RequestInit, "headers">
  headers?: HeadersInit
  debugLabel?: string
}

function logEdgeDebug(message: string, extra?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return
  if (extra) {
    console.debug(`[edge] ${message}`, extra)
    return
  }
  console.debug(`[edge] ${message}`)
}

function toHeadersMap(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return { ...headers }
}

async function isInvalidJwtResponse(response: Response): Promise<boolean> {
  if (response.status === 401) return true
  if (response.ok) return false
  const text = await response
    .clone()
    .text()
    .catch(() => "")
  return /Invalid JWT|UNAUTHORIZED_LEGACY_JWT/i.test(text)
}

async function runFetchWithToken(
  url: string,
  token: string,
  init?: Omit<RequestInit, "headers">,
  headers?: HeadersInit,
): Promise<Response> {
  const mergedHeaders = toHeadersMap(headers)
  mergedHeaders.Authorization = `Bearer ${token}`
  return fetch(url, {
    ...init,
    headers: mergedHeaders,
  })
}

export async function invokeEdgeFunctionFetch({
  supabase,
  url,
  init,
  headers,
  debugLabel,
}: InvokeEdgeFunctionFetchOptions): Promise<Response> {
  const label = debugLabel ?? url
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const accessToken = session?.access_token

  if (!accessToken) {
    logEdgeDebug("session missing before edge function call", { label })
    throw new Error("No active session")
  }

  const firstResponse = await runFetchWithToken(url, accessToken, init, headers)
  const shouldRetry = await isInvalidJwtResponse(firstResponse)
  if (!shouldRetry) return firstResponse

  logEdgeDebug("refreshSession attempted before retry", {
    label,
    status: firstResponse.status,
  })
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    logEdgeDebug("refreshSession failed", { label, message: refreshError.message })
    throw new Error(refreshError.message || "Failed to refresh session")
  }
  const retryToken = refreshData.session?.access_token
  if (!retryToken) {
    logEdgeDebug("refreshSession succeeded without access token", { label })
    throw new Error("No active session after refresh")
  }

  const retryResponse = await runFetchWithToken(url, retryToken, init, headers)
  if (retryResponse.ok) {
    logEdgeDebug("edge function retry succeeded", { label })
  } else {
    const retryInvalidJwt = await isInvalidJwtResponse(retryResponse)
    logEdgeDebug("edge function retry failed", {
      label,
      status: retryResponse.status,
      invalidJwt: retryInvalidJwt,
    })
  }
  return retryResponse
}
