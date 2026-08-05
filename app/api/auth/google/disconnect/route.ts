import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { projectId?: number }
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

    const { error } = await supabase.rpc("fn_disconnect_project_google_oauth", {
      p_project_id: projectId,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Disconnect failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
