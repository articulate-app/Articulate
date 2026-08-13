/**
 * Minimal Firecrawl v2 client for map + scrape.
 */

export type FirecrawlMapResult = {
  links: string[]
  raw: unknown
}

export type FirecrawlScrapeResult = {
  url: string
  title: string | null
  description: string | null
  markdown: string | null
  html: string | null
  language: string | null
  publishedAt: string | null
  modifiedAt: string | null
  author: string | null
  imageUrl: string | null
  schemaTypes: string[]
  ogType: string | null
  canonical: string | null
  links: string[]
  metadata: Record<string, unknown>
  raw: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function collectSchemaTypes(value: unknown, out: Set<string>) {
  if (!value) return
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, out)
    return
  }
  const record = asRecord(value)
  if (!record) return
  const type = record["@type"]
  if (typeof type === "string") out.add(type)
  if (Array.isArray(type)) {
    for (const item of type) if (typeof item === "string") out.add(item)
  }
  for (const nested of Object.values(record)) collectSchemaTypes(nested, out)
}

/** Pull datePublished / dateModified from JSON-LD graphs Firecrawl nests in metadata. */
function extractJsonLdDate(
  value: unknown,
  keys: string[],
): string | null {
  if (!value) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractJsonLdDate(item, keys)
      if (found) return found
    }
    return null
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    // Firecrawl sometimes returns JSON-LD as a raw string.
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return extractJsonLdDate(JSON.parse(trimmed), keys)
      } catch {
        return null
      }
    }
    return null
  }
  const record = asRecord(value)
  if (!record) return null
  for (const key of keys) {
    const direct = asString(record[key])
    if (direct) return direct
  }
  for (const nested of Object.values(record)) {
    const found = extractJsonLdDate(nested, keys)
    if (found) return found
  }
  return null
}

