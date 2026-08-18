import { generateJSON } from "@tiptap/html"
import { JSDOM } from "jsdom"
import { prosemirrorJSONToYDoc } from "y-prosemirror"
import * as Y from "yjs"
import { getSchema } from "@tiptap/core"
import { extractPrimaryArtifactHtml } from "../../../app/lib/artifact-selection-patch"
import { resolveYdocSeedSource } from "../../../app/lib/collaboration/seed-policy"
import { getArtifactCollaborationExtensions } from "./tiptap-schema"

let domInstalled = false

function ensureDom(): void {
  if (domInstalled) return
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>")
  const g = globalThis as unknown as {
    window: unknown
    document: unknown
    DOMParser: unknown
    Node: unknown
  }
  g.window = dom.window
  g.document = dom.window.document
  g.DOMParser = dom.window.DOMParser
  g.Node = dom.window.Node
  domInstalled = true
}

export function seedYdocFromArtifactContent(args: {
  contentJson: unknown
  contentText: string | null | undefined
}): { document: Y.Doc; seededFrom: "content_json" | "html" | "empty" } {
  ensureDom()
  const resolved = resolveYdocSeedSource({
    contentJsonHtml: extractPrimaryArtifactHtml(args.contentJson),
    contentText: args.contentText,
  })
  const extensions = getArtifactCollaborationExtensions()
  const json = generateJSON(resolved.html, extensions)
  const schema = getSchema(extensions)
  const document = prosemirrorJSONToYDoc(schema, json, "default")
  return { document, seededFrom: resolved.source }
}

export function applyEncodedUpdate(document: Y.Doc, snapshotBase64: string): void {
  const bytes = Buffer.from(snapshotBase64, "base64")
  Y.applyUpdate(document, new Uint8Array(bytes))
}

export function encodeYdocSnapshot(document: Y.Doc): {
  snapshotBase64: string
  stateVectorBase64: string
  byteSize: number
} {
  const snapshot = Y.encodeStateAsUpdate(document)
  const stateVector = Y.encodeStateVector(document)
  return {
    snapshotBase64: Buffer.from(snapshot).toString("base64"),
    stateVectorBase64: Buffer.from(stateVector).toString("base64"),
    byteSize: snapshot.byteLength,
  }
}
