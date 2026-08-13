import { NextRequest, NextResponse } from "next/server"

const MAX_BYTES = 2_000_000
const FETCH_TIMEOUT_MS = 20_000

function isAllowedHttpUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    if (!parsed.hostname) return null
    return parsed
  } catch {
    return null
  }
}

/** Strip scripts / event handlers so the preview can safely use iframe srcDoc. */
function sanitizePreviewHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<script\b[^>]*\/>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
}

/** Resolve relative CSS/images inside iframe srcDoc. */
function injectBaseHref(html: string, baseUrl: string): string {
  if (/<base\b/i.test(html)) return html
  const safe = baseUrl.replace(/"/g, "&quot;")
  const tag = `<base href="${safe}">`
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}${tag}`)
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${tag}</head>`)
  }
  return `<!doctype html><html><head>${tag}</head><body>${html}</body></html>`
}

/**
 * Server-side HTML fetch for in-pane template / newsletter preview.
 * Avoids browser X-Frame-Options blocks by returning HTML for iframe srcDoc.
 */
export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim() || ""
  const parsed = isAllowedHttpUrl(rawUrl)
  if (!parsed) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 })
  }

  try {
    const response = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        // Browser-like UA — archive hosts (Mailchimp, etc.) often soft-block unknown agents.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: "fetch_failed", status: response.status },
        { status: 502 },
      )
    }

    const contentType = response.headers.get("content-type") || ""
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 })
    }

    const text = new TextDecoder("utf-8").decode(buffer)
    const looksLikeHtml =
      /text\/html/i.test(contentType) ||
      /<!doctype\s+html/i.test(text) ||
      /<html\b/i.test(text) ||
      /<body\b/i.test(text)

    if (!looksLikeHtml) {
      return NextResponse.json(
        { error: "not_html", contentType },
        { status: 415 },
      )
    }

    const finalUrl =
      response.url ||
      response.headers.get("content-location") ||
      parsed.toString()
    const sanitized = sanitizePreviewHtml(text)

    return NextResponse.json({
      url: finalUrl,
      contentType: contentType || "text/html",
      html: injectBaseHref(sanitized, finalUrl),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: "fetch_error", message }, { status: 502 })
  }
}
