/**
 * Server-only signing for short-lived local Browser Helper authorization tokens.
 * Private key never leaves the Articulate backend.
 */

import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto"
import { SignJWT, importPKCS8, importSPKI, jwtVerify } from "jose"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export const LOCAL_BROWSER_TOKEN_TTL_SECONDS = 5 * 60
export const LOCAL_BROWSER_TOKEN_ISSUER = "articulate-local-browser"
export const LOCAL_BROWSER_TOKEN_AUDIENCE = "articulate-browser-helper"

export type LocalBrowserScope =
  | "local_browser:open"
  | "local_browser:control"
  | "local_browser:stream"
  | "local_browser:close"

export const ALL_LOCAL_BROWSER_SCOPES: LocalBrowserScope[] = [
  "local_browser:open",
  "local_browser:control",
  "local_browser:stream",
  "local_browser:close",
]

const DEV_KEY_DIR = join(homedir(), ".articulate", "browser-helper-signing")
const DEV_PRIVATE_PATH = join(DEV_KEY_DIR, "jwt-ed25519-private.pem")
const DEV_PUBLIC_PATH = join(DEV_KEY_DIR, "jwt-ed25519-public.pem")

function ensureDevKeyPair(): { privatePem: string; publicPem: string } {
  if (existsSync(DEV_PRIVATE_PATH) && existsSync(DEV_PUBLIC_PATH)) {
    return {
      privatePem: readFileSync(DEV_PRIVATE_PATH, "utf8"),
      publicPem: readFileSync(DEV_PUBLIC_PATH, "utf8"),
    }
  }
  mkdirSync(DEV_KEY_DIR, { recursive: true, mode: 0o700 })
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString()
  writeFileSync(DEV_PRIVATE_PATH, privatePem, { mode: 0o600 })
  writeFileSync(DEV_PUBLIC_PATH, publicPem, { mode: 0o644 })
  return { privatePem, publicPem }
}

function resolveSigningPems(): { privatePem: string; publicPem: string } {
  const envPrivate = process.env.LOCAL_BROWSER_JWT_PRIVATE_KEY?.trim()
  const envPublic = process.env.LOCAL_BROWSER_JWT_PUBLIC_KEY?.trim()
  if (envPrivate && envPublic) {
    return {
      privatePem: envPrivate.replace(/\\n/g, "\n"),
      publicPem: envPublic.replace(/\\n/g, "\n"),
    }
  }
  if (envPrivate && !envPublic) {
    const key = createPrivateKey(envPrivate.replace(/\\n/g, "\n"))
    const publicPem = createPublicKey(key).export({ type: "spki", format: "pem" }).toString()
    return { privatePem: envPrivate.replace(/\\n/g, "\n"), publicPem }
  }
  // Local/dev fallback — never ship this path as the only production config.
  return ensureDevKeyPair()
}

export async function getLocalBrowserJwks() {
  const { publicPem } = resolveSigningPems()
  const pub = createPublicKey(publicPem)
  const jwk = pub.export({ format: "jwk" }) as Record<string, unknown>
  return {
    keys: [
      {
        ...jwk,
        kid: "articulate-local-browser-1",
        alg: "EdDSA",
        use: "sig",
      },
    ],
    publicKeyPem: publicPem,
  }
}

export async function getLocalBrowserPublicKeyPem(): Promise<string> {
  return resolveSigningPems().publicPem
}

export type LocalBrowserTokenClaims = {
  sub: string
  user_id: number
  device_id: string
  scope: LocalBrowserScope[]
  workspace_id?: string | null
}

export async function mintLocalBrowserAccessToken(
  claims: LocalBrowserTokenClaims,
  ttlSeconds: number = LOCAL_BROWSER_TOKEN_TTL_SECONDS,
): Promise<{ token: string; expiresAt: string; expiresIn: number }> {
  const { privatePem } = resolveSigningPems()
  const key = await importPKCS8(privatePem, "EdDSA")
  const expiresIn = Math.max(60, Math.min(ttlSeconds, 15 * 60))
  const expiresAtMs = Date.now() + expiresIn * 1000
  const token = await new SignJWT({
    user_id: claims.user_id,
    device_id: claims.device_id,
    scope: claims.scope,
    workspace_id: claims.workspace_id ?? null,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "articulate-local-browser-1", typ: "JWT" })
    .setIssuer(LOCAL_BROWSER_TOKEN_ISSUER)
    .setAudience(LOCAL_BROWSER_TOKEN_AUDIENCE)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAtMs / 1000))
    .sign(key)

  return {
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresIn,
  }
}

/** Server-side verify (tests / internal). Helper verifies with public key only. */
export async function verifyLocalBrowserAccessToken(token: string) {
  const { publicPem } = resolveSigningPems()
  const key = await importSPKI(publicPem, "EdDSA")
  const { payload } = await jwtVerify(token, key, {
    issuer: LOCAL_BROWSER_TOKEN_ISSUER,
    audience: LOCAL_BROWSER_TOKEN_AUDIENCE,
  })
  return payload
}
