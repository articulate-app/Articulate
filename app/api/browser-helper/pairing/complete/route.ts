import { NextResponse } from "next/server"
import { createPublicKey, verify } from "node:crypto"
import { jsonError, requireAppUser } from "@/lib/browser-helper-api-auth"
import { getLocalBrowserPublicKeyPem } from "@/lib/browser-helper-auth"

export const dynamic = "force-dynamic"

function verifyDeviceAttestation(input: {
  publicKeyPem: string
  challenge: string
  signatureBase64: string
}): boolean {
  try {
    const key = createPublicKey(input.publicKeyPem)
    const sig = Buffer.from(input.signatureBase64, "base64")
    return verify(null, Buffer.from(input.challenge, "utf8"), key, sig)
  } catch {
    return false
  }
}

/** Complete pairing after helper signs the challenge with its device key. */
export async function POST(req: Request) {
  try {
    const { supabase, userId } = await requireAppUser()
    const body = (await req.json().catch(() => ({}))) as {
      challengeId?: string
      deviceId?: string
      devicePublicKey?: string
      signature?: string
      deviceName?: string
      platform?: string
      helperVersion?: string
    }

    const challengeId = typeof body.challengeId === "string" ? body.challengeId : ""
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : ""
    const devicePublicKey =
      typeof body.devicePublicKey === "string" ? body.devicePublicKey.trim() : ""
    const signature = typeof body.signature === "string" ? body.signature.trim() : ""

    if (!challengeId || !deviceId || !devicePublicKey || !signature) {
      return NextResponse.json(
        { error: "challengeId, deviceId, devicePublicKey, and signature are required" },
        { status: 400 },
      )
    }

    const { data: challengeRow, error: challengeError } = await supabase
      .from("browser_helper_pairing_challenges")
      .select("id, user_id, challenge, expires_at, consumed_at")
      .eq("id", challengeId)
      .maybeSingle()

    if (challengeError || !challengeRow) {
      return NextResponse.json({ error: "Pairing challenge not found" }, { status: 404 })
    }
    if (Number(challengeRow.user_id) !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (challengeRow.consumed_at) {
      return NextResponse.json({ error: "Pairing challenge already used" }, { status: 409 })
    }
    if (new Date(challengeRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Pairing challenge expired" }, { status: 410 })
    }

    const ok = verifyDeviceAttestation({
      publicKeyPem: devicePublicKey,
      challenge: String(challengeRow.challenge),
      signatureBase64: signature,
    })
    if (!ok) {
      return NextResponse.json({ error: "Invalid device attestation" }, { status: 401 })
    }

    await supabase
      .from("browser_helper_pairing_challenges")
      .update({ consumed_at: new Date().toISOString(), device_id: deviceId })
      .eq("id", challengeId)

    // If this device was previously paired to another user, reject (device_id unique).
    const { data: existing } = await supabase
      .from("browser_helper_devices")
      .select("id, user_id, revoked_at")
      .eq("device_id", deviceId)
      .maybeSingle()

    if (existing && Number(existing.user_id) !== userId && !existing.revoked_at) {
      return NextResponse.json(
        { error: "This Browser Helper is paired to another Articulate account." },
        { status: 409 },
      )
    }

    const row = {
      user_id: userId,
      device_id: deviceId,
      device_public_key: devicePublicKey,
      device_name:
        typeof body.deviceName === "string" && body.deviceName.trim()
          ? body.deviceName.trim()
          : "Articulate Browser Helper",
      platform: typeof body.platform === "string" ? body.platform : null,
      helper_version: typeof body.helperVersion === "string" ? body.helperVersion : null,
      paired_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
      metadata: {},
      updated_at: new Date().toISOString(),
    }

    let device
    if (existing && Number(existing.user_id) === userId) {
      const { data, error } = await supabase
        .from("browser_helper_devices")
        .update(row)
        .eq("id", existing.id)
        .select("id, device_id, device_name, paired_at, last_seen_at")
        .single()
      if (error) throw new Error(error.message)
      device = data
    } else {
      const { data, error } = await supabase
        .from("browser_helper_devices")
        .insert(row)
        .select("id, device_id, device_name, paired_at, last_seen_at")
        .single()
      if (error) throw new Error(error.message)
      device = data
    }

    const verificationPublicKeyPem = await getLocalBrowserPublicKeyPem()

    return NextResponse.json({
      ok: true,
      paired: true,
      device,
      /** Helper may cache this PEM to verify short-lived control tokens offline. */
      verificationPublicKeyPem,
    })
  } catch (error) {
    return jsonError(error)
  }
}
