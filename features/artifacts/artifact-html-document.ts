import {
  extractArtifactBlocks,
  type ArtifactContentJson,
  type TaskArtifact,
} from "../../app/lib/artifacts/artifact-types"

export const ARTIFACT_CONTENT_FORMAT_HTML_EMAIL = "html_email"

type ArtifactLike = Pick<
  TaskArtifact,
  "content_json" | "content_text" | "metadata" | "artifact_type" | "artifact_role" | "title"
>

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Extract the largest HTML string from content_json / content_text. */
export function extractRawArtifactHtml(artifact: ArtifactLike): string {
  const blocks = extractArtifactBlocks(artifact.content_json)
  let best = ""
  for (const block of blocks) {
    const html = typeof block.html === "string" ? block.html.trim() : ""
    if (html.length > best.length) best = html
  }
  if (best) return best
  const text = typeof artifact.content_text === "string" ? artifact.content_text.trim() : ""
  if (/<[a-z][\s\S]*>/i.test(text)) return text
  return ""
}

function looksLikeEmailOrFullHtmlDocument(html: string): boolean {
  const source = String(html ?? "")
  if (!source.trim()) return false
  if (/<!doctype\s+html/i.test(source) || /<html\b/i.test(source)) return true
  if (/role\s*=\s*["']presentation["']/i.test(source) && /<table\b/i.test(source)) return true
  if (/<style\b/i.test(source) && /<table\b/i.test(source)) return true
  // Nested layout tables typical of email HTML (not a single TipTap data table).
  const tableCount = (source.match(/<table\b/gi) ?? []).length
  if (tableCount >= 2 && /cellpadding|cellspacing|bgcolor|align=/i.test(source)) return true
  return false
}

function explicitHtmlEmailFormat(artifact: ArtifactLike): boolean {
  const contentJson = asRecord(artifact.content_json)
  const metadata = asRecord(artifact.metadata)
  const format =
    String(contentJson?.content_format ?? metadata?.content_format ?? "").trim().toLowerCase()
  if (format === ARTIFACT_CONTENT_FORMAT_HTML_EMAIL || format === "html" || format === "email") {
    return true
  }
  const type = String(artifact.artifact_type ?? "").trim().toLowerCase()
  if (type === "html" || type === "html_email" || type === "email" || type === "newsletter_html") {
    return true
  }
  const role = String(artifact.artifact_role ?? "").trim().toLowerCase()
  if (role.includes("newsletter_html") || role === "html_email" || role === "email_html") {
    return true
  }
  return false
}

/** True when this artifact should bypass TipTap and use iframe/code preview. */
export function isHtmlEmailArtifact(artifact: ArtifactLike): boolean {
  if (explicitHtmlEmailFormat(artifact)) return true
  return looksLikeEmailOrFullHtmlDocument(extractRawArtifactHtml(artifact))
}

const IFRAME_SCROLL_RESET_STYLE =
  "<style>html,body{height:auto!important;min-height:0!important;overflow:visible!important;}</style>"

/** Ensure iframe srcDoc has a full document shell when the body is a fragment. */
export function htmlEmailDocumentForPreview(html: string): string {
  const source = String(html ?? "").trim()
  if (!source) {
    return `<!doctype html><html><head>${IFRAME_SCROLL_RESET_STYLE}</head><body></body></html>`
  }
  if (/<!doctype\s+html/i.test(source) || /<html\b/i.test(source)) {
    if (/<\/head>/i.test(source)) {
      return source.replace(/<\/head>/i, `${IFRAME_SCROLL_RESET_STYLE}</head>`)
    }
    if (/<body\b/i.test(source)) {
      return source.replace(/<body\b/i, `${IFRAME_SCROLL_RESET_STYLE}<body`)
    }
    return `${IFRAME_SCROLL_RESET_STYLE}${source}`
  }
  return [
    "<!doctype html>",
    '<html lang="pt">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    IFRAME_SCROLL_RESET_STYLE,
    "</head>",
    '<body style="margin:0;background:transparent;">',
    source,
    "</body>",
    "</html>",
  ].join("")
}

export function buildHtmlEmailContentJson(
  html: string,
  previous?: ArtifactContentJson | null,
): ArtifactContentJson {
  const plain = String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return {
    ...(previous ?? {}),
    version: (previous as { version?: number } | null)?.version ?? 1,
    content_format: ARTIFACT_CONTENT_FORMAT_HTML_EMAIL,
    blocks: [
      {
        id: "body",
        type: "rich_text",
        html,
        text: plain.slice(0, 20000),
      },
    ],
  }
}
