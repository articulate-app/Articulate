export type YdocSeedStatus = "pending" | "seeding" | "ready" | "failed" | "claimed"

export type FetchOrClaimYdocResult = {
  status: Exclude<YdocSeedStatus, "pending">
  artifact_id?: string
  snapshot_base64?: string | null
  state_vector_base64?: string | null
  claim_token?: string | null
  seed_error?: string | null
  seeding_started_at?: string | null
}

/**
 * Two processes must not seed the same artifact with different documents.
 * Only the process that received `claimed` may convert and complete the seed.
 */
export function canCompleteYdocSeed(result: FetchOrClaimYdocResult | null | undefined): boolean {
  return result?.status === "claimed" && typeof result.claim_token === "string" && result.claim_token.length > 0
}

export function shouldWaitForYdocSeed(result: FetchOrClaimYdocResult | null | undefined): boolean {
  return result?.status === "seeding"
}

export function isYdocSeedReady(result: FetchOrClaimYdocResult | null | undefined): boolean {
  return result?.status === "ready" && typeof result.snapshot_base64 === "string" && result.snapshot_base64.length > 0
}

export function isYdocSeedFailed(result: FetchOrClaimYdocResult | null | undefined): boolean {
  return result?.status === "failed"
}

export type SeedSource = "content_json" | "html" | "empty"

export function resolveYdocSeedSource(args: {
  contentJsonHtml: string | null | undefined
  contentText: string | null | undefined
}): { source: SeedSource; html: string } {
  const jsonHtml = String(args.contentJsonHtml ?? "").trim()
  if (jsonHtml) return { source: "content_json", html: jsonHtml }
  const text = String(args.contentText ?? "").trim()
  if (text) {
    if (/<[a-z][\s\S]*>/i.test(text)) return { source: "html", html: text }
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    return {
      source: "html",
      html: escaped
        .split(/\n+/)
        .map((line) => `<p>${line || "<br>"}</p>`)
        .join(""),
    }
  }
  return { source: "empty", html: "<p></p>" }
}
