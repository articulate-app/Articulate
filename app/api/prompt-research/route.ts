import { NextRequest, NextResponse } from "next/server"
import { fetchGoogleAiOverview } from "../../lib/dataforseo-ai-overview"

type PromptResearchRequest = {
  prompt: string
  languageCode?: string
  /** Google Ads / DataForSEO location id (e.g. 2840 US, 2620 PT). */
  regionId?: string
  /** brands = fast path; related = related prompts; ai-overview = Google AI Overview; full = brands+related. */
  mode?: "brands" | "related" | "ai-overview" | "full"
}

type RankedEntity = {
  position: number
  name: string
  url: string | null
  snippet: string | null
}

type PromptResearchResponse = {
  elapsedMs: number
  prompt: string
  languageCode: string
  answerSummary: string
  results: RankedEntity[]
  relatedPrompts: string[]
  fullResponse?: string
  present?: boolean
  checkUrl?: string | null
  metadata?: Record<string, unknown>
}

const cache = new Map<string, { data: PromptResearchResponse; timestamp: number }>()
const CACHE_DURATION = 5 * 60 * 1000

const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_REQUESTS = 8
const RATE_LIMIT_WINDOW = 8 * 1000

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const rateLimit = rateLimitMap.get(ip)
  if (!rateLimit || now > rateLimit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return false
  }
  if (rateLimit.count >= RATE_LIMIT_REQUESTS) return true
  rateLimit.count++
  return false
}

async function callPromptResearchEdge(args: {
  prompt: string
  languageCode?: string
  brandsOnly?: boolean
  relatedOnly?: boolean
  authHeader: string | null
}): Promise<PromptResearchResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase is not configured for prompt research")
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/prompt-research`, {
    method: "POST",
    headers: {
      Authorization: args.authHeader?.startsWith("Bearer ")
        ? args.authHeader
        : `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: args.prompt,
      languageCode: args.languageCode,
      brandsOnly: args.brandsOnly === true,
      relatedOnly: args.relatedOnly === true,
    }),
    signal: AbortSignal.timeout(50000),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      payload?.error?.message || `Prompt research failed (${response.status})`
    const err = new Error(message) as Error & { status?: number; details?: unknown }
    err.status = response.status
    err.details = payload?.error?.details
    throw err
  }

  return payload as PromptResearchResponse
}

async function callAiOverview(args: {
  prompt: string
  languageCode: string
  regionId?: string | null
  authHeader: string | null
}): Promise<PromptResearchResponse> {
  // Prefer direct DataForSEO from Next when secrets exist; else Supabase edge.
  const hasLocalSecrets = Boolean(
    process.env.DATAFORSEO_ID?.trim() && process.env.DATAFORSEO_SECRET?.trim(),
  )

  if (hasLocalSecrets) {
    const overview = await fetchGoogleAiOverview({
      keyword: args.prompt,
      languageCode: args.languageCode,
      regionId: args.regionId,
    })
    return {
      elapsedMs: overview.elapsedMs,
      prompt: args.prompt,
      languageCode: args.languageCode,
      answerSummary: overview.answerSummary,
      results: overview.results,
      relatedPrompts: [],
      present: overview.present,
      checkUrl: overview.checkUrl,
      fullResponse: overview.markdown ?? undefined,
      metadata: overview.metadata,
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !serviceKey) {
    throw new Error("AI Overview is not configured (DataForSEO / Supabase)")
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-overview`, {
    method: "POST",
    headers: {
      Authorization: args.authHeader?.startsWith("Bearer ")
        ? args.authHeader
        : `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: args.prompt,
      languageCode: args.languageCode,
      regionId: args.regionId || undefined,
    }),
    signal: AbortSignal.timeout(50000),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      payload?.error?.message || `AI Overview failed (${response.status})`
    const err = new Error(message) as Error & { status?: number; details?: unknown }
    err.status = response.status
    err.details = payload?.error?.details
    throw err
  }

  return payload as PromptResearchResponse
}

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request)
    if (isRateLimited(clientIP)) {
      return NextResponse.json(
        {
          error: {
            code: 429,
            message: "Rate limit exceeded. Please try again in a few seconds.",
          },
        },
        { status: 429 },
      )
    }

    const body = (await request.json()) as PromptResearchRequest
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
    if (!prompt) {
      return NextResponse.json(
        { error: { code: 400, message: "Prompt is required" } },
        { status: 400 },
      )
    }

    const languageCode =
      typeof body.languageCode === "string" && body.languageCode.trim()
        ? body.languageCode.trim()
        : "pt"
    const regionId =
      typeof body.regionId === "string" && body.regionId.trim()
        ? body.regionId.trim()
        : ""
    const mode =
      body.mode === "brands" ||
      body.mode === "related" ||
      body.mode === "ai-overview" ||
      body.mode === "full"
        ? body.mode
        : "full"

    const cacheKey = `v5-${mode}-${prompt.toLowerCase()}-${languageCode}-${regionId || "any"}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    if (mode === "ai-overview") {
      const data = await callAiOverview({
        prompt,
        languageCode,
        regionId: regionId || null,
        authHeader: request.headers.get("authorization"),
      })
      cache.set(cacheKey, { data, timestamp: Date.now() })
      return NextResponse.json(data)
    }

    const brandsOnly = mode === "brands"
    const relatedOnly = mode === "related"

    const data = await callPromptResearchEdge({
      prompt,
      languageCode,
      brandsOnly,
      relatedOnly,
      authHeader: request.headers.get("authorization"),
    })

    cache.set(cacheKey, { data, timestamp: Date.now() })
    return NextResponse.json(data)
  } catch (error: any) {
    console.error("prompt-research API error:", error)
    if (error?.name === "AbortError") {
      return NextResponse.json(
        { error: { code: 408, message: "Request timeout" } },
        { status: 408 },
      )
    }
    return NextResponse.json(
      {
        error: {
          code: error?.status || 500,
          message: error?.message || "Internal server error",
          details: error?.details,
        },
      },
      { status: error?.status || 500 },
    )
  }
}
