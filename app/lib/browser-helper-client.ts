/**
 * Client pairing + short-lived authorization for the local Browser Helper.
 * Never stores or requires NEXT_PUBLIC_ARTICULATE_BRIDGE_TOKEN.
 */

"use client"

import {
  getBridgeBaseUrl,
  probeLocalBridge,
  isLocalBridgeReady,
  type BridgeHealth,
} from "./local-browser-bridge"

export type HelperDiscovery =
  | { state: "missing"; health: BridgeHealth }
  | { state: "unpaired"; health: BridgeHealth; deviceId: string }
  | { state: "revoked"; health: BridgeHealth; deviceId: string }
  | { state: "paired"; health: BridgeHealth; deviceId: string; deviceName?: string | null }
  | { state: "unauthorized"; health: BridgeHealth; deviceId?: string }

type CachedAuth = {
  deviceId: string
  accessToken: string
  expiresAtMs: number
}

let authCache: CachedAuth | null = null
let pendingAuth: Promise<string> | null = null

function deviceIdFromHealth(health: BridgeHealth): string | null {
  const id =
    (health as { deviceId?: string; device_id?: string }).deviceId ||
    (health as { device_id?: string }).device_id
  return typeof id === "string" && id.trim() ? id.trim() : null
}

export async function discoverBrowserHelper(): Promise<HelperDiscovery> {
  const health = await probeLocalBridge()
  if (!isLocalBridgeReady(health)) {
    return { state: "missing", health }
  }
  const deviceId = deviceIdFromHealth(health)
  if (!deviceId) {
    return { state: "missing", health: { ...health, error: "Helper missing device identity" } }
  }

  try {
    const res = await fetch(
      `/api/browser-helper/status?deviceId=${encodeURIComponent(deviceId)}`,
      { cache: "no-store" },
    )
    if (res.status === 401) {
      return { state: "unauthorized", health, deviceId }
    }
    const data = (await res.json().catch(() => ({}))) as {
      paired?: boolean
      revoked?: boolean
      needsConnect?: boolean
      deviceName?: string | null
    }
    if (data.revoked || data.needsConnect) {
      return { state: "revoked", health, deviceId }
    }
    if (data.paired) {
      return {
        state: "paired",
        health,
        deviceId,
        deviceName: data.deviceName ?? null,
      }
    }
    return { state: "unpaired", health, deviceId }
  } catch {
    return { state: "unpaired", health, deviceId }
  }
}

export async function pairBrowserHelper(options?: {
  deviceName?: string
}): Promise<{ deviceId: string; deviceName: string | null }> {
  const health = await probeLocalBridge()
  if (!isLocalBridgeReady(health)) {
    throw new Error("Articulate Browser Helper is not installed or running.")
  }
  const deviceId = deviceIdFromHealth(health)
  if (!deviceId) throw new Error("Helper did not report a device id")

  const startRes = await fetch("/api/browser-helper/pairing/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      deviceName: options?.deviceName || guessDeviceName(),
    }),
  })
  const start = (await startRes.json().catch(() => ({}))) as {
    challengeId?: string
    challenge?: string
    error?: string
  }
  if (!startRes.ok || !start.challengeId || !start.challenge) {
    throw new Error(start.error || "Could not start pairing")
  }

  // Fetch JWKS PEM so helper can verify future tokens offline.
  let verificationPublicKeyPem: string | null = null
  try {
    const jwks = await fetch("/api/browser-helper/jwks", { cache: "no-store" })
    const body = (await jwks.json()) as { publicKeyPem?: string }
    if (typeof body.publicKeyPem === "string") verificationPublicKeyPem = body.publicKeyPem
  } catch {
    // optional at pair time; authorize path can refresh
  }

  const base = getBridgeBaseUrl()
  const attestRes = await fetch(`${base}/v1/pairing/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: start.challengeId,
      challenge: start.challenge,
      verificationPublicKeyPem,
    }),
    cache: "no-store",
  })
  const attest = (await attestRes.json().catch(() => ({}))) as {
    deviceId?: string
    devicePublicKey?: string
    signature?: string
    platform?: string
    helperVersion?: string
    error?: string
  }
  if (!attestRes.ok || !attest.devicePublicKey || !attest.signature || !attest.deviceId) {
    throw new Error(attest.error || "Helper could not attest pairing challenge")
  }

  const completeRes = await fetch("/api/browser-helper/pairing/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: start.challengeId,
      deviceId: attest.deviceId,
      devicePublicKey: attest.devicePublicKey,
      signature: attest.signature,
      deviceName: options?.deviceName || guessDeviceName(),
      platform: attest.platform,
      helperVersion: attest.helperVersion,
    }),
  })
  const complete = (await completeRes.json().catch(() => ({}))) as {
    ok?: boolean
    device?: { device_name?: string | null }
    verificationPublicKeyPem?: string
    error?: string
  }
  if (!completeRes.ok || !complete.ok) {
    throw new Error(complete.error || "Pairing failed")
  }

  if (typeof complete.verificationPublicKeyPem === "string") {
    try {
      await fetch(`${base}/v1/pairing/verification-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKeyPem: complete.verificationPublicKeyPem }),
      })
    } catch {
      // ignore
    }
  }

  authCache = null
  return {
    deviceId: attest.deviceId,
    deviceName: complete.device?.device_name ?? null,
  }
}

