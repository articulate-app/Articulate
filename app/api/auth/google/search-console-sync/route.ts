import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { refreshGoogleAccessToken } from "@/lib/google-oauth"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

export const dynamic = "force-dynamic"
export const maxDuration = 300

type SyncBody = {
  projectId?: number
  jobType?: "performance" | "backfill" | "sitemaps" | "url_inspection" | "all"
  trigger?: "manual" | "automatic" | "oauth_connect"
  searchType?: string
}

/**
 * Refreshes the project's Google OAuth token with the Next.js app credentials
 * (which are known-good), then invokes the Search Console edge sync with that
 * access token so edge secrets cannot block the connect flow.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SyncBody
    const projectId = Number(body.projectId)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id || !session.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: canEdit } = await supabase.rpc("fn_can_edit_project_check", {
      p_project_id: projectId,
    })
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const service = createServiceRoleClient()
    const { data: connection, error: connectionError } = await service
      .from("project_google_oauth_connections")
      .select("id, refresh_token, status")
      .eq("project_id", projectId)
      .eq("status", "active")
      .maybeSingle()

    if (connectionError) {
      return NextResponse.json({ error: connectionError.message }, { status: 500 })
    }
    if (!connection?.refresh_token) {
      return NextResponse.json(
        { ok: false, error: "Google account not connected" },
        { status: 404 },
      )
    }

    let accessToken: string
    try {
      const tokens = await refreshGoogleAccessToken(connection.refresh_token)
      accessToken = tokens.access_token
      const expiresAt =
        typeof tokens.expires_in === "number"
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null
      await service
        .from("project_google_oauth_connections")
        .update({
          access_token: accessToken,
          access_token_expires_at: expiresAt,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to refresh Google token"
      await service
        .from("project_google_oauth_connections")
        .update({
          last_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id)
      return NextResponse.json({ ok: false, error: message }, { status: 502 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase URL/anon key not configured" },
        { status: 500 },
      )
    }

    const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/sync-search-console`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project_id: projectId,
        job_type: body.jobType ?? "all",
        trigger: body.trigger ?? "manual",
        search_type: body.searchType ?? "web",
        access_token: accessToken,
      }),
    })

    const payload = await edgeResponse.json().catch(() => ({}))
    if (!edgeResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            (typeof payload?.error === "string" && payload.error)
            || (typeof payload?.reason === "string" && payload.reason)
            || `Search Console sync failed (${edgeResponse.status})`,
          ...payload,
        },
        { status: edgeResponse.status },
      )
    }

    return NextResponse.json({
      ok: payload?.ok !== false,
      error:
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.reason === "string"
            ? payload.reason
            : undefined,
      ...payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
