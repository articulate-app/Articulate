import type { JSONContent } from "@tiptap/core"
import * as Y from "yjs"
import { applyLoadedDocument, COLLAB_REMOTE_ORIGIN } from "./sync-protocol"
import {
  htmlToTipTapJson,
  replaceYDocContent,
  tipTapJsonToPlainText,
  yDocToHtml,
  yDocToPlainText,
} from "./ydoc-content"

export type AiProposalStatus =
  | "streaming"
  | "ready"
  | "applying"
  | "applied"
  | "conflict"
  | "rejected"
  | "failed"

export type ApplyAiProposalInput = {
  currentHtml: string
  expectedText?: string | null
  patchedHtml: string
  ydoc: Y.Doc
}

export type ApplyAiProposalResult =
  | { ok: true; update: Uint8Array; origin: "ai" }
  | {
      ok: false
      status: "conflict" | "failed"
      reason: string
      currentText: string
    }

function normalize(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

export function validateExpectedText(args: {
  currentHtml: string
  ydoc: Y.Doc
  expectedText?: string | null
}): { ok: true } | { ok: false; reason: string; currentText: string } {
  const expected = String(args.expectedText ?? "").trim()
  if (!expected) return { ok: true }
  const yText = normalize(yDocToPlainText(args.ydoc))
  const htmlText = normalize(args.currentHtml.replace(/<[^>]+>/g, " "))
  const needle = normalize(expected)
  if (yText.includes(needle) || htmlText.includes(needle) || args.currentHtml.includes(expected)) {
    return { ok: true }
  }
  return {
    ok: false,
    reason: "expected_text_mismatch",
    currentText: yText,
  }
}

export function applyCompletedAiPatchToYdoc(input: ApplyAiProposalInput): ApplyAiProposalResult {
  const currentText = yDocToPlainText(input.ydoc)
  const expected = validateExpectedText({
    currentHtml: input.currentHtml || yDocToHtml(input.ydoc),
    ydoc: input.ydoc,
    expectedText: input.expectedText,
  })
  if (!expected.ok) {
    return {
      ok: false,
      status: "conflict",
      reason: expected.reason,
      currentText: expected.currentText,
    }
  }
  try {
    const json = htmlToTipTapJson(input.patchedHtml)
    const update = replaceYDocContent(input.ydoc, json, "ai")
    return { ok: true, update, origin: "ai" }
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      reason: error instanceof Error ? error.message : "ai_apply_failed",
      currentText,
    }
  }
}

export function loadYdocFromPersisted(args: {
  snapshot?: Uint8Array | null
  updates: Array<{ update: Uint8Array; idempotencyKey: string; seq: number }>
}): Y.Doc {
  const document = new Y.Doc()
  applyLoadedDocument(document, {
    snapshot: args.snapshot,
    lastIncludedSeq: 0,
    updates: args.updates.map((update, index) => ({
      id: `${update.idempotencyKey || "update"}:${update.seq}:${index}`,
      seq: update.seq,
      update: update.update,
      idempotencyKey: update.idempotencyKey,
    })),
  }, new Set())
  return document
}

export function proposalConflictPayload(args: {
  expectedText?: string | null
  currentText: string
  target?: unknown
}): Record<string, unknown> {
  return {
    kind: "expected_text_mismatch",
    expected_text: args.expectedText ?? null,
    current_text: args.currentText,
    target: args.target ?? {},
    resolvable: true,
  }
}

export function patchedJsonPlainText(json: JSONContent): string {
  return tipTapJsonToPlainText(json)
}

export { COLLAB_REMOTE_ORIGIN }
