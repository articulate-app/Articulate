import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { refreshGoogleAccessToken } from "@/lib/google-oauth"
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

      await service
        .from("project_search_console_properties")
        .update({
          backfill_status: "queued",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)

      // Fire-and-forget historical sync with a freshly refreshed Google token.
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (supabaseUrl && anonKey && session.access_token) {
        void (async () => {
          try {
            const { data: oauth } = await service
              .from("project_google_oauth_connections")
              .select("refresh_token")
              .eq("id", connection.id)
              .maybeSingle()
            const refreshToken =
              typeof oauth?.refresh_token === "string" ? oauth.refresh_token : ""
            const googleAccess = refreshToken
              ? (await refreshGoogleAccessToken(refreshToken)).access_token
              : null
            await fetch(`${supabaseUrl}/functions/v1/sync-search-console`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: anonKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                project_id: projectId,
                job_type: "backfill",
                trigger: "oauth_connect",
                search_type: "web",
                ...(googleAccess ? { access_token: googleAccess } : {}),
              }),
            })
          } catch (syncError) {
            console.warn("search console backfill trigger failed", syncError)
          }
        })()
      }

      gsc = data
    }

    // Prefer an explicit GA selection. If the user only picks Search Console
    // after a prior disconnect, restore the most recently used GA property so
    // Analytics does not stay "Not connected" by accident.
    let resolvedGaPropertyId = gaPropertyId
    if (!resolvedGaPropertyId) {
      const { data: previousGa } = await service
        .from("project_analytics_properties")
        .select("ga_property_id")
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (previousGa?.ga_property_id) {
        resolvedGaPropertyId = String(previousGa.ga_property_id)
          .trim()
          .replace(/^properties\//, "")
      }
    }

    if (resolvedGaPropertyId) {
      const { data, error } = await supabase.rpc("fn_set_project_ga_property", {
        p_project_id: projectId,
        p_ga_property_id: resolvedGaPropertyId,
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
