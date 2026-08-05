import { createHmac, timingSafeEqual } from "crypto"

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const

export type GoogleOAuthStatePayload = {
  projectId: number
  authUserId: string
  returnTo: string
  nonce: string
  exp: number
}

export function getGoogleOAuthClientCredentials(): {
  clientId: string
  clientSecret: string
} {
  const clientId =
    process.env.GA_CLIENT_ID?.trim() ||
    process.env.GSC_CLIENT_ID?.trim() ||
    process.env.GOOGLE_ADS_CLIENT_ID?.trim() ||
    process.env.GOOGLE_ADS_OAUTH_CLIENT_ID?.trim() ||
    ""
  const clientSecret =
    process.env.GA_CLIENT_SECRET?.trim() ||
    process.env.GSC_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_ADS_CLIENT_SECRET?.trim() ||
    ""
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GA_CLIENT_ID/GA_CLIENT_SECRET (or GSC_* / GOOGLE_ADS_*) for Google OAuth",
    )
  }
  return { clientId, clientSecret }
}

function getStateSecret(): string {
  const explicit = process.env.GOOGLE_OAUTH_STATE_SECRET?.trim()
  if (explicit) return explicit
  const { clientSecret } = getGoogleOAuthClientCredentials()
  return clientSecret
}

export function signGoogleOAuthState(payload: GoogleOAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const sig = createHmac("sha256", getStateSecret()).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifyGoogleOAuthState(state: string): GoogleOAuthStatePayload {
  const [body, sig] = state.split(".")
  if (!body || !sig) throw new Error("Invalid OAuth state")
  const expected = createHmac("sha256", getStateSecret()).update(body).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state signature")
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleOAuthStatePayload
  if (!payload?.projectId || !payload?.authUserId || !payload?.exp) {
    throw new Error("Invalid OAuth state payload")
  }
  if (Date.now() > payload.exp) {
    throw new Error("OAuth state expired")
  }
  return payload
}

export function buildGoogleOAuthAuthorizeUrl(args: {
  redirectUri: string
  state: string
}): string {
  const { clientId } = getGoogleOAuthClientCredentials()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: args.state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export function resolveAppOrigin(req: Request): string {
  const url = new URL(req.url)
  const forwardedHost = req.headers.get("x-forwarded-host")
  const forwardedProto = req.headers.get("x-forwarded-proto")
  if (forwardedHost) {
    const proto = forwardedProto?.split(",")[0]?.trim() || "https"
    return `${proto}://${forwardedHost.split(",")[0]?.trim()}`
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")
  if (site) return site
  return url.origin
}

export function getGoogleOAuthRedirectUri(req: Request): string {
  return `${resolveAppOrigin(req)}/api/auth/google/callback`
}

export async function exchangeGoogleAuthorizationCode(args: {
  code: string
  redirectUri: string
}): Promise<{
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  id_token?: string
}> {
  const { clientId, clientSecret } = getGoogleOAuthClientCredentials()
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: args.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: args.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload?.error_description === "string"
        ? payload.error_description
        : `Google token exchange failed (${response.status})`,
    )
  }
  return payload
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in?: number
  scope?: string
}> {
  const { clientId, clientSecret } = getGoogleOAuthClientCredentials()
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload?.error_description === "string"
        ? payload.error_description
        : `Google token refresh failed (${response.status})`,
    )
  }
  return payload
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<{
  email: string | null
  sub: string | null
}> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return { email: null, sub: null }
  const data = await response.json().catch(() => ({}))
  return {
    email: typeof data.email === "string" ? data.email : null,
    sub: typeof data.id === "string" ? data.id : null,
  }
}

export type GoogleSearchConsoleSite = {
  siteUrl: string
  permissionLevel?: string
}

export type GoogleAnalyticsPropertyOption = {
  propertyId: string
  displayName: string
  accountName?: string
}

export async function listGoogleSearchConsoleSites(
  accessToken: string,
): Promise<GoogleSearchConsoleSite[]> {
  const response = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Search Console sites.list failed: ${text.slice(0, 300)}`)
  }
  const data = await response.json()
  const entries = Array.isArray(data.siteEntry) ? data.siteEntry : []
  return entries
    .map((entry: { siteUrl?: string; permissionLevel?: string }) => ({
      siteUrl: String(entry.siteUrl ?? ""),
      permissionLevel: entry.permissionLevel,
    }))
    .filter((entry: GoogleSearchConsoleSite) => Boolean(entry.siteUrl))
}

export async function listGoogleAnalyticsProperties(
  accessToken: string,
): Promise<GoogleAnalyticsPropertyOption[]> {
  const response = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    },
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Analytics accountSummaries failed: ${text.slice(0, 300)}`)
  }
  const data = await response.json()
  const accounts = Array.isArray(data.accountSummaries) ? data.accountSummaries : []
  const options: GoogleAnalyticsPropertyOption[] = []
  for (const account of accounts) {
    const accountName =
      typeof account.displayName === "string" ? account.displayName : undefined
    const props = Array.isArray(account.propertySummaries)
      ? account.propertySummaries
      : []
    for (const prop of props) {
      const property = typeof prop.property === "string" ? prop.property : ""
      if (!property) continue
      options.push({
        propertyId: property.replace(/^properties\//, ""),
        displayName:
          typeof prop.displayName === "string" && prop.displayName
            ? prop.displayName
            : property,
        accountName,
      })
    }
  }
  return options
}

export function sanitizeReturnTo(returnTo: string | null | undefined, origin: string): string {
  if (!returnTo) return `${origin}/tasks`
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return `${origin}${returnTo}`
  }
  try {
    const url = new URL(returnTo)
    if (url.origin === origin) return url.toString()
  } catch {
    // ignore
  }
  return `${origin}/tasks`
}
