/**
 * Verify short-lived Articulate local-browser JWTs (EdDSA).
 * Uses public verification key only — never the server signing secret.
 */

import { createPublicKey } from "node:crypto"
import { importSPKI, jwtVerify } from "jose"
import {
  loadVerificationPublicKey,
  saveVerificationPublicKey,
} from "./device-identity.js"

const ISSUER = "articulate-local-browser"
const AUDIENCE = "articulate-browser-helper"

export type VerifiedBrowserAuth = {
  sub: string
  userId: number
  deviceId: string
  scopes: string[]
  exp: number
}

let cachedKeyPem: string | null = null
let jwksFetchedAt = 0

async function resolvePublicKeyPem(jwksUrl?: string | null): Promise<string> {
  if (cachedKeyPem) return cachedKeyPem
  const local = loadVerificationPublicKey()
  if (local) {
    cachedKeyPem = local
    return local
  }
  if (jwksUrl && Date.now() - jwksFetchedAt > 60_000) {
    try {
      const res = await fetch(jwksUrl, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const body = (await res.json()) as { publicKeyPem?: string }
        if (typeof body.publicKeyPem === "string" && body.publicKeyPem.includes("PUBLIC KEY")) {
          saveVerificationPublicKey(body.publicKeyPem)
          cachedKeyPem = body.publicKeyPem
          jwksFetchedAt = Date.now()
          return cachedKeyPem
        }
      }
    } catch {
      // ignore
    }
    jwksFetchedAt = Date.now()
  }
  throw new Error("Browser Helper is missing Articulate verification public key")
}

export function setVerificationPublicKey(pem: string) {
  saveVerificationPublicKey(pem)
  cachedKeyPem = pem
}

export async function verifyBrowserAccessToken(
  token: string,
  options?: { expectedDeviceId?: string; jwksUrl?: string | null },
): Promise<VerifiedBrowserAuth> {
  const pem = await resolvePublicKeyPem(options?.jwksUrl)
  // Validate PEM parses
  createPublicKey(pem)
  const key = await importSPKI(pem, "EdDSA")
  const { payload } = await jwtVerify(token, key, {
    issuer: ISSUER,
    audience: AUDIENCE,
  })

  const deviceId = typeof payload.device_id === "string" ? payload.device_id : ""
  if (options?.expectedDeviceId && deviceId !== options.expectedDeviceId) {
    throw new Error("Token device_id mismatch")
  }

  const scopes = Array.isArray(payload.scope)
    ? payload.scope.map(String)
    : typeof payload.scope === "string"
      ? [payload.scope]
      : []

  return {
    sub: String(payload.sub || ""),
    userId: Number(payload.user_id) || 0,
    deviceId,
    scopes,
    exp: Number(payload.exp) || 0,
  }
}

export function tokenHasScope(auth: VerifiedBrowserAuth, scope: string): boolean {
  return auth.scopes.includes(scope) || auth.scopes.includes("local_browser:control")
}
