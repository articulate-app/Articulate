import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  exchangeGoogleAuthorizationCode,
  fetchGoogleAccountEmail,
  getGoogleOAuthRedirectUri,
  resolveAppOrigin,
  verifyGoogleOAuthState,
} from "@/lib/google-oauth"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

export const dynamic = "force-dynamic"

function redirectWithError(returnTo: string, error: string) {
  const url = new URL(returnTo)
  url.searchParams.set("google_connect", "error")
  url.searchParams.set("google_connect_error", error.slice(0, 200))
  return NextResponse.redirect(url.toString())
}

export async function GET(req: Request) {
  const origin = resolveAppOrigin(req)
  const reqUrl = new URL(req.url)
  const code = reqUrl.searchParams.get("code")
  const state = reqUrl.searchParams.get("state")
  const oauthError = reqUrl.searchParams.get("error")

  let returnTo = `${origin}/tasks`

  try {
    if (oauthError) {
      return redirectWithError(returnTo, oauthError)
    }
    if (!code || !state) {
      return redirectWithError(returnTo, "missing_code_or_state")
    }

    const payload = verifyGoogleOAuthState(state)
    returnTo = payload.returnTo || returnTo

    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id || session.user.id !== payload.authUserId) {
      return redirectWithError(returnTo, "session_mismatch")
    }

    const { data: canEdit } = await supabase.rpc("fn_can_edit_project_check", {
      p_project_id: payload.projectId,
    })
    if (!canEdit) {
      return redirectWithError(returnTo, "forbidden")
    }

    const tokens = await exchangeGoogleAuthorizationCode({
      code,
      redirectUri: getGoogleOAuthRedirectUri(req),
    })
    if (!tokens.refresh_token) {
      return redirectWithError(
        returnTo,
        "no_refresh_token_reconsent_required",
      )
    }

    const account = await fetchGoogleAccountEmail(tokens.access_token)
    const scopes =
      typeof tokens.scope === "string"
        ? tokens.scope.split(/\s+/).filter(Boolean)
        : []

    const service = createServiceRoleClient()
    const expiresAt =
      typeof tokens.expires_in === "number"
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null

    const { error: upsertError } = await service
      .from("project_google_oauth_connections")
      .upsert(
        {
          project_id: payload.projectId,
          google_account_email: account.email,
          google_account_sub: account.sub,
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          access_token_expires_at: expiresAt,
          scopes,
          status: "active",
          connected_by_auth_user_id: session.user.id,
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      )

    if (upsertError) {
      return redirectWithError(returnTo, upsertError.message)
    }

    const successUrl = new URL(returnTo)
    successUrl.searchParams.set("google_connect", "1")
    successUrl.searchParams.set("project_id", String(payload.projectId))
    return NextResponse.redirect(successUrl.toString())
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth_failed"
    return redirectWithError(returnTo, message)
  }
}
