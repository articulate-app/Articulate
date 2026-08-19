import type { SupabaseClient } from "@supabase/supabase-js"
import * as Y from "yjs"
import { bytesToBase64 } from "./binary"
import {
  canCompleteYdocSeed,
  isYdocSeedFailed,
  isYdocSeedReady,
  resolveYdocSeedSource,
  shouldWaitForYdocSeed,
  type FetchOrClaimYdocResult,
} from "./seed-policy"
import { compareSeedDocuments } from "./seed-compare"
import { TIPTAP_COLLAB_SCHEMA_VERSION } from "./tiptap-collab-schema"
import {
  encodeYDocSnapshot,
  extractArtifactSeedHtml,
  extractArtifactSeedJson,
  htmlToTipTapJson,
  htmlToYDoc,
  tipTapJsonToYDoc,
  yDocToTipTapJson,
} from "./ydoc-content"
import { artifactHasExistingEditorContent, seedEmptyRichTextYdoc } from "./seed-from-html"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export type SeedExistingResult =
  | { status: "ready" }
  | { status: "seeding" }
  | { status: "failed"; error: string; nodes: string[] }
  | { status: "skipped"; reason: string }

export async function seedExistingArtifact(args: {
  supabase: SupabaseClient
  artifactId: string
  contentJson?: unknown
  contentText?: string | null
}): Promise<SeedExistingResult> {
  const loaded = await args.supabase.rpc("artifact_collab_load_document_v1", {
    p_artifact_id: args.artifactId,
    p_after_seq: 0,
  })
  if (loaded.error) {
    return { status: "failed", error: loaded.error.message, nodes: [] }
  }
  const loadedRow = asRecord(loaded.data)
  if (typeof loadedRow?.snapshot_base64 === "string" && loadedRow.snapshot_base64.length > 0) {
    return { status: "ready" }
  }

  const claimed = await args.supabase.rpc("artifact_collab_claim_seed_v1", {
    p_artifact_id: args.artifactId,
  })
  if (claimed.error) {
    return { status: "failed", error: claimed.error.message, nodes: [] }
  }
  const claim = asRecord(claimed.data) as FetchOrClaimYdocResult | null
  if (isYdocSeedReady(claim)) return { status: "ready" }
  if (isYdocSeedFailed(claim)) {
    return { status: "failed", error: String(claim?.seed_error ?? "seed_failed"), nodes: [] }
  }
  if (shouldWaitForYdocSeed(claim)) return { status: "seeding" }
  if (!canCompleteYdocSeed(claim)) {
    return { status: "skipped", reason: "seed_not_claimed" }
  }

  const reloaded = await args.supabase.rpc("artifact_collab_load_document_v1", {
    p_artifact_id: args.artifactId,
    p_after_seq: 0,
  })
  const reloadedRow = asRecord(reloaded.data)
  if (typeof reloadedRow?.snapshot_base64 === "string" && reloadedRow.snapshot_base64.length > 0) {
    return { status: "ready" }
  }

  const jsonDoc = extractArtifactSeedJson(args.contentJson)
  const source = resolveYdocSeedSource({
    contentJsonHtml: jsonDoc ? null : extractArtifactSeedHtml(args.contentJson),
    contentText: args.contentText,
  })
  const hasExisting = artifactHasExistingEditorContent({
    contentJson: args.contentJson,
    contentText: args.contentText,
  })

  try {
    const originalJson = jsonDoc ?? htmlToTipTapJson(source.html)
    const document = jsonDoc ? tipTapJsonToYDoc(jsonDoc) : htmlToYDoc(source.html)
    if (source.source === "empty") {
      seedEmptyRichTextYdoc(document)
    }
    const compared = compareSeedDocuments({
      original: originalJson,
      converted: yDocToTipTapJson(document),
      sourceWasEmpty: !hasExisting,
    })
    if (!compared.ok) {
      if (hasExisting && compared.reason === "empty_overwrite") {
        await args.supabase.rpc("artifact_collab_fail_seed_v1", {
          p_artifact_id: args.artifactId,
          p_claim_token: claim!.claim_token,
          p_error: compared.message,
        })
        return { status: "failed", error: compared.message, nodes: compared.nodes }
      }
      await args.supabase.rpc("artifact_collab_fail_seed_v1", {
        p_artifact_id: args.artifactId,
        p_claim_token: claim!.claim_token,
        p_error: compared.message,
      })
      return { status: "failed", error: compared.message, nodes: compared.nodes }
    }
    if (hasExisting && document.getXmlFragment("default").length === 0) {
      await args.supabase.rpc("artifact_collab_fail_seed_v1", {
        p_artifact_id: args.artifactId,
        p_claim_token: claim!.claim_token,
        p_error: "Seed conversion produced an empty Y.Doc over existing content.",
      })
      return {
        status: "failed",
        error: "Seed conversion produced an empty Y.Doc over existing content.",
        nodes: ["doc"],
      }
    }

    const encoded = encodeYDocSnapshot(document)
    const completed = await args.supabase.rpc("artifact_collab_complete_seed_v1", {
      p_artifact_id: args.artifactId,
      p_claim_token: claim!.claim_token,
      p_snapshot_base64: bytesToBase64(encoded.snapshot),
      p_state_vector_base64: bytesToBase64(encoded.stateVector),
      p_seeded_from: source.source,
      p_schema_version: TIPTAP_COLLAB_SCHEMA_VERSION,
    })
    if (completed.error) {
      return { status: "failed", error: completed.error.message, nodes: [] }
    }
    const completedRow = asRecord(completed.data)
    if (completedRow?.ok === false) {
      return { status: "failed", error: String(completedRow.code ?? "seed_claim_mismatch"), nodes: [] }
    }
    return { status: "ready" }
  } catch (error) {
    const message = error instanceof Error ? error.message : "seed_failed"
    await args.supabase.rpc("artifact_collab_fail_seed_v1", {
      p_artifact_id: args.artifactId,
      p_claim_token: claim!.claim_token,
      p_error: message,
    })
    return { status: "failed", error: message, nodes: [] }
  }
}

export function convertExistingArtifactToYDoc(args: {
  contentJson?: unknown
  contentText?: string | null
}): { document: Y.Doc; error?: string; nodes?: string[] } {
  const jsonDoc = extractArtifactSeedJson(args.contentJson)
  const source = resolveYdocSeedSource({
    contentJsonHtml: jsonDoc ? null : extractArtifactSeedHtml(args.contentJson),
    contentText: args.contentText,
  })
  const hasExisting = artifactHasExistingEditorContent(args)
  const originalJson = jsonDoc ?? htmlToTipTapJson(source.html)
  const document = jsonDoc ? tipTapJsonToYDoc(jsonDoc) : htmlToYDoc(source.html)
  if (source.source === "empty") seedEmptyRichTextYdoc(document)
  const compared = compareSeedDocuments({
    original: originalJson,
    converted: yDocToTipTapJson(document),
    sourceWasEmpty: !hasExisting,
  })
  if (!compared.ok) {
    return { document, error: compared.message, nodes: compared.nodes }
  }
  return { document }
}
