/**
 * Fetch HTML for in-pane template preview (uploaded file or remote URL).
 */

export async function fetchHtmlPreviewFromUrl(url: string): Promise<string> {
  const href = url.trim()
  if (!href) throw new Error("missing_url")

  // Same-origin / storage files can be read directly.
  const isRemoteHttp = /^https?:\/\//i.test(href)
  if (!isRemoteHttp) {
    const response = await fetch(href)
    if (!response.ok) throw new Error(`html_fetch_failed:${response.status}`)
    return await response.text()
  }

  const apiUrl = `/api/html-preview?url=${encodeURIComponent(href)}`
  const response = await fetch(apiUrl)
  const payload = (await response.json().catch(() => null)) as
    | { html?: string; error?: string }
    | null
  if (!response.ok || !payload?.html) {
    throw new Error(payload?.error || `html_preview_failed:${response.status}`)
  }
  return payload.html
}
