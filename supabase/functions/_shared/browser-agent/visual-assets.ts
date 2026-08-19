/**
 * Visual search resolution: listing/search pages are discovery only.
 * Final results must be specific individual images or videos.
 *
 * Hard rules:
 * - Never invent, infer, construct, or modify an asset URL or asset ID.
 * - verified: true is set only after a URL was extracted from a tool source.
 * - Domain-agnostic: no hostname allowlists or provider-specific branches.
 */

import {
  looksLikeCollectionOrSearchUrl,
  looksLikeDirectMediaFileUrl,
  looksLikeSpecificResourceUrl,
  recommendBrowserFallback,
} from "./url-verification.ts"

export type VisualAssetType = "image" | "video"

export type VerifiedVisualAsset = {
  type: VisualAssetType
  provider: string
  title?: string
  asset_url: string
  preview_url?: string
  source_url?: string
  asset_id?: string
  verified: true
}

export type VisualPageKind = "listing_or_search" | "specific_resource" | "other"

export type VisualFollowCandidate = {
  text: string
  href: string
  verified: true
}

export type VisualSearchResolution = {
  page_kind: VisualPageKind
  current_url_is_listing: boolean
  visual_assets: VerifiedVisualAsset[]
  follow_candidates: VisualFollowCandidate[]
  unresolved_reason: string | null
  browser_fallback_recommended: boolean
}

export type VisualPageInput = {
  url: string
  title?: string | null
  html?: string | null
  text?: string | null
  links?: Array<string | { href?: string | null; text?: string | null }> | null
  extracted?: VisualDomExtract | null
}

export type VisualDomExtract = {
  og_image?: string | null
  og_video?: string | null
  twitter_image?: string | null
  canonical?: string | null
  json_ld_ids?: string[] | null
  media_urls?: Array<{ url: string; type?: VisualAssetType | null }> | null
}

const IMAGE_EXT = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i
const VIDEO_EXT = /\.(?:m4v|mov|mp4|webm)(?:$|\?)/i
const VIDEO_PATH = /\/(video|videos|watch|clip|reel|footage)\b/i
const IMAGE_PATH = /\/(photo|photos|image|images|picture|pictures|media)\b/i
const ID_IN_VALUE = /(?:^|[-_~])(?:gm)?(?:\d{5,}|[a-f0-9]{8,}|[A-Za-z0-9_-]{8,})(?:[-_/]|$)/i

export function visualAssetTypeFromUrl(url: string): VisualAssetType | null {
  try {
    const parsed = new URL(url)
    if (VIDEO_EXT.test(parsed.pathname) || VIDEO_PATH.test(parsed.pathname)) return "video"
    if (IMAGE_EXT.test(parsed.pathname) || IMAGE_PATH.test(parsed.pathname)) return "image"
  } catch {
    if (VIDEO_EXT.test(url) || VIDEO_PATH.test(url)) return "video"
    if (IMAGE_EXT.test(url) || IMAGE_PATH.test(url)) return "image"
  }
  return null
}

export function providerFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "")
  } catch {
    return ""
  }
}

export function httpUrlFromUnknown(value: unknown, baseUrl?: string | null): string | null {
  const raw = String(value ?? "").trim()
  if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:")) return null
  try {
    const parsed = baseUrl ? new URL(raw, baseUrl) : new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.href
  } catch {
    return null
  }
}

export function extractAssetIdFromSource(value: unknown): string | undefined {
  const raw = String(value ?? "").trim()
  if (!raw || raw.length > 120) return undefined
  if (/^https?:\/\//i.test(raw)) {
    try {
      const path = new URL(raw).pathname
      const match = path.match(/((?:\d{5,}|[a-f0-9]{8,}))/i)
      return match?.[1]
    } catch {
      return undefined
    }
  }
  if (ID_IN_VALUE.test(raw) && !/\s/.test(raw)) return raw
  return undefined
}

const SEARCH_PARAM_KEYS = new Set(["q", "k", "query", "phrase", "search", "s", "keyword", "keywords", "search_query"])

export function looksLikeSpecificVisualUrl(url: string): boolean {
  if (looksLikeDirectMediaFileUrl(url)) return true
  if (looksLikeCollectionOrSearchUrl(url)) return false
  if (hasNonSearchIdQuery(url)) return true
  return looksLikeSpecificResourceUrl(url)
}

function hasNonSearchIdQuery(url: string): boolean {
  try {
    const parsed = new URL(url)
    for (const [key, value] of parsed.searchParams.entries()) {
      if (SEARCH_PARAM_KEYS.has(key.toLowerCase())) continue
      if (ID_IN_VALUE.test(value)) return true
    }
    return false
  } catch {
    return false
  }
}

export function classifyVisualPageKind(url: string): VisualPageKind {
  if (looksLikeCollectionOrSearchUrl(url) && !looksLikeDirectMediaFileUrl(url)) {
    return "listing_or_search"
  }
  if (looksLikeSpecificVisualUrl(url)) return "specific_resource"
  return "other"
}

