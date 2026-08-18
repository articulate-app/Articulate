import { config as loadEnv } from "dotenv"
import { COLLAB_MAX_DOCUMENT_BYTES, COLLAB_MAX_UPDATE_BYTES } from "../../../app/lib/collaboration/limits"

loadEnv({ path: new URL("../.env", import.meta.url) })
loadEnv()

function required(name: string): string {
  const value = String(process.env[name] ?? "").trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function optionalNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

export const collabConfig = {
  port: optionalNumber("COLLAB_PORT", 1234),
  host: String(process.env.COLLAB_HOST ?? "0.0.0.0").trim() || "0.0.0.0",
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  envFlagEnabled: String(process.env.ARTIFACT_COLLAB_ENABLED ?? "").trim().toLowerCase() === "true",
  maxDocumentBytes: optionalNumber("COLLAB_MAX_DOCUMENT_BYTES", COLLAB_MAX_DOCUMENT_BYTES),
  maxUpdateBytes: optionalNumber("COLLAB_MAX_UPDATE_BYTES", COLLAB_MAX_UPDATE_BYTES),
}
