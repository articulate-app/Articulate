import { NextResponse } from "next/server"
import { jsonError, requireAppUser } from "@/lib/browser-helper-api-auth"
import {
  ALL_LOCAL_BROWSER_SCOPES,
  mintLocalBrowserAccessToken,
  type LocalBrowserScope,
} from "@/lib/browser-helper-auth"

export const dynamic = "force-dynamic"

/** Issue a short-lived local browser control token for a paired device. */
export async function POST(req: Request) {
  try {
    const { supabase, userId, authUserId } = await requireAppUser()
    const body = (await req.json().catch(() => ({}))) as {
      deviceId?: string
      scopes?: string[]
    }
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : ""
    if (!deviceId) {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 })
    }

    const { data: device, error } = await supabase
      .from("browser_helper_devices")
      .select("id, device_id, user_id, revoked_at, device_name")
      .eq("device_id", deviceId)
      .maybeSingle()

    if (error || !device) {
      return NextResponse.json(
        { error: "Device not paired", code: "not_paired" },
        { status: 404 },
      )
    }
    if (Number(device.user_id) !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (device.revoked_at) {
      return NextResponse.json(
        { error: "Browser Helper needs to be connected again.", code: "revoked" },
        { status: 403 },
      )
    }

    const requested = Array.isArray(body.scopes)
      ? body.scopes.filter((s): s is LocalBrowserScope =>
          ALL_LOCAL_BROWSER_SCOPES.includes(s as LocalBrowserScope),
        )
      : ALL_LOCAL_BROWSER_SCOPES
    const scopes = requested.length > 0 ? requested : ALL_LOCAL_BROWSER_SCOPES

    const minted = await mintLocalBrowserAccessToken({
      sub: authUserId,
      user_id: userId,
      device_id: deviceId,
      scope: scopes,
    })

    await supabase
      .from("browser_helper_devices")
      .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", device.id)

    return NextResponse.json({
      accessToken: minted.token,
      expiresAt: minted.expiresAt,
      expiresIn: minted.expiresIn,
      tokenType: "Bearer",
      deviceId,
      scopes,
    })
  } catch (error) {
    return jsonError(error)
  }
}
