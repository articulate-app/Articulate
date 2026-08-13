import { NextResponse } from "next/server"
import { jsonError, requireAppUser } from "@/lib/browser-helper-api-auth"

export const dynamic = "force-dynamic"

/** List paired Browser Helper devices for the current user. */
export async function GET() {
  try {
    const { supabase, userId } = await requireAppUser()
    const { data, error } = await supabase
      .from("browser_helper_devices")
      .select(
        "id, device_id, device_name, platform, helper_version, paired_at, last_seen_at, revoked_at",
      )
      .eq("user_id", userId)
      .order("paired_at", { ascending: false })

    if (error) throw new Error(error.message)
    return NextResponse.json({
      devices: (data ?? []).map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        deviceName: row.device_name,
        platform: row.platform,
        helperVersion: row.helper_version,
        pairedAt: row.paired_at,
        lastSeenAt: row.last_seen_at,
        revoked: Boolean(row.revoked_at),
        revokedAt: row.revoked_at,
      })),
    })
  } catch (error) {
    return jsonError(error)
  }
}

/** Revoke (disconnect) a paired device. */
export async function DELETE(req: Request) {
  try {
    const { supabase, userId } = await requireAppUser()
    const url = new URL(req.url)
    const deviceId =
      url.searchParams.get("deviceId") ||
      ((await req.json().catch(() => ({}))) as { deviceId?: string }).deviceId ||
      ""
    if (!deviceId) {
      return NextResponse.json({ error: "deviceId is required" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("browser_helper_devices")
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .is("revoked_at", null)
      .select("id, device_id")
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, revoked: true, deviceId: data.device_id })
  } catch (error) {
    return jsonError(error)
  }
}