function uniqueHttpUrls(values: Array<string | null | undefined>, baseUrl?: string | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const href = httpUrlFromUnknown(value, baseUrl)
    if (!href || seen.has(href)) continue
    seen.add(href)
    out.push(href)
  }
  return out
}

function metaContent(html: string, names: string[]): string[] {
  const found: string[] = []
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const name = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim().toLowerCase()
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim()
    if (!name || !content) continue
    if (names.includes(name)) found.push(content)
  }
  return found
}

function canonicalFromHtml(html: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim().toLowerCase()
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.trim()
    if (rel === "canonical" && href) return href
  }
  return null
}

function jsonLdValues(html: string): { urls: string[]; ids: string[] } {
  const urls: string[] = []
  const ids: string[] = []
  const blocks = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of blocks) {
    try {
      collectJsonLd(JSON.parse(block[1] ?? ""), urls, ids)
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return { urls, ids }
}

function collectJsonLd(value: unknown, urls: string[], ids: string[], depth = 0): void {
  if (!value || depth > 6) return
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLd(item, urls, ids, depth + 1)
    return
  }
  if (typeof value !== "object") return
  const record = value as Record<string, unknown>
  for (const key of ["contentUrl", "embedUrl", "thumbnailUrl", "image", "url"]) {
    const item = record[key]
    if (typeof item === "string") urls.push(item)
    else if (item && typeof item === "object") collectJsonLd(item, urls, ids, depth + 1)
  }
  for (const key of ["identifier", "id", "@id"]) {
    if (typeof record[key] === "string") ids.push(String(record[key]))
  }
  if (record["@graph"]) collectJsonLd(record["@graph"], urls, ids, depth + 1)
}

