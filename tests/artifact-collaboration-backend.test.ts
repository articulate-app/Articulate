import { describe, expect, it } from "vitest"
import * as Y from "yjs"
import { resolveCollaborationAuth } from "../app/lib/collaboration/auth"
import {
  isCollaborativeRichTextEditorKind,
  resolveArtifactEditorKind,
} from "../app/lib/collaboration/editor-kind"
import { assertCollabDocumentSize, COLLAB_MAX_DOCUMENT_BYTES } from "../app/lib/collaboration/limits"
import {
  artifactCollaborationRoom,
  parseArtifactCollaborationRoom,
} from "../app/lib/collaboration/room"
import {
  canCompleteYdocSeed,
  isYdocSeedFailed,
  isYdocSeedReady,
  resolveYdocSeedSource,
  shouldWaitForYdocSeed,
} from "../app/lib/collaboration/seed-policy"
import { canAccessArtifactCollabTopic } from "../app/lib/collaboration/topic-access"

describe("artifact collaboration rooms", () => {
  it("parses a stable artifact room and rejects other names", () => {
    const id = "2f1c6b7a-3c4d-4e5f-a678-90abcedf1234"
    expect(artifactCollaborationRoom(id)).toBe(`artifact:${id}`)
    expect(parseArtifactCollaborationRoom(`artifact:${id}`)).toBe(id)
    expect(parseArtifactCollaborationRoom("artifact:not-a-uuid")).toBeNull()
    expect(parseArtifactCollaborationRoom("doc:other")).toBeNull()
  })
})

describe("collaboration eligibility", () => {
  it("uses editor kind and content format, never artifact_type", () => {
    expect(resolveArtifactEditorKind({
      metadata: { editor_kind: "rich_text" },
    })).toBe("rich_text")
    expect(resolveArtifactEditorKind({
      metadata: { content_format: "tiptap_json" },
    })).toBe("rich_text")
    expect(resolveArtifactEditorKind({
      metadata: { content_format: "html_email" },
    })).toBe("html_email")
    expect(resolveArtifactEditorKind({
      content_json: { blocks: [{ type: "image" }] },
    })).toBe("image")
    expect(isCollaborativeRichTextEditorKind("rich_text")).toBe(true)
    expect(isCollaborativeRichTextEditorKind("html_email")).toBe(false)
    expect(isCollaborativeRichTextEditorKind("image")).toBe(false)
  })
})

describe("ydoc seed policy", () => {
  it("gives the claim holder exclusive seed rights", () => {
    expect(canCompleteYdocSeed({ status: "claimed", claim_token: "tok" })).toBe(true)
    expect(canCompleteYdocSeed({ status: "seeding" })).toBe(false)
    expect(canCompleteYdocSeed({ status: "ready", snapshot_base64: "abc" })).toBe(false)
    expect(shouldWaitForYdocSeed({ status: "seeding" })).toBe(true)
    expect(isYdocSeedReady({ status: "ready", snapshot_base64: "abc" })).toBe(true)
    expect(isYdocSeedFailed({ status: "failed", seed_error: "parse" })).toBe(true)
  })

  it("prefers content_json HTML and falls back to text", () => {
    expect(resolveYdocSeedSource({ contentJsonHtml: "<p>From json</p>", contentText: "plain" })).toEqual({
      source: "content_json",
      html: "<p>From json</p>",
    })
    expect(resolveYdocSeedSource({ contentJsonHtml: null, contentText: "Hello" }).source).toBe("html")
    expect(resolveYdocSeedSource({ contentJsonHtml: null, contentText: null })).toEqual({
      source: "empty",
      html: "<p></p>",
    })
  })
})

describe("collaboration auth", () => {
  const artifactId = "2f1c6b7a-3c4d-4e5f-a678-90abcedf1234"

  it("never trusts a client userId and marks read-only when write is denied", () => {
    const resolved = resolveCollaborationAuth({
      documentName: `artifact:${artifactId}`,
      token: "jwt-from-supabase",
      envFlagEnabled: true,
      authorize: {
        ok: true,
        artifact_id: artifactId,
        can_read: true,
        can_write: false,
        collab_enabled: false,
        editor_kind: "rich_text",
        user_id: 41,
        full_name: "Ada",
        photo: null,
      },
    })
    expect(resolved.userId).toBe(41)
    expect(resolved.readOnly).toBe(true)
  })

  it("rejects missing tokens and disabled rooms", () => {
    expect(() =>
      resolveCollaborationAuth({
        documentName: `artifact:${artifactId}`,
        token: "",
        envFlagEnabled: true,
        authorize: { ok: true, can_read: true, can_write: true, user_id: 1 },
      }),
    ).toThrow(/authentication_required/)
    expect(() =>
      resolveCollaborationAuth({
        documentName: `artifact:${artifactId}`,
        token: "jwt",
        envFlagEnabled: false,
        authorize: {
          ok: true,
          artifact_id: artifactId,
          can_read: true,
          can_write: true,
          collab_enabled: false,
          editor_kind: "rich_text",
          user_id: 1,
        },
      }),
    ).toThrow(/collab_disabled/)
  })
})

describe("realtime topic authorization", () => {
  const topic = "artifact:2f1c6b7a-3c4d-4e5f-a678-90abcedf1234"

  it("blocks channel access without artifact permission", () => {
    expect(canAccessArtifactCollabTopic({
      topic,
      action: "receive",
      hasArtifactAccess: false,
      canWrite: false,
    })).toBe(false)
    expect(canAccessArtifactCollabTopic({
      topic: "public-room",
      action: "receive",
      hasArtifactAccess: true,
      canWrite: true,
    })).toBe(false)
  })

  it("lets read-only users receive and track presence but not broadcast", () => {
    expect(canAccessArtifactCollabTopic({
      topic,
      action: "receive",
      hasArtifactAccess: true,
      canWrite: false,
    })).toBe(true)
    expect(canAccessArtifactCollabTopic({
      topic,
      action: "presence",
      hasArtifactAccess: true,
      canWrite: false,
    })).toBe(true)
    expect(canAccessArtifactCollabTopic({
      topic,
      action: "send",
      hasArtifactAccess: true,
      canWrite: false,
    })).toBe(false)
  })
})

describe("Yjs persistence helpers", () => {
  it("converges two clients that edit different paragraphs", () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    a.getXmlFragment("default")
    b.getXmlFragment("default")
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    a.getText("p1").insert(0, "hello from A")
    b.getText("p2").insert(0, "hello from B")
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))

    expect(a.getText("p1").toString()).toBe("hello from A")
    expect(b.getText("p1").toString()).toBe("hello from A")
    expect(a.getText("p2").toString()).toBe("hello from B")
    expect(b.getText("p2").toString()).toBe("hello from B")
  })

  it("does not lose overlapping inserts in the same text", () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    a.getText("body").insert(0, "word")
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))

    a.getText("body").insert(0, "AA")
    b.getText("body").insert(4, "BB")
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))

    expect(a.getText("body").toString()).toBe(b.getText("body").toString())
    expect(a.getText("body").toString()).toContain("AA")
    expect(a.getText("body").toString()).toContain("BB")
  })

  it("rejects oversized documents", () => {
    expect(() => assertCollabDocumentSize(COLLAB_MAX_DOCUMENT_BYTES + 1)).toThrow(/ydoc_too_large/)
    expect(() => assertCollabDocumentSize(12)).not.toThrow()
  })
})
