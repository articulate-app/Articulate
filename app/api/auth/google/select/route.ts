import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/service-role"

export const dynamic = "force-dynamic"

type SelectBody = {
  projectId?: number
  gscPropertyUrl?: string | null
  gaPropertyId?: string | null
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SelectBody
    const projectId = Number(body.projectId)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 })
    }

    const gscPropertyUrl =
      typeof body.gscPropertyUrl === "string" && body.gscPropertyUrl.trim()
        ? body.gscPropertyUrl.trim()
        : null
    const gaPropertyId =
      typeof body.gaPropertyId === "string" && body.gaPropertyId.trim()
        ? body.gaPropertyId.trim().replace(/^properties\//, "")
        : null

    if (!gscPropertyUrl && !gaPropertyId) {
      return NextResponse.json(
        { error: "Select at least one Search Console or Analytics property" },
        { status: 400 },
      )
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
    const { data: connection } = await service
      .from("project_google_oauth_connections")
      .select("id, status")
      .eq("project_id", projectId)
      .eq("status", "active")
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: "Google account not connected" }, { status: 404 })
    }

    let gsc: unknown = null
    let ga: unknown = null

    if (gscPropertyUrl) {
      const deactivate = await service
        .from("project_search_console_properties")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("project_id", projectId)
        .eq("is_active", true)

      if (deactivate.error?.message?.includes("does not exist")) {
        return NextResponse.json(
          {
            error:
              "Search Console tables are not migrated yet. Deploy competitive content migrations, or select Analytics only for now.",
          },
          { status: 503 },
        )
      }

      const siteType = gscPropertyUrl.startsWith("sc-domain:")
        ? "domain"
        : "url_prefix"

      const { data, error } = await service
        .from("project_search_console_properties")
        .upsert(
          {
            project_id: projectId,
            property_url: gscPropertyUrl,
            site_type: siteType,
            is_active: true,
            google_connection_id: connection.id,
            granted_scopes: [
              "https://www.googleapis.com/auth/webmasters.readonly",
            ],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,property_url" },
        )
        .select("*")
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      gsc = data
    }

    if (gaPropertyId) {
      const { data, error } = await supabase.rpc("fn_set_project_ga_property", {
        p_project_id: projectId,
        p_ga_property_id: gaPropertyId,
        p_default_uri: null,
      })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      ga = data
    }

    return NextResponse.json({ ok: true, gsc, ga })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Select failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