/** Fallback when Firecrawl metadata omits JSON-LD (common on Squarespace). */
function extractDateFromHtml(html: string | null, keys: string[]): string | null {
  if (!html) return null

  for (const key of keys) {
    const itemprop = html.match(
      new RegExp(
        `<meta[^>]+itemprop=["']${key}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
    )?.[1]
    if (itemprop) return itemprop

    const itempropAlt = html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']${key}["']`,
        "i",
      ),
    )?.[1]
    if (itempropAlt) return itempropAlt

    const property = html.match(
      new RegExp(
        `<meta[^>]+(?:property|name)=["'](?:article:)?${key.replace("date", "").replace("Published", "published_time").replace("Modified", "modified_time")}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
    )?.[1]
    if (property) return property
  }

  const scriptBlocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  for (const match of scriptBlocks) {
    const raw = match[1]?.trim()
    if (!raw) continue
    try {
      const found = extractJsonLdDate(JSON.parse(raw), keys)
      if (found) return found
    } catch {
      // ignore invalid JSON-LD chunks
    }
  }

  return null
}

export class FirecrawlClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.firecrawl.dev",
  ) {}

  private endpoint(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`
  }

  async mapUrl(args: {
    url: string
    limit?: number
    includeSubdomains?: boolean
  }): Promise<FirecrawlMapResult> {
    const response = await fetch(this.endpoint("/v2/map"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: args.url,
        limit: args.limit ?? 200,
        includeSubdomains: args.includeSubdomains ?? false,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Firecrawl map failed (${response.status}): ${text.slice(0, 400)}`)
    }

    const json = await response.json()
    const record = asRecord(json)
    const data = asRecord(record?.data) ?? record
    const linksRaw = data?.links ?? record?.links
    const links: string[] = []
    if (Array.isArray(linksRaw)) {
      for (const item of linksRaw) {
        if (typeof item === "string") links.push(item)
        else {
          const link = asRecord(item)
          const url = asString(link?.url) ?? asString(link?.href)
          if (url) links.push(url)
        }
      }
    }
    return { links, raw: json }
  }

  async scrapeUrl(args: {
    url: string
    formats?: string[]
  }): Promise<FirecrawlScrapeResult> {
    const response = await fetch(this.endpoint("/v2/scrape"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: args.url,
        formats: args.formats ?? ["markdown", "html", "links"],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Firecrawl scrape failed (${response.status}): ${text.slice(0, 400)}`)
    }

    const json = await response.json()
    const record = asRecord(json)
    const data = asRecord(record?.data) ?? record ?? {}
    const metadata = asRecord(data.metadata) ?? {}
    const schemaTypes = new Set<string>()
    collectSchemaTypes(metadata.jsonld ?? metadata["json-ld"] ?? metadata.schema, schemaTypes)

    const links: string[] = []
    if (Array.isArray(data.links)) {
      for (const item of data.links) {
        if (typeof item === "string") links.push(item)
      }
    }

    return {
      url: asString(data.url) ?? args.url,
      title: asString(metadata.title) ?? asString(data.title),
      description:
        asString(metadata.description) ??
        asString(metadata.ogDescription) ??
        asString(data.description),
      markdown: asString(data.markdown),
      html: asString(data.html),
      language:
        asString(metadata.language) ??
        asString(metadata.ogLocale) ??
        asString(metadata.lang),
      publishedAt:
        asString(metadata.publishedTime) ??
        asString(metadata.articlePublishedTime) ??
        asString(metadata["article:published_time"]) ??
        asString(metadata.datePublished) ??
        asString(metadata.published_at) ??
        extractJsonLdDate(metadata.jsonld ?? metadata["json-ld"] ?? metadata.schema, [
          "datePublished",
          "dateCreated",
          "uploadDate",
        ]) ??
        extractDateFromHtml(asString(data.html), [
          "datePublished",
          "dateCreated",
          "uploadDate",
        ]),
      modifiedAt:
        asString(metadata.modifiedTime) ??
        asString(metadata.articleModifiedTime) ??
        asString(metadata["article:modified_time"]) ??
        asString(metadata.dateModified) ??
        asString(metadata.modified_at) ??
        extractJsonLdDate(metadata.jsonld ?? metadata["json-ld"] ?? metadata.schema, [
          "dateModified",
        ]) ??
        extractDateFromHtml(asString(data.html), ["dateModified"]),
      author: asString(metadata.author) ?? asString(metadata["article:author"]),
      imageUrl:
        asString(metadata.ogImage) ??
        asString(metadata["og:image"]) ??
        asString(metadata.image) ??
        asString(metadata.twitterImage),
      schemaTypes: [...schemaTypes],
      ogType: asString(metadata.ogType) ?? asString(metadata["og:type"]),
      canonical: asString(metadata.canonical) ?? asString(metadata.url),
      links,
      metadata,
      raw: json,
    }
  }
}

export async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/plain, text/xml, application/xml, */*" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

export function extractSitemapLocs(xml: string): string[] {
  const locs: string[] = []
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) != null) {
    const value = match[1]?.trim()
    if (value) locs.push(value)
  }
  return locs
}

export function extractFeedLinks(xml: string): string[] {
  const links: string[] = []
  const itemLink = /<item[\s\S]*?<link>\s*([^<]+)\s*<\/link>/gi
  const entryLink = /<entry[\s\S]*?<link[^>]*href=["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = itemLink.exec(xml)) != null) {
    if (match[1]) links.push(match[1].trim())
  }
  while ((match = entryLink.exec(xml)) != null) {
    if (match[1]) links.push(match[1].trim())
  }
  return links
}

export function discoverRobotsSitemapUrls(robotsTxt: string, origin: string): string[] {
  const urls: string[] = []
  for (const line of robotsTxt.split("\n")) {
    const trimmed = line.trim()
    if (/^sitemap:\s*/i.test(trimmed)) {
      const value = trimmed.replace(/^sitemap:\s*/i, "").trim()
      if (value) {
        try {
          urls.push(new URL(value, origin).toString())
        } catch {
          // ignore
        }
      }
    }
  }
  return urls
}
