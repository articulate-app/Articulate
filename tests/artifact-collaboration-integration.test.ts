import { createClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { bytesToBase64 } from "../app/lib/collaboration/binary"

const enabled = process.env.ARTIFACT_COLLAB_INTEGRATION === "1"
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

describe.skipIf(!enabled || !url || !serviceKey)("artifact collaboration integration (live Supabase)", () => {
  it("projects and checkpoints a disposable Y.Doc through the real RPCs", async () => {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: host } = await admin
      .from("artifacts")
      .select("task_id, project_id, ai_thread_id")
      .not("task_id", "is", null)
      .limit(1)
      .maybeSingle()
    const { data: artifact, error: createError } = await admin
      .from("artifacts")
      .insert({
        artifact_type: "document",
        title: "collab-rpc-live-test",
        status: "draft",
        task_id: host?.task_id ?? 13113,
        project_id: host?.project_id ?? null,
        ai_thread_id: host?.ai_thread_id ?? null,
        content_text: "Live RPC seed.",
        content_json: {
          version: 1,
          editor_kind: "rich_text",
          content_format: "tiptap_json",
          blocks: [{ id: "body", type: "rich_text", html: "<p>Live RPC seed.</p>", text: "Live RPC seed." }],
        },
        metadata: { editor_kind: "rich_text", content_format: "tiptap_json" },
      })
      .select("id")
      .single()
    expect(createError).toBeNull()
    const artifactId = String(artifact?.id ?? "")
    expect(artifactId).toMatch(/^[0-9a-f-]{36}$/i)

    try {
      const document = new Y.Doc()
      document.getXmlFragment("default")
      const snapshot = Y.encodeStateAsUpdate(document)
      const stateVector = Y.encodeStateVector(document)
      const persist = await admin.rpc("artifact_collab_persist_update_v1", {
        p_artifact_id: artifactId,
        p_update_base64: bytesToBase64(snapshot),
        p_idempotency_key: `live-test:${artifactId}:seed`,
        p_origin: "system",
        p_actor_type: "system",
      })
      expect(persist.error).toBeNull()
      const seq = Number((persist.data as { seq?: number } | null)?.seq ?? 0)
      expect(seq).toBeGreaterThan(0)

      const projected = await admin.rpc("artifact_collab_project_v1", {
        p_artifact_id: artifactId,
        p_seq: seq,
        p_content_json: {
          version: 1,
          editor_kind: "rich_text",
          content_format: "tiptap_json",
          blocks: [{ id: "body", type: "rich_text", html: "<p>Projected live.</p>", text: "Projected live." }],
        },
        p_content_text: "Projected live.",
        p_state_vector_base64: bytesToBase64(stateVector),
      })
      expect(projected.error).toBeNull()
      expect((projected.data as { ok?: boolean } | null)?.ok).toBe(true)

      const checkpoint = await admin.rpc("artifact_collab_checkpoint_v1", {
        p_artifact_id: artifactId,
        p_seq: seq,
        p_snapshot: { content_text: "Projected live." },
        p_change_source: "system",
        p_summary: "Live RPC checkpoint",
        p_state_vector_base64: bytesToBase64(stateVector),
      })
      expect(checkpoint.error).toBeNull()
      expect((checkpoint.data as { ok?: boolean } | null)?.ok).toBe(true)

      const { data: row } = await admin
        .from("artifacts")
        .select("content_text, current_version")
        .eq("id", artifactId)
        .single()
      expect(row?.content_text).toBe("Projected live.")
      expect(Number(row?.current_version ?? 0)).toBeGreaterThan(0)

      const { data: version } = await admin
        .from("artifact_versions")
        .select("change_summary, yjs_seq")
        .eq("artifact_id", artifactId)
        .order("version_number", { ascending: false })
        .limit(1)
        .single()
      expect(version?.change_summary).toBe("Live RPC checkpoint")
      expect(Number(version?.yjs_seq ?? 0)).toBe(seq)
    } finally {
      await admin.from("artifacts").delete().eq("id", artifactId)
    }
  })
})
