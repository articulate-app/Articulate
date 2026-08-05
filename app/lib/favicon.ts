/** Best-effort favicon URL from a website/domain (Google s2; fine for UI avatars). */
export function faviconUrlForSite(
  websiteUrl: string | null | undefined,
  size = 64,
): string | null {
  if (!websiteUrl?.trim()) return null
  try {
    const raw = websiteUrl.includes("://") ? websiteUrl : `https://${websiteUrl}`
    const host = new URL(raw).hostname.replace(/^www\./, "")
    if (!host) return null
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`
  } catch {
    return null
  }
}