export function extractVisualSignalsFromHtml(html: string, baseUrl: string): VisualDomExtract {
  const ogImages = metaContent(html, ["og:image", "og:image:url", "og:image:secure_url"])
  const ogVideos = metaContent(html, ["og:video", "og:video:url", "og:video:secure_url"])
  const twitterImages = metaContent(html, ["twitter:image", "twitter:image:src"])
  const { urls: jsonLdUrls, ids } = jsonLdValues(html)
  const media: Array<{ url: string; type?: VisualAssetType | null }> = []
  for (const href of uniqueHttpUrls([...ogVideos, ...jsonLdUrls], baseUrl)) {
    media.push({ url: href, type: visualAssetTypeFromUrl(href) ?? "video" })
  }
  for (const href of uniqueHttpUrls([...ogImages, ...twitterImages], baseUrl)) {
    media.push({ url: href, type: visualAssetTypeFromUrl(href) ?? "image" })
  }
  return {
    og_image: uniqueHttpUrls(ogImages, baseUrl)[0] ?? null,
    og_video: uniqueHttpUrls(ogVideos, baseUrl)[0] ?? null,
    twitter_image: uniqueHttpUrls(twitterImages, baseUrl)[0] ?? null,
    canonical: httpUrlFromUnknown(canonicalFromHtml(html), baseUrl),
    json_ld_ids: ids.filter((id) => !/^https?:\/\//i.test(id)).slice(0, 6),
    media_urls: media.slice(0, 12),
  }
}

function normalizeLinks(
  links: VisualPageInput["links"],
): Array<{ text: string; href: string }> {
  const out: Array<{ text: string; href: string }> = []
  const seen = new Set<string>()
  for (const item of links ?? []) {
    const href = typeof item === "string" ? item.trim() : String(item?.href ?? "").trim()
    const text = typeof item === "string" ? "" : String(item?.text ?? "").trim()
    const absolute = httpUrlFromUnknown(href)
    if (!absolute || seen.has(absolute)) continue
    seen.add(absolute)
    out.push({ text, href: absolute })
  }
  return out
}

function inferType(url: string, extract: VisualDomExtract | null): VisualAssetType {
  if (extract?.og_video) return "video"
  const fromUrl = visualAssetTypeFromUrl(url)
  if (fromUrl) return fromUrl
  const mediaHint = extract?.media_urls?.find((item) => item.type)
  if (mediaHint?.type) return mediaHint.type
  return "image"
}

function buildVerifiedAsset(input: {
  url: string
  title?: string | null
  extract?: VisualDomExtract | null
  pageUrl?: string | null
}): VerifiedVisualAsset | null {
  const assetUrl = httpUrlFromUnknown(input.url)
  if (!assetUrl || !looksLikeSpecificVisualUrl(assetUrl)) return null
  const extract = input.extract ?? null
  const preview = httpUrlFromUnknown(extract?.og_image ?? extract?.twitter_image ?? extract?.media_urls?.[0]?.url)
  const source = httpUrlFromUnknown(extract?.canonical ?? input.pageUrl ?? assetUrl)
  const assetId =
    extract?.json_ld_ids?.find((id) => Boolean(extractAssetIdFromSource(id)))
    ?? extractAssetIdFromSource(assetUrl)
  const asset: VerifiedVisualAsset = {
    type: inferType(assetUrl, extract),
    provider: providerFromUrl(assetUrl),
    asset_url: assetUrl,
    verified: true,
  }
  const title = String(input.title ?? "").trim()
  if (title) asset.title = title
  if (preview && preview !== assetUrl) asset.preview_url = preview
  if (source) asset.source_url = source
  if (assetId) asset.asset_id = assetId
  return asset
}

export function resolveVisualSearchPage(input: VisualPageInput): VisualSearchResolution {
  const pageUrl = httpUrlFromUnknown(input.url) ?? String(input.url ?? "").trim()
  const pageKind = classifyVisualPageKind(pageUrl)
  const extract = input.extracted
    ?? (input.html ? extractVisualSignalsFromHtml(input.html, pageUrl) : null)
  const links = normalizeLinks(input.links)
  const followCandidates: VisualFollowCandidate[] = []
  const seen = new Set<string>()
  for (const link of links) {
    if (!looksLikeSpecificVisualUrl(link.href) || seen.has(link.href)) continue
    seen.add(link.href)
    followCandidates.push({ text: link.text, href: link.href, verified: true })
  }

  const browserFallbackRecommended = recommendBrowserFallback({
    url: pageUrl,
    text: input.text,
    links: links.map((item) => item.href),
  }) || (pageKind === "listing_or_search" && followCandidates.length === 0)

  if (pageKind === "listing_or_search") {
    return {
      page_kind: pageKind,
      current_url_is_listing: true,
      visual_assets: [],
      follow_candidates: followCandidates.slice(0, 20),
      unresolved_reason: followCandidates.length
        ? "listing_or_search_page"
        : "specific_asset_not_resolved",
      browser_fallback_recommended: browserFallbackRecommended,
    }
  }

  const assets: VerifiedVisualAsset[] = []
  const pageAsset = buildVerifiedAsset({
    url: pageUrl,
    title: input.title,
    extract,
    pageUrl,
  })
  if (pageAsset) assets.push(pageAsset)

  if (looksLikeDirectMediaFileUrl(pageUrl) && !pageAsset) {
    const direct = buildVerifiedAsset({ url: pageUrl, title: input.title, extract, pageUrl })
    if (direct) assets.push(direct)
  }

  return {
    page_kind: pageKind,
    current_url_is_listing: false,
    visual_assets: assets.slice(0, 8),
    follow_candidates: assets.length ? [] : followCandidates.slice(0, 20),
    unresolved_reason: assets.length ? null : "specific_asset_not_resolved",
    browser_fallback_recommended: assets.length ? false : browserFallbackRecommended,
  }
}

export function annotateSearchResultsForVisualDiscovery<T extends { link?: string | null }>(
  results: T[],
): Array<T & { is_listing_or_search: boolean; is_specific_visual: boolean }> {
  return results.map((row) => {
    const link = String(row.link ?? "").trim()
    return {
      ...row,
      is_listing_or_search: looksLikeCollectionOrSearchUrl(link) && !looksLikeDirectMediaFileUrl(link),
      is_specific_visual: looksLikeSpecificVisualUrl(link),
    }
  })
}

export function visualIdentityFields(asset: VerifiedVisualAsset): Record<string, unknown> {
  return {
    type: asset.type,
    provider: asset.provider,
    title: asset.title ?? null,
    asset_url: asset.asset_url,
    preview_url: asset.preview_url ?? null,
    source_url: asset.source_url ?? null,
    asset_id: asset.asset_id ?? null,
    verified: true,
  }
}

/** Persist enough identity on an existing artifact asset to reuse the exact visual later. */
export function mergeVisualIdentityIntoAsset<T extends Record<string, unknown>>(
  asset: T,
  visual: VerifiedVisualAsset,
): T {
  const identity = visualIdentityFields(visual)
  const previousProvenance =
    asset.provenance && typeof asset.provenance === "object" && !Array.isArray(asset.provenance)
      ? { ...(asset.provenance as Record<string, unknown>) }
      : {}
  return {
    ...asset,
    ...identity,
    provenance: {
      ...previousProvenance,
      visual: identity,
    },
  }
}

export function normalizeArtifactAssetsWithVisualIdentity(assetData: unknown): Record<string, unknown> | null {
  if (!assetData || typeof assetData !== "object" || Array.isArray(assetData)) return null
  const record = assetData as Record<string, unknown>
  const assets = Array.isArray(record.assets) ? record.assets : []
  return {
    ...record,
    assets: assets.map((item) => {
      if (!item || typeof item !== "object") return item
      const row = item as Record<string, unknown>
      const assetUrl = httpUrlFromUnknown(row.asset_url ?? row.source_url)
      if (!assetUrl || !looksLikeSpecificVisualUrl(assetUrl)) return row
      const visual = buildVerifiedAsset({
        url: assetUrl,
        title: typeof row.title === "string" ? row.title : null,
        extract: {
          og_image: typeof row.preview_url === "string" ? row.preview_url : null,
          canonical: typeof row.source_url === "string" ? row.source_url : null,
          json_ld_ids: typeof row.asset_id === "string" ? [row.asset_id] : null,
        },
        pageUrl: typeof row.source_url === "string" ? row.source_url : assetUrl,
      })
      return visual ? mergeVisualIdentityIntoAsset(row, visual) : row
    }),
  }
}
