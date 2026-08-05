/**
 * Pure helpers that turn a website's outbound links into canonical social
 * profile URLs. Share widgets, post permalinks and platform utility pages are
 * rejected so only one profile per network survives.
 */

import {
  COMPETITOR_SOCIAL_NETWORKS,
  normalizeProfileUrl,
  type CompetitorSocialNetwork,
} from "./competitor-social"

export type SocialProfileCandidate = {
  network: CompetitorSocialNetwork
  profileUrl: string
}

const NETWORK_HOSTS: Record<CompetitorSocialNetwork, string[]> = {
  linkedin: ["linkedin.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
}

/** First path segments that never identify a profile page. */
const REJECTED_SEGMENTS: Record<CompetitorSocialNetwork, string[]> = {
  linkedin: ["sharing", "sharearticle", "shareoffsite", "feed", "posts", "pulse", "jobs"],
  instagram: ["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "share"],
  facebook: [
    "sharer.php",
    "sharer",
    "share.php",
    "share",
    "dialog",
    "plugins",
    "tr",
    "l.php",
    "login",
    "login.php",
    "watch",
    "events",
    "groups",
    "hashtag",
    "story.php",
    "permalink.php",
    // Numeric profiles cannot be normalized without the query string.
    "profile.php",
  ],
  youtube: ["watch", "embed", "shorts", "playlist", "results", "feed", "hashtag"],
  tiktok: ["video", "embed", "tag", "discover", "share", "music", "login"],
  x: [
    "intent",
    "share",
    "home",
    "hashtag",
    "search",
    "compose",
    "login",
    "i",
    "privacy",
    "tos",
    "explore",
  ],
}

function hostMatches(host: string, network: CompetitorSocialNetwork): boolean {
  return NETWORK_HOSTS[network].some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  )
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean)
}

/**
 * Reduce a deep social URL (post, tab, localized path) to the profile root.
 * Returns null when the URL cannot represent a profile.
 */
function toProfilePath(
  network: CompetitorSocialNetwork,
  url: URL,
): string | null {
  const segments = pathSegments(url.pathname)
  const first = segments[0]?.toLowerCase()
  if (!first) return null
  if (REJECTED_SEGMENTS[network].includes(first)) return null

  switch (network) {
    case "linkedin": {
      if (first !== "in" && first !== "company" && first !== "school") return null
      const handle = segments[1]
      if (!handle) return null
      // LinkedIn schools are stored as company pages by the sync adapters.
      const kind = first === "school" ? "company" : first
      return `/${kind}/${handle}`
    }
    case "youtube": {
      if (first.startsWith("@")) return `/${first}`
      if (first === "c" || first === "channel" || first === "user") {
        const handle = segments[1]
        return handle ? `/${first}/${handle}` : null
      }
      return null
    }
    case "tiktok": {
      if (!first.startsWith("@")) return null
      return `/${first}`
    }
    case "facebook": {
      if (first === "pages") {
        const handle = segments[2] ?? segments[1]
        return handle ? `/${handle}` : null
      }
      return `/${segments[0]}`
    }
    case "instagram":
    case "x": {
      return `/${segments[0]}`
    }
    default:
      return null
  }
}

/** Canonical profile candidate for a single URL, or null when unusable. */
export function socialProfileCandidateFromUrl(
  rawUrl: string,
): SocialProfileCandidate | null {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null

  const host = url.hostname.toLowerCase()
  const network = COMPETITOR_SOCIAL_NETWORKS.find((candidate) =>
    hostMatches(host, candidate),
  )
  if (!network) return null

  const profilePath = toProfilePath(network, url)
  if (!profilePath) return null

  const profileUrl = normalizeProfileUrl(network, `https://${host}${profilePath}`)
  if (!profileUrl) return null
  return { network, profileUrl }
}

/**
 * Best profile per network across every link found on a page.
 * Ties are broken by frequency first, then by the shortest URL, which favours
 * the canonical footer link over deep localized variants.
 */
export function extractSocialProfileCandidates(
  urls: Iterable<string>,
): SocialProfileCandidate[] {
  const counts = new Map<string, { candidate: SocialProfileCandidate; hits: number }>()

  for (const raw of urls) {
    const candidate = socialProfileCandidateFromUrl(raw)
    if (!candidate) continue
    const key = `${candidate.network}|${candidate.profileUrl}`
    const existing = counts.get(key)
    if (existing) existing.hits += 1
    else counts.set(key, { candidate, hits: 1 })
  }

  const bestByNetwork = new Map<
    CompetitorSocialNetwork,
    { candidate: SocialProfileCandidate; hits: number }
  >()
  for (const entry of counts.values()) {
    const current = bestByNetwork.get(entry.candidate.network)
    if (!current) {
      bestByNetwork.set(entry.candidate.network, entry)
      continue
    }
    const isBetter =
      entry.hits > current.hits ||
      (entry.hits === current.hits &&
        entry.candidate.profileUrl.length < current.candidate.profileUrl.length)
    if (isBetter) bestByNetwork.set(entry.candidate.network, entry)
  }

  return COMPETITOR_SOCIAL_NETWORKS.map((network) => bestByNetwork.get(network)?.candidate)
    .filter((candidate): candidate is SocialProfileCandidate => Boolean(candidate))
}

const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi
/** Also matches JSON-escaped URLs (`https:\/\/…`) found in JSON-LD blocks. */
const ABSOLUTE_URL_RE = /https?:(?:\\?\/){2}[^\s"'<>()]+/gi

/**
 * Collect absolute links from raw HTML: anchors plus URLs embedded in JSON-LD
 * `sameAs` blocks and inline scripts, where footers often keep social links.
 */
export function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const out = new Set<string>()

  const push = (value: string) => {
    const cleaned = value.replace(/\\\//g, "/").replace(/[.,;:'")\]]+$/, "")
    try {
      out.add(new URL(cleaned, baseUrl).toString())
    } catch {
      /* ignore unparseable link */
    }
  }

  let match: RegExpExecArray | null
  while ((match = HREF_RE.exec(html)) != null) {
    if (match[1]) push(match[1])
  }
  while ((match = ABSOLUTE_URL_RE.exec(html)) != null) {
    if (match[0]) push(match[0])
  }

  return [...out]
}

/** Convenience wrapper: raw HTML in, one profile per network out. */
export function discoverSocialProfilesFromHtml(
  html: string,
  baseUrl: string,
): SocialProfileCandidate[] {
  return extractSocialProfileCandidates(extractLinksFromHtml(html, baseUrl))
}