function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "Articulate Browser Helper"
  const ua = navigator.userAgent || ""
  if (/Mac/i.test(ua)) return "Mac Browser Helper"
  if (/Windows/i.test(ua)) return "Windows Browser Helper"
  if (/Linux/i.test(ua)) return "Linux Browser Helper"
  return "Articulate Browser Helper"
}

/**
 * Return a valid short-lived access token for the local helper.
 * Transparently refreshes ~60s before expiry.
 */
export async function getLocalBrowserAccessToken(options?: {
  deviceId?: string
  forceRefresh?: boolean
}): Promise<string> {
  const health = await probeLocalBridge()
  const deviceId = options?.deviceId || deviceIdFromHealth(health)
  if (!deviceId) {
    throw new Error("Articulate Browser Helper is not installed or running.")
  }

  const now = Date.now()
  if (
    !options?.forceRefresh &&
    authCache &&
    authCache.deviceId === deviceId &&
    authCache.expiresAtMs - now > 60_000
  ) {
    return authCache.accessToken
  }

  if (pendingAuth) return pendingAuth

  pendingAuth = (async () => {
    const res = await fetch("/api/browser-helper/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      accessToken?: string
      expiresAt?: string
      error?: string
      code?: string
    }
    if (!res.ok || !data.accessToken) {
      const code = data.code || ""
      if (code === "not_paired" || code === "revoked" || res.status === 404 || res.status === 403) {
        throw new Error(
          data.error || "Browser Helper needs to be connected again.",
        )
      }
      throw new Error(data.error || "Could not authorize local browser")
    }
    authCache = {
      deviceId,
      accessToken: data.accessToken,
      expiresAtMs: data.expiresAt ? Date.parse(data.expiresAt) : now + 4 * 60_000,
    }
    return data.accessToken
  })()

  try {
    return await pendingAuth
  } finally {
    pendingAuth = null
  }
}

export function clearLocalBrowserAuthCache() {
  authCache = null
}

export async function listBrowserHelperDevices() {
  const res = await fetch("/api/browser-helper/devices", { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Could not list devices")
  return data.devices as Array<{
    id: string
    deviceId: string
    deviceName: string | null
    platform: string | null
    helperVersion: string | null
    pairedAt: string
    lastSeenAt: string
    revoked: boolean
    revokedAt: string | null
  }>
}

export async function revokeBrowserHelperDevice(deviceId: string) {
  const res = await fetch(
    `/api/browser-helper/devices?deviceId=${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Could not disconnect device")
  clearLocalBrowserAuthCache()
  return data
}
