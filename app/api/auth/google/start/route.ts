import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import {
  buildGoogleOAuthAuthorizeUrl,
  getGoogleOAuthRedirectUri,
  resolveAppOrigin,
  sanitizeReturnTo,
  signGoogleOAuthState,
} from "@/lib/google-oauth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = Number(url.searchParams.get("project_id"))
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: canEdit, error: accessError } = await supabase.rpc(
      "fn_can_edit_project_check",
      { p_project_id: projectId },
    )
    if (accessError) {
      return NextResponse.json({ error: accessError.message }, { status: 500 })
    }
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const origin = resolveAppOrigin(req)
    const returnTo = sanitizeReturnTo(url.searchParams.get("return_to"), origin)
    const state = signGoogleOAuthState({
      projectId,
      authUserId: session.user.id,
      returnTo,
      nonce: randomBytes(16).toString("hex"),
      exp: Date.now() + 15 * 60 * 1000,
    })

    const authorizeUrl = buildGoogleOAuthAuthorizeUrl({
      redirectUri: getGoogleOAuthRedirectUri(req),
      state,
    })

    return NextResponse.redirect(authorizeUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth start failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
