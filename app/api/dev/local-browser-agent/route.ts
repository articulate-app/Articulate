import { NextRequest, NextResponse } from "next/server"

/**
 * Dev-only proxy: frontend ↔ Supabase edge `local-browser-agent`.
 * LLM credentials stay on the edge; this route never receives CDP URLs.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: { message: "local-browser-agent is disabled in production builds" } },
      { status: 404 },
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: { message: "Supabase is not configured" } },
      { status: 500 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: { message: "JSON body required" } }, { status: 400 })
  }

  const authHeader = req.headers.get("authorization")
  const started = Date.now()
  const response = await fetch(`${supabaseUrl}/functions/v1/local-browser-agent`, {
    method: "POST",
    headers: {
      Authorization: authHeader?.startsWith("Bearer ")
        ? authHeader
        : `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    return NextResponse.json(
      {
        error: {
          message:
            payload?.error?.message ||
            `local-browser-agent failed (${response.status})`,
        },
      },
      { status: response.status },
    )
  }

  return NextResponse.json({
    ...payload,
    diagnostics: {
      ...(payload?.diagnostics && typeof payload.diagnostics === "object"
        ? payload.diagnostics
        : {}),
      proxyMs: Date.now() - started,
    },
  })
}
