import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0"
import * as Y from "https://esm.sh/yjs@13.6.27"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const UPDATE_COUNT_LIMIT = 200
const UPDATE_BYTES_LIMIT = 512 * 1024
const CHECKPOINT_FORCE = true

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}

function uuidOrNull(value: unknown) {
  const text = String(value ?? "").trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  bytes.forEach((value) => {
    binary += String.fromCharCode(value)
  })
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
  if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "service_role_required" }, 500)

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const body = asRecord(await req.json().catch(() => ({}))) ?? {}
  const artifactId = uuidOrNull(body.artifact_id)
  if (!artifactId) return json({ error: "artifact_id_required" }, 400)

  const { data, error } = await admin.rpc("artifact_collab_load_document_v1", {
    p_artifact_id: artifactId,
    p_after_seq: 0,
  })
  if (error) return json({ error: error.message }, 400)

  const loaded = asRecord(data) ?? {}
  const updates = Array.isArray(loaded.updates) ? loaded.updates : []
  const updateBytes = updates.reduce((sum, item) => {
    const rec = asRecord(item)
    const encoded = String(rec?.update_base64 ?? "")
    return sum + Math.floor((encoded.length * 3) / 4)
  }, 0)
  const force = body.force === true || (body.checkpoint === true && CHECKPOINT_FORCE)
  if (
    !force
    && updates.length < UPDATE_COUNT_LIMIT
    && updateBytes < UPDATE_BYTES_LIMIT
  ) {
    return json({ ok: true, compacted: false, reason: "below_threshold", updates: updates.length })
  }
  if (updates.length === 0) {
    return json({ ok: true, compacted: false, reason: "nothing_to_compact" })
  }

  const closedSeq = updates.reduce((max, item) => {
    const seq = Number(asRecord(item)?.seq ?? 0)
    return seq > max ? seq : max
  }, Number(loaded.last_included_seq ?? 0))

  const doc = new Y.Doc()
  if (typeof loaded.snapshot_base64 === "string" && loaded.snapshot_base64.length > 0) {
    Y.applyUpdate(doc, base64ToBytes(loaded.snapshot_base64))
  }
  for (const item of updates) {
    const rec = asRecord(item)
    const encoded = typeof rec?.update_base64 === "string" ? rec.update_base64 : ""
    const seq = Number(rec?.seq ?? 0)
    if (encoded && seq <= closedSeq) {
      Y.applyUpdate(doc, base64ToBytes(encoded))
    }
  }

  const snapshot = Y.encodeStateAsUpdate(doc)
  const stateVector = Y.encodeStateVector(doc)
  const { data: compacted, error: compactError } = await admin.rpc("collab_compact_ydoc_v1", {
    p_artifact_id: artifactId,
    p_closed_seq: closedSeq,
    p_snapshot_base64: bytesToBase64(snapshot),
    p_state_vector_base64: bytesToBase64(stateVector),
  })
  if (compactError) return json({ error: compactError.message }, 400)
  return json({ ok: true, compacted: true, closed_seq: closedSeq, result: compacted })
})
