import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  groupUrlsByPrefix,
  normalizeHttpUrl,
  scoreEditorialSourceCandidate,
  type ContentEntityType,
} from "../_shared/competitive-content/helpers.ts"
import {
  FirecrawlClient,
  discoverRobotsSitemapUrls,
  extractFeedLinks,
  extractSitemapLocs,
  fetchText,
} from "../_shared/firecrawl/client.ts"

/**
 * Secrets:
 * - FIRECRAWL_API_KEY
 * - COMPETITIVE_CONTENT_CRON_SECRET (optional for automatic)
 * - OPENAI_API_KEY (optional; used only for ambiguous candidates)
 * - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * POST body:
 * {
 *   project_id?: number
 *   website_id?: number
 *   trigger: "manual" | "automatic"
 * }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? ""
const FIRECRAWL_BASE_URL = (Deno.env.get("FIRECRAWL_BASE_URL") || "https://api.firecrawl.dev")
  .replace(/\/$/, "")
const COMPETITIVE_CONTENT_CRON_SECRET =
  Deno.env.get("COMPETITIVE_CONTENT_CRON_SECRET") ?? ""
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? ""

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-competitive-content-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type ServiceClient = ReturnType<typeof createClient>
type SyncTrigger = "manual" | "automatic"

type WebsiteRow = {
  id: number
  project_id: number
  entity_type: ContentEntityType
  competitor_id: number | null
  root_url: string
  normalized_domain: string
  include_subdomains: boolean
  is_active: boolean
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

async function assertManualAccess(args: {
  authorization: string | null
  projectIds: number[]
}): Promise<Response | null> {
  if (!args.authorization) return json({ ok: false, error: "missing authorization" }, 401)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: args.authorization } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ ok: false, error: "unauthorized" }, 401)

  for (const projectId of args.projectIds) {
    const { data, error } = await userClient.rpc("ai_assert_can_edit_project_v1", {
      p_project_id: projectId,
    })
    if (error || data === false) {
      return json({ ok: false, error: `forbidden for project ${projectId}` }, 403)
    }
  }
  return null
}

function isCronAuthorized(req: Request): boolean {
  const headerSecret = req.headers.get("x-competitive-content-sync-secret") ?? ""
  const auth = req.headers.get("authorization") ?? ""
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : ""
  if (COMPETITIVE_CONTENT_CRON_SECRET) {
    if (headerSecret === COMPETITIVE_CONTENT_CRON_SECRET) return true
    if (bearer === COMPETITIVE_CONTENT_CRON_SECRET) return true
  }
  if (bearer && bearer === SUPABASE_SERVICE_ROLE_KEY) return true
  return false
}

async function classifyAmbiguousWithAi(args: {
  website: string
  candidateSource: string
  samplePages: Array<Record<string, unknown>>
}): Promise<{
  is_editorial_source: boolean
  source_type: string
  language_code: string | null
  include_patterns: string[]
  exclude_patterns: string[]
  confidence: number
  reason_codes: string[]
} | null> {
  if (!OPENAI_API_KEY) return null
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Classify whether a URL path is an editorial content source (blog/news/insights). Return strict JSON only.",
          },
          {
            role: "user",
            content: JSON.stringify({
              website: args.website,
              candidate_source: args.candidateSource,
              sample_pages: args.samplePages,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) return null
    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== "string") return null
    const parsed = JSON.parse(content)
    return {
      is_editorial_source: Boolean(parsed.is_editorial_source),
      source_type: typeof parsed.source_type === "string" ? parsed.source_type : "other",
      language_code: typeof parsed.language_code === "string" ? parsed.language_code : null,
      include_patterns: Array.isArray(parsed.include_patterns)
        ? parsed.include_patterns.filter((x: unknown) => typeof x === "string")
        : [],
      exclude_patterns: Array.isArray(parsed.exclude_patterns)
        ? parsed.exclude_patterns.filter((x: unknown) => typeof x === "string")
        : [],
      confidence:
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? parsed.confidence
          : 0.5,
      reason_codes: Array.isArray(parsed.reason_codes)
        ? parsed.reason_codes.filter((x: unknown) => typeof x === "string")
        : [],
    }
  } catch {
    return null
  }
}

async function discoverForWebsite(args: {
  service: ServiceClient
  firecrawl: FirecrawlClient
  website: WebsiteRow
}): Promise<Record<string, unknown>> {
  const { service, firecrawl, website } = args
  const rootUrl = normalizeHttpUrl(website.root_url) ?? website.root_url
  const origin = new URL(rootUrl).origin

  const runInsert = await service
    .from("project_competitive_content_sync_runs")
    .insert({
      project_id: website.project_id,
      entity_type: website.entity_type,
      competitor_id: website.competitor_id,
      website_id: website.id,
      run_type: "source_discovery",
      trigger_type: "manual",
      provider: "firecrawl",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  const runId = runInsert.data?.id as string | undefined
  let discovered = 0
  let created = 0
  let updated = 0
  let skipped = 0

  try {
    const robotsTxt = await fetchText(`${origin}/robots.txt`)
    const sitemapUrls = robotsTxt
      ? discoverRobotsSitemapUrls(robotsTxt, origin)
      : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]

    const sitemapArticleUrls: string[] = []
    let hasEditorialSitemap = false
    for (const sitemapUrl of sitemapUrls.slice(0, 5)) {
      const xml = await fetchText(sitemapUrl)
      if (!xml) continue
      const locs = extractSitemapLocs(xml)
      const nestedSitemaps = locs.filter((u) => /sitemap/i.test(u))
      const pages = locs.filter((u) => !/sitemap/i.test(u))
      for (const nested of nestedSitemaps.slice(0, 8)) {
        if (/blog|news|post|article|insight|content/i.test(nested)) {
          hasEditorialSitemap = true
          const nestedXml = await fetchText(nested)
          if (nestedXml) sitemapArticleUrls.push(...extractSitemapLocs(nestedXml).slice(0, 200))
        }
      }
      sitemapArticleUrls.push(...pages.slice(0, 200))
    }

    const commonFeeds = [
      `${origin}/feed`,
      `${origin}/rss`,
      `${origin}/feed.xml`,
      `${origin}/rss.xml`,
      `${origin}/atom.xml`,
      `${origin}/blog/feed`,
      `${origin}/news/feed`,
    ]
    const feedArticleUrls: string[] = []
    let feedUrl: string | null = null
    for (const candidate of commonFeeds) {
      const xml = await fetchText(candidate)
      if (!xml || (!xml.includes("<rss") && !xml.includes("<feed"))) continue
      const links = extractFeedLinks(xml)
      if (links.length > 0) {
        feedUrl = candidate
        feedArticleUrls.push(...links)
        break
      }
    }

    let mappedLinks: string[] = []
    try {
      const mapped = await firecrawl.mapUrl({
        url: rootUrl,
        limit: 250,
        includeSubdomains: website.include_subdomains,
      })
      mappedLinks = mapped.links
    } catch (error) {
      console.warn("firecrawl map failed", website.id, error)
    }

    const allUrls = [...new Set([...sitemapArticleUrls, ...feedArticleUrls, ...mappedLinks])]
    const groups = groupUrlsByPrefix(allUrls, origin)

    // Also seed groups from feed/sitemap editorial prefixes
    if (feedUrl) {
      try {
        const feedPath = new URL(feedUrl).pathname.replace(/\/feed\/?$/, "/")
        const prefix = `${origin}${feedPath.startsWith("/") ? feedPath : `/${feedPath}`}`
        if (!groups.has(prefix)) groups.set(prefix, feedArticleUrls.slice(0, 20))
      } catch {
        // ignore
      }
    }

    const existing = await service
      .from("project_competitive_content_sources")
      .select("id, normalized_source_url, status, is_manual_override")
      .eq("website_id", website.id)

    const existingByUrl = new Map<string, {
      id: number
      status: string
      is_manual_override: boolean
    }>()
    for (const row of existing.data ?? []) {
      existingByUrl.set(String(row.normalized_source_url), {
        id: Number(row.id),
        status: String(row.status),
        is_manual_override: Boolean(row.is_manual_override),
      })
    }

    for (const [prefix, urls] of groups) {
      if (urls.length < 2) continue
      discovered += 1

      const sampleUrls = urls.slice(0, 4)
      const samplePages: Array<{
        url: string
        title: string | null
        schemaTypes: string[]
        publishedAt: string | null
        author: string | null
        ogType: string | null
        inSitemap: boolean
        hasFeed: boolean
      }> = []

      for (const sampleUrl of sampleUrls) {
        try {
          const scraped = await firecrawl.scrapeUrl({ url: sampleUrl, formats: ["markdown"] })
          samplePages.push({
            url: sampleUrl,
            title: scraped.title,
            schemaTypes: scraped.schemaTypes,
            publishedAt: scraped.publishedAt,
            author: scraped.author,
            ogType: scraped.ogType,
            inSitemap: sitemapArticleUrls.includes(sampleUrl),
            hasFeed: feedArticleUrls.includes(sampleUrl),
          })
        } catch {
          samplePages.push({
            url: sampleUrl,
            title: null,
            schemaTypes: [],
            publishedAt: null,
            author: null,
            ogType: null,
            inSitemap: sitemapArticleUrls.includes(sampleUrl),
            hasFeed: feedArticleUrls.includes(sampleUrl),
          })
        }
      }

      let scored = scoreEditorialSourceCandidate({
        sourceUrl: prefix,
        samplePages,
        hasFeed: Boolean(feedUrl) && urls.some((u) => feedArticleUrls.includes(u)),
        hasSitemap: hasEditorialSitemap || urls.some((u) => sitemapArticleUrls.includes(u)),
      })

      let includePatterns: string[] = []
      let excludePatterns: string[] = [
        "*/category/*",
        "*/tag/*",
        "*/author/*",
        "*/page/*",
      ]
      let languageCode: string | null = null
      let discoveryMethod: string = "combined"

      if (scored.needsAi) {
        const ai = await classifyAmbiguousWithAi({
          website: rootUrl,
          candidateSource: prefix,
          samplePages: samplePages.map((p) => ({
            url: p.url,
            title: p.title,
            schema_types: p.schemaTypes,
            published_at: p.publishedAt,
            url_pattern: `${new URL(prefix).pathname}*`,
          })),
        })
        if (ai) {
          discoveryMethod = "ai"
          scored = {
            ...scored,
            confidence: ai.confidence,
            sourceType: (ai.source_type as typeof scored.sourceType) || scored.sourceType,
            signals: [
              ...scored.signals,
              ...ai.reason_codes.map((code) => ({ code, weight: 0 })),
            ],
            needsAi: false,
          }
          includePatterns = ai.include_patterns
          excludePatterns = ai.exclude_patterns.length > 0 ? ai.exclude_patterns : excludePatterns
          languageCode = ai.language_code
          if (!ai.is_editorial_source && scored.confidence < 0.55) {
            skipped += 1
            continue
          }
        }
      }

      // Low confidence without supporting signals — skip auto-suggest
      if (scored.confidence < 0.35) {
        skipped += 1
        continue
      }

      const normalized = normalizeHttpUrl(prefix) ?? prefix
      const existingRow = existingByUrl.get(normalized)
      if (existingRow) {
        if (
          existingRow.is_manual_override ||
          existingRow.status === "ignored" ||
          existingRow.status === "confirmed"
        ) {
          skipped += 1
          continue
        }
        const { error } = await service
          .from("project_competitive_content_sources")
          .update({
            source_type: scored.sourceType,
            discovery_method: discoveryMethod,
            discovery_confidence: scored.confidence,
            discovery_signals: scored.signals,
            include_paths: includePatterns,
            exclude_paths: excludePatterns,
            language_code: languageCode,
            feed_url: feedUrl,
            last_discovered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingRow.id)
        if (!error) updated += 1
        else skipped += 1
        continue
      }

      const { error } = await service.from("project_competitive_content_sources").insert({
        project_id: website.project_id,
        website_id: website.id,
        entity_type: website.entity_type,
        competitor_id: website.competitor_id,
        source_url: normalized,
        normalized_source_url: normalized,
        source_type: scored.sourceType,
        language_code: languageCode,
        feed_url: feedUrl,
        include_paths: includePatterns,
        exclude_paths: excludePatterns,
        discovery_method: discoveryMethod,
        discovery_confidence: scored.confidence,
        discovery_signals: scored.signals,
        status: "suggested",
        is_manual_override: false,
        last_discovered_at: new Date().toISOString(),
      })
      if (!error) created += 1
      else skipped += 1
    }

    await service
      .from("project_competitive_websites")
      .update({
        last_discovered_at: new Date().toISOString(),
        last_sync_status: "succeeded",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", website.id)

    if (runId) {
      await service
        .from("project_competitive_content_sync_runs")
        .update({
          status: "succeeded",
          completed_at: new Date().toISOString(),
          discovered_count: discovered,
          created_count: created,
          updated_count: updated,
          skipped_count: skipped,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
    }

    return {
      website_id: website.id,
      status: "succeeded",
      discovered,
      created,
      updated,
      skipped,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await service
      .from("project_competitive_websites")
      .update({
        last_sync_status: "failed",
        last_sync_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", website.id)

    if (runId) {
      await service
        .from("project_competitive_content_sync_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message.slice(0, 1000),
          discovered_count: discovered,
          created_count: created,
          updated_count: updated,
          skipped_count: skipped,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
    }

    return {
      website_id: website.id,
      status: "failed",
      error: message,
      discovered,
      created,
      updated,
      skipped,
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405)

  try {
    const body = asRecord(await req.json().catch(() => ({}))) ?? {}
    const trigger: SyncTrigger = body.trigger === "automatic" ? "automatic" : "manual"
    const projectId = toPositiveInt(body.project_id)
    const websiteId = toPositiveInt(body.website_id)

    if (trigger === "automatic") {
      if (!isCronAuthorized(req)) return json({ ok: false, error: "unauthorized cron" }, 401)
    } else {
      if (!projectId) return json({ ok: false, error: "project_id required" }, 400)
      const denied = await assertManualAccess({
        authorization: req.headers.get("authorization"),
        projectIds: [projectId],
      })
      if (denied) return denied
    }

    if (!FIRECRAWL_API_KEY) {
      return json({ ok: false, error: "FIRECRAWL_API_KEY not configured" }, 500)
    }

    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const firecrawl = new FirecrawlClient(FIRECRAWL_API_KEY, FIRECRAWL_BASE_URL)

    let query = service
      .from("project_competitive_websites")
      .select(
        "id, project_id, entity_type, competitor_id, root_url, normalized_domain, include_subdomains, is_active",
      )
      .eq("is_active", true)

    if (projectId) query = query.eq("project_id", projectId)
    if (websiteId) query = query.eq("id", websiteId)

    const { data: websites, error } = await query.limit(50)
    if (error) return json({ ok: false, error: error.message }, 500)

    const results = []
    for (const website of (websites ?? []) as WebsiteRow[]) {
      results.push(await discoverForWebsite({ service, firecrawl, website }))
    }

    const failed = results.filter((r) => r.status === "failed").length
    return json({
      ok: failed === 0,
      status: failed === 0 ? "succeeded" : failed === results.length ? "failed" : "partial",
      websites_total: results.length,
      websites_failed: failed,
      results,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ ok: false, error: message }, 500)
  }
})
