import { afterEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import * as Y from "yjs"
import {
  createMemoryBroadcastBus,
  createMemoryCollabStore,
  createMemoryCollabTransport,
} from "../app/lib/collaboration/memory-store"
import {
  acquireArtifactCollabSession,
  resetArtifactCollabRegistryForTests,
} from "../app/lib/collaboration/provider-registry"
import { restoreArtifactCheckpoint } from "../app/lib/collaboration/restore-checkpoint"
import { createArtifactCollabProvider } from "../app/lib/collaboration/supabase-provider"
import {
  htmlToTipTapJson,
  replaceYDocContent,
  yDocToPlainText,
} from "../app/lib/collaboration/ydoc-content"

function createRestoreSupabase() {
  const rpcCalls: string[] = []
  const client = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push(name)
      if (name === "artifact_collab_persist_update_v1") {
        return { data: { ok: true, seq: 4 }, error: null }
      }
      if (name === "artifact_collab_project_v1") {
        return { data: { ok: true, projected_seq: args?.p_seq ?? 4 }, error: null }
      }
      if (name === "artifact_collab_checkpoint_v1") {
        return { data: { ok: true, version_id: "restore-v", version_number: 8 }, error: null }
      }
      return { data: null, error: { message: `unexpected ${name}` } }
    },
    from: () => ({
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }
  return { rpcCalls, client: client as unknown as SupabaseClient }
}

describe("restoreArtifactCheckpoint", () => {
  afterEach(() => {
    resetArtifactCollabRegistryForTests()
  })

  it("replaces the live collaborative document and flushes instead of SQL-only restore", async () => {
    const artifactId = "1009dbb8-32a0-4a01-ae52-9151d2f228b5"
    const store = createMemoryCollabStore()
    const bus = createMemoryBroadcastBus()
    const session = acquireArtifactCollabSession({
      artifactId,
      createProvider: ({ document }) => createArtifactCollabProvider({
        document,
        clientId: "restore-client",
        debounceMs: 0,
        transport: createMemoryCollabTransport({ store, bus }),
      }),
    })
    const provider = session.provider as { connect: () => Promise<void>; flush: () => Promise<void> }
    await provider.connect()
    replaceYDocContent(session.document, htmlToTipTapJson("<p>current live copy</p>"), "user")
    await provider.flush()

    const { rpcCalls, client } = createRestoreSupabase()
    const restored = await restoreArtifactCheckpoint({
      supabase: client,
      artifactId,
      snapshot: {
        title: "Older title",
        content_json: htmlToTipTapJson("<p>restored history</p>"),
        content_text: "restored history",
      },
      summary: "Restored artifact version 6",
    })

    expect(restored).toEqual({ ok: true, versionNumber: 8 })
    expect(yDocToPlainText(session.document)).toContain("restored history")
    expect(yDocToPlainText(session.document)).not.toContain("current live copy")
    expect(rpcCalls).not.toContain("artifact_collab_persist_update_v1")
    expect(rpcCalls).toContain("artifact_collab_project_v1")
    expect(rpcCalls).toContain("artifact_collab_checkpoint_v1")
  })

  it("persists a Yjs restore when no live session is open", async () => {
    const document = new Y.Doc()
    replaceYDocContent(document, htmlToTipTapJson("<p>current live copy</p>"), "user")
    const { rpcCalls, client } = createRestoreSupabase()
    const restored = await restoreArtifactCheckpoint({
      supabase: client,
      artifactId: "1009dbb8-32a0-4a01-ae52-9151d2f228b5",
      document,
      snapshot: {
        title: "Older title",
        content_json: htmlToTipTapJson("<p>restored history</p>"),
        content_text: "restored history",
      },
    })

    expect(restored).toEqual({ ok: true, versionNumber: 8 })
    expect(yDocToPlainText(document)).toContain("restored history")
    expect(rpcCalls).toContain("artifact_collab_persist_update_v1")
    expect(rpcCalls).toContain("artifact_collab_checkpoint_v1")
  })

  it("fails closed when there is no document to restore into", async () => {
    const { rpcCalls, client } = createRestoreSupabase()
    const restored = await restoreArtifactCheckpoint({
      supabase: client,
      artifactId: "1009dbb8-32a0-4a01-ae52-9151d2f228b5",
      snapshot: {
        title: "Older title",
        content_json: htmlToTipTapJson("<p>restored history</p>"),
      },
    })

    expect(restored).toEqual({ ok: false, error: "ydoc_not_open" })
    expect(rpcCalls).toContain("artifact_collab_load_document_v1")
    expect(rpcCalls).not.toContain("artifact_collab_persist_update_v1")
  })
})
