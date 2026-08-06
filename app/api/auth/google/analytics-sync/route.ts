import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  fetchGoogleAnalyticsDailyReport,
  normalizeGaPropertyId,
  summarizeGoogleAnalyticsRows,
} from "@/lib/google-analytics-data"
import { refreshGoogleAccessToken } from "@/lib/google-oauth"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

export const dynamic = "force-dynamic"

type SyncBody = {
  projectId?: number
  gaPropertyId?: string | null
}

/**
 * Reads GA4 report data for a single project using the Google account the user
 * connected for that project (analytics.readonly), then persists it so the
 * Analytics tab renders data sourced from the user's own token.
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
    if (!session?.user?.id) {
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
      .select("id, refresh_token, google_account_email, scopes, status")
      .eq("project_id", projectId)
      .eq("status", "active")
      .maybeSingle()

    if (connectionError) {
      return NextResponse.json({ error: connectionError.message }, { status: 500 })
    }
    if (!connection?.refresh_token) {
      return NextResponse.json(
        { error: "Google account not connected for this project" },
        { status: 404 },
      )
    }

    const scopes = Array.isArray(connection.scopes) ? connection.scopes : []
    if (
      scopes.length > 0 &&
      !scopes.includes("https://www.googleapis.com/auth/analytics.readonly")
    ) {
      return NextResponse.json(
        {
          error:
            "The connected Google account did not grant analytics.readonly. Reconnect Google and accept the Analytics permission.",
        },
        { status: 403 },
      )
    }

    let gaPropertyId =
      typeof body.gaPropertyId === "string" && body.gaPropertyId.trim()
        ? normalizeGaPropertyId(body.gaPropertyId)
        : null

    if (!gaPropertyId) {
      const { data: mapping } = await service
        .from("project_analytics_properties")
        .select("ga_property_id, updated_at")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      gaPropertyId = mapping?.ga_property_id
        ? normalizeGaPropertyId(mapping.ga_property_id)
        : null
    }

    if (!gaPropertyId) {
      return NextResponse.json(
        { error: "No Google Analytics property selected for this project" },
        { status: 400 },
      )
    }

    const tokens = await refreshGoogleAccessToken(connection.refresh_token)
    const rows = await fetchGoogleAnalyticsDailyReport({
      accessToken: tokens.access_token,
      gaPropertyId,
    })

    if (rows.length > 0) {
      const payload = rows.map((row) => ({
        project_id: projectId,
        ga_property_id: gaPropertyId,
        date: row.date,
        channel_group: row.channelGroup,
        active_users: row.activeUsers,
        sessions: row.sessions,
        avg_session_duration: row.avgSessionDuration,
      }))

      for (let index = 0; index < payload.length; index += 500) {
        const { error: upsertError } = await service
          .from("project_analytics_daily")
          .upsert(payload.slice(index, index + 500), {
            onConflict: "project_id,ga_property_id,date,channel_group",
          })
        if (upsertError) {
          return NextResponse.json({ error: upsertError.message }, { status: 500 })
        }
      }
    }

    const summary = summarizeGoogleAnalyticsRows(rows)
    return NextResponse.json({
      ok: true,
      source: "oauth_user_token",
      googleAccountEmail: connection.google_account_email,
      gaPropertyId,
      rowCount: rows.length,
      ...summary,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analytics sync failed"
    const isPermission = /permission|403|insufficient/i.test(message)
    return NextResponse.json({ error: message }, { status: isPermission ? 403 : 500 })
  }
}
