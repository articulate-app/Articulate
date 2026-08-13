/**
 * Persistent Browser Helper device identity (Ed25519).
 * Private key stays on this machine (Keychain when available, else 0600 file).
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
} from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const SERVICE = "com.articulate.browser-helper"
const ACCOUNT = "device-ed25519-private"
const DIR = join(homedir(), ".articulate", "browser-helper")
const META_PATH = join(DIR, "device.json")
const KEY_PATH = join(DIR, "device-ed25519-private.pem")
const VERIFY_PEM_PATH = join(DIR, "articulate-jwt-public.pem")

export type DeviceIdentity = {
  deviceId: string
  publicKeyPem: string
  platform: string
  createdAt: string
}

function platformName(): string {
  if (process.platform === "darwin") return "macOS"
  if (process.platform === "win32") return "Windows"
  return "Linux"
}

function tryKeychainGet(): string | null {
  if (process.platform !== "darwin") return null
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
    const pem = out.trim().replace(/\\n/g, "\n")
    return pem.includes("PRIVATE KEY") ? pem : null
  } catch {
    return null
  }
}

function tryKeychainSet(privatePem: string): boolean {
  if (process.platform !== "darwin") return false
  try {
    try {
      execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT], {
        stdio: "ignore",
      })
    } catch {
      // ignore missing
    }
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-s",
        SERVICE,
        "-a",
        ACCOUNT,
        "-w",
        privatePem.replace(/\n/g, "\\n"),
        "-U",
      ],
      { stdio: "ignore" },
    )
    return true
  } catch {
    return false
  }
}

function loadOrCreateIdentity(): { identity: DeviceIdentity; privatePem: string } {
  mkdirSync(DIR, { recursive: true, mode: 0o700 })

  let privatePem = tryKeychainGet()
  if (!privatePem && existsSync(KEY_PATH)) {
    privatePem = readFileSync(KEY_PATH, "utf8")
  }

  if (privatePem && existsSync(META_PATH)) {
    const meta = JSON.parse(readFileSync(META_PATH, "utf8")) as DeviceIdentity
    const publicKeyPem = createPublicKey(privatePem)
      .export({ type: "spki", format: "pem" })
      .toString()
    return {
      identity: {
        deviceId: meta.deviceId,
        publicKeyPem,
        platform: meta.platform || platformName(),
        createdAt: meta.createdAt || new Date().toISOString(),
      },
      privatePem,
    }
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString()
  const identity: DeviceIdentity = {
    deviceId: randomUUID(),
    publicKeyPem,
    platform: platformName(),
    createdAt: new Date().toISOString(),
  }

  const storedInKeychain = tryKeychainSet(privatePem)
  if (!storedInKeychain) {
    writeFileSync(KEY_PATH, privatePem, { mode: 0o600 })
    try {
      chmodSync(KEY_PATH, 0o600)
    } catch {
      // ignore
    }
  }
  writeFileSync(META_PATH, JSON.stringify(identity, null, 2), { mode: 0o600 })

  return { identity, privatePem }
}

let cached: { identity: DeviceIdentity; privatePem: string } | null = null

export function getDeviceIdentity(): DeviceIdentity {
  if (!cached) cached = loadOrCreateIdentity()
  return cached.identity
}

export function signPairingChallenge(challenge: string): string {
  if (!cached) cached = loadOrCreateIdentity()
  const key = createPrivateKey(cached.privatePem)
  const signature = sign(null, Buffer.from(challenge, "utf8"), key)
  return signature.toString("base64")
}

export function saveVerificationPublicKey(pem: string): void {
  mkdirSync(DIR, { recursive: true, mode: 0o700 })
  writeFileSync(VERIFY_PEM_PATH, pem.trim() + "\n", { mode: 0o644 })
}

export function loadVerificationPublicKey(): string | null {
  const env = process.env.LOCAL_BROWSER_JWT_PUBLIC_KEY?.trim()
  if (env) return env.replace(/\\n/g, "\n")
  if (existsSync(VERIFY_PEM_PATH)) return readFileSync(VERIFY_PEM_PATH, "utf8")
  return null
}

export function deviceStorageNote(): string {
  if (process.platform === "darwin" && tryKeychainGet()) {
    return "macos_keychain"
  }
  return existsSync(KEY_PATH) ? "filesystem_0600" : "ephemeral"
}
