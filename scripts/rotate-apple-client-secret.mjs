#!/usr/bin/env node
/**
 * Generate a fresh Apple Sign in with Apple client secret (ES256 JWT)
 * and update the Supabase Auth provider config via the Management API.
 *
 * Required env:
 *   APPLE_TEAM_ID
 *   APPLE_KEY_ID
 *   APPLE_SERVICES_ID          # Services ID used as JWT `sub` (web OAuth)
 *   APPLE_PRIVATE_KEY         # Full .p8 PEM contents
 *   SUPABASE_ACCESS_TOKEN     # https://supabase.com/dashboard/account/tokens
 *   SUPABASE_PROJECT_REF
 *
 * Optional env:
 *   APPLE_ADDITIONAL_CLIENT_IDS  # e.g. native App ID(s), comma-separated
 *   APPLE_SECRET_TTL_SECONDS     # default 15777000 (Apple max ~6 months)
 *   DRY_RUN=1                    # generate JWT only; do not PATCH Supabase
 */

import { createPrivateKey } from 'node:crypto'
import { SignJWT, importPKCS8 } from 'jose'

const APPLE_AUD = 'https://appleid.apple.com'
/** Apple allows at most ~6 months. */
const DEFAULT_TTL_SECONDS = 15_777_000

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function normalizePrivateKey(raw) {
  // Support GitHub secrets pasted with literal \n sequences.
  let pem = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
  pem = pem.trim()
  if (!pem.includes('BEGIN PRIVATE KEY')) {
    throw new Error('APPLE_PRIVATE_KEY must be a PKCS#8 PEM (.p8) private key')
  }
  // Validate parseability early with a clear error.
  createPrivateKey(pem)
  return pem
}

async function generateAppleClientSecret({
  teamId,
  keyId,
  servicesId,
  privateKeyPem,
  ttlSeconds,
}) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttlSeconds
  const key = await importPKCS8(privateKeyPem, 'ES256')

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setAudience(APPLE_AUD)
    .setSubject(servicesId)
    .sign(key)

  return { jwt, iat: now, exp }
}

async function updateSupabaseAppleSecret({
  projectRef,
  accessToken,
  servicesId,
  additionalClientIds,
  secret,
}) {
  const body = {
    external_apple_enabled: true,
    external_apple_client_id: servicesId,
    external_apple_secret: secret,
  }

  if (additionalClientIds) {
    body.external_apple_additional_client_ids = additionalClientIds
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/config/auth`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `Supabase Management API failed (${response.status}): ${text.slice(0, 500)}`,
    )
  }

  return text ? JSON.parse(text) : null
}

async function main() {
  const teamId = required('APPLE_TEAM_ID')
  const keyId = required('APPLE_KEY_ID')
  const servicesId = required('APPLE_SERVICES_ID')
  const privateKeyPem = normalizePrivateKey(required('APPLE_PRIVATE_KEY'))
  const ttlSeconds = Number(
    process.env.APPLE_SECRET_TTL_SECONDS || DEFAULT_TTL_SECONDS,
  )
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > DEFAULT_TTL_SECONDS) {
    throw new Error(
      `APPLE_SECRET_TTL_SECONDS must be between 1 and ${DEFAULT_TTL_SECONDS}`,
    )
  }

  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
  const { jwt, iat, exp } = await generateAppleClientSecret({
    teamId,
    keyId,
    servicesId,
    privateKeyPem,
    ttlSeconds,
  })

  const iatIso = new Date(iat * 1000).toISOString()
  const expIso = new Date(exp * 1000).toISOString()
  console.log(`Generated Apple client secret JWT (iat=${iatIso}, exp=${expIso})`)

  if (dryRun) {
    console.log('DRY_RUN=1 — skipped Supabase update')
    return
  }

  const projectRef = required('SUPABASE_PROJECT_REF')
  const accessToken = required('SUPABASE_ACCESS_TOKEN')
  const additionalClientIds =
    process.env.APPLE_ADDITIONAL_CLIENT_IDS?.trim() || undefined

  await updateSupabaseAppleSecret({
    projectRef,
    accessToken,
    servicesId,
    additionalClientIds,
    secret: jwt,
  })

  console.log(
    `Updated Supabase Auth Apple secret for project ${projectRef} (services_id=${servicesId})`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
