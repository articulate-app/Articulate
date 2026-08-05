import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  listGoogleAnalyticsProperties,
  listGoogleSearchConsoleSites,
  refreshGoogleAccessToken,
} from "@/lib/google-oauth"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

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

    const { data: canEdit } = await supabase.rpc("fn_can_edit_project_check", {
      p_project_id: projectId,
    })
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const service = createServiceRoleClient()
    const { data: connection, error } = await service
      .from("project_google_oauth_connections")
      .select("id, refresh_token, google_account_email, status")
      .eq("project_id", projectId)
      .eq("status", "active")
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!connection?.refresh_token) {
      return NextResponse.json({ error: "Google account not connected" }, { status: 404 })
    }

    const tokens = await refreshGoogleAccessToken(connection.refresh_token)
    const [searchConsoleSites, analyticsProperties] = await Promise.all([
      listGoogleSearchConsoleSites(tokens.access_token).catch((err) => {
        console.error("GSC sites list failed", err)
        return [] as Awaited<ReturnType<typeof listGoogleSearchConsoleSites>>
      }),
      listGoogleAnalyticsProperties(tokens.access_token).catch((err) => {
        console.error("GA properties list failed", err)
        return [] as Awaited<ReturnType<typeof listGoogleAnalyticsProperties>>
      }),
    ])

    return NextResponse.json({
      connectionId: connection.id,
      googleAccountEmail: connection.google_account_email,
      searchConsoleSites,
      analyticsProperties,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list properties"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
