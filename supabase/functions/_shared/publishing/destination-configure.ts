/**
 * Helpers for conversational publishing-destination configuration.
 * UI naming only — not semantic identifiers.
 */

export function normalizeDestinationStartUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return null
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname) return null
    // Bare host → trailing slash (https://account.squarespace.com/)
    if (!url.pathname || url.pathname === "/") {
      return `${url.origin}/`
    }
    return url.toString()
  } catch {
    return null
  }
}

export function hostKeyFromUrl(value: unknown): string | null {
  const normalized = normalizeDestinationStartUrl(value)
  if (!normalized) return null
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

export function inferDestinationDisplayName(args: {
  name?: string | null
  serviceOrPlatform?: string | null
  projectName?: string | null
  startUrl?: string | null
}): string {
  const explicit = typeof args.name === "string" ? args.name.trim() : ""
  if (explicit) return explicit

  let platform =
    typeof args.serviceOrPlatform === "string" ? args.serviceOrPlatform.trim() : ""
  if (!platform) {
    const host = hostKeyFromUrl(args.startUrl)
    if (host) {
      const base = host.split(".")[0] ?? host
      platform = base.charAt(0).toUpperCase() + base.slice(1)
    }
  }
  const project = typeof args.projectName === "string" ? args.projectName.trim() : ""
  if (project && platform) return `${project} ${platform}`
  if (platform) return platform
  if (project) return `${project} website`
  return "Publishing destination"
}

export type DestinationDuplicateCandidate = {
  id: string
  name: string
  start_url: string
  project_id?: number | null
}

/**
 * Prefer an existing destination over creating a duplicate.
 * Match by same project (when known) + same host, or strong name overlap.
 */
export function findExistingDestinationCandidate(
  candidates: DestinationDuplicateCandidate[],
  args: {
    destinationId?: string | null
    projectId?: number | null
    startUrl?: string | null
    name?: string | null
    serviceOrPlatform?: string | null
  },
): DestinationDuplicateCandidate | null {
  if (args.destinationId) {
    const byId = candidates.find((row) => row.id === args.destinationId)
    if (byId) return byId
  }

  const host = hostKeyFromUrl(args.startUrl)
  const nameNeedle = [args.name, args.serviceOrPlatform]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean)

  const scored = candidates
    .map((row) => {
      let score = 0
      const rowHost = hostKeyFromUrl(row.start_url)
      if (host && rowHost && host === rowHost) score += 5
      if (
        args.projectId != null &&
        row.project_id != null &&
        Number(row.project_id) === Number(args.projectId)
      ) {
        score += 2
      }
      const rowName = String(row.name ?? "").toLowerCase()
      for (const needle of nameNeedle) {
        if (needle && rowName.includes(needle)) score += 2
      }
      return { row, score }
    })
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.row ?? null
}

export function buildProvisionalGuidance(args: {
  purpose?: string | null
  contentType?: string | null
  serviceOrPlatform?: string | null
  projectName?: string | null
  guidance?: string | null
}): string | null {
  if (typeof args.guidance === "string" && args.guidance.trim()) {
    return args.guidance.trim()
  }
  const bits: string[] = []
  const project = typeof args.projectName === "string" ? args.projectName.trim() : ""
  const platform =
    typeof args.serviceOrPlatform === "string" ? args.serviceOrPlatform.trim() : ""
  const purpose = typeof args.purpose === "string" ? args.purpose.trim() : ""
  const contentType =
    typeof args.contentType === "string" ? args.contentType.trim() : ""
  if (project) bits.push(`Prefer the ${project} site/account when multiple sites are available.`)
  if (platform) bits.push(`Platform: ${platform}.`)
  if (contentType) bits.push(`Primary content type: ${contentType}.`)
  if (purpose) bits.push(`Purpose: ${purpose}.`)
  return bits.length > 0 ? bits.join(" ") : null
}
