import { NextResponse } from "next/server"
import { jsonError, requireAppUser } from "@/lib/browser-helper-api-auth"

export const dynamic = "force-dynamic"

/**
 * Check whether a discovered helper device_id is paired for the current user.
 * Discovery itself is unauthenticated; this endpoint requires Articulate login.
 */
export async function GET(req: Request) {
  try {
    const { supabase, userId } = await requireAppUser()
    const deviceId = new URL(req.url).searchParams.get("deviceId")?.trim() || ""
    if (!deviceId) {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 })
    }

    const { data } = await supabase
      .from("browser_helper_devices")
      .select("id, device_id, device_name, revoked_at, last_seen_at, paired_at")
      .eq("device_id", deviceId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!data) {
      return NextResponse.json({
        paired: false,
        revoked: false,
        needsConnect: true,
        deviceId,
      })
    }

    const revoked = Boolean(data.revoked_at)
    return NextResponse.json({
      paired: !revoked,
      revoked,
      needsConnect: revoked,
      deviceId: data.device_id,
      deviceName: data.device_name,
      lastSeenAt: data.last_seen_at,
      pairedAt: data.paired_at,
    })
  } catch (error) {
    return jsonError(error)
  }
}
