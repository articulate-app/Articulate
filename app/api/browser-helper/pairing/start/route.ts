import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { jsonError, requireAppUser } from "@/lib/browser-helper-api-auth"

export const dynamic = "force-dynamic"

const CHALLENGE_TTL_MS = 5 * 60 * 1000

/** Start one-time pairing challenge for the authenticated user. */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireAppUser()
    const body = (await req.json().catch(() => ({}))) as {
      deviceId?: string
      deviceName?: string
    }
    const challenge = randomBytes(32).toString("base64url")
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()

    const { data, error } = await supabase
      .from("browser_helper_pairing_challenges")
      .insert({
        user_id: userId,
        device_id: typeof body.deviceId === "string" ? body.deviceId : null,
        challenge,
        expires_at: expiresAt,
      })
      .select("id, challenge, expires_at")
      .single()

    if (error || !data) {
      throw new Error(error?.message || "Could not create pairing challenge")
    }

    return NextResponse.json({
      challengeId: data.id,
      challenge: data.challenge,
      expiresAt: data.expires_at,
      deviceNameHint: body.deviceName ?? null,
    })
  } catch (error) {
    return jsonError(error)
  }
}
