import { NextRequest, NextResponse } from "next/server"

type SuggestionKind = "keywords" | "prompts" | "competitors" | "all"

type Body = {
  kind?: SuggestionKind
  name: string
  description?: string | null
  goal?: string | null
  projectUrl?: string | null
  languageCode?: string | null
  languageId?: string | null
  regionId?: string | null
  existing?: string[]
  /** When true, enrich keyword suggestions with Google Ads volumes. */
  withVolumes?: boolean
}

type KeywordIdea = {
  keyword: string
  avgMonthlySearches?: number
}

async function callEdgeSuggestions(
  body: Body,
  authHeader: string | null,
): Promise<{
  keywords: string[]
  prompts: string[]
  competitors: Array<{ name: string; website: string; reason?: string | null }>
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase is not configured for project suggestions")
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/project-suggestions`, {
    method: "POST",
    headers: {
      Authorization: authHeader?.startsWith("Bearer ")
        ? authHeader
        : `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: body.kind ?? "all",
      name: body.name,
      description: body.description,
      goal: body.goal,
      projectUrl: body.projectUrl,
      languageCode: body.languageCode,
      existing: body.existing,
    }),
    signal: AbortSignal.timeout(45000),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `project-suggestions failed (${response.status})`,
    )
  }

  return {
    keywords: Array.isArray(payload.keywords) ? payload.keywords : [],
    prompts: Array.isArray(payload.prompts) ? payload.prompts : [],
    competitors: Array.isArray(payload.competitors) ? payload.competitors : [],
  }
}

async function enrichKeywordVolumes(args: {
  keywords: string[]
  regionId: string
  languageId: string
  origin: string
}): Promise<Array<{ text: string; meta: string | null; volume: number }>> {
  const volumeFormatter = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  })

  // Use the first 2–3 strongest AI seeds as keyword-ideas seeds, then merge.
  const seeds = args.keywords.slice(0, 3)
  const byKey = new Map<string, { text: string; volume: number }>()

  for (const seed of seeds) {
    const response = await fetch(`${args.origin}/api/keyword-ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: seed,
        regionId: args.regionId,
        languageId: args.languageId,
        pageSize: 12,
        phase: "primary",
      }),
      signal: AbortSignal.timeout(25000),
    })
    if (!response.ok) continue
    const data = (await response.json().catch(() => ({}))) as {
      results?: KeywordIdea[]
    }
    for (const row of data.results ?? []) {
      const text = String(row.keyword || "").trim()
      if (!text || text.length > 60) continue
      const volume = Number(row.avgMonthlySearches ?? 0)
      const key = text.toLowerCase()
      const prev = byKey.get(key)
      if (!prev || volume > prev.volume) {
        byKey.set(key, { text, volume: Number.isFinite(volume) ? volume : 0 })
      }
    }
  }

  // Prefer AI seeds that also appear in Ads results; keep volume-ranked rest.
  const preferred = args.keywords
    .map((text) => byKey.get(text.toLowerCase()))
    .filter((row): row is { text: string; volume: number } => Boolean(row))

  const rest = [...byKey.values()]
    .filter(
      (row) => !preferred.some((item) => item.text.toLowerCase() === row.text.toLowerCase()),
    )
    .sort((a, b) => b.volume - a.volume)

  const merged = [...preferred, ...rest]
    .filter((row) => row.volume > 0)
    .slice(0, 12)

  // If Ads returns nothing, fall back to AI phrases without volumes.
  const fallback =
    merged.length > 0
      ? merged
      : args.keywords.slice(0, 8).map((text) => ({ text, volume: 0 }))

  return fallback.map((row) => ({
    text: row.text,
    volume: row.volume,
    meta:
      row.volume > 0 ? `${volumeFormatter.format(row.volume)}/mo` : null,
  }))
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body
    const name = String(body.name || "").trim()
    if (!name) {
      return NextResponse.json(
        { error: { message: "Project name is required" } },
        { status: 400 },
      )
    }

    const authHeader = request.headers.get("authorization")
    const suggestions = await callEdgeSuggestions(body, authHeader)
    const kind = body.kind ?? "all"

    if (kind === "prompts") {
      return NextResponse.json({
        items: suggestions.prompts.map((text) => ({ text, meta: null })),
      })
    }

    if (kind === "competitors") {
      return NextResponse.json({ competitors: suggestions.competitors })
    }

    if (kind === "keywords" || kind === "all") {
      const withVolumes = body.withVolumes !== false
      const items = withVolumes
        ? await enrichKeywordVolumes({
            keywords: suggestions.keywords,
            regionId: body.regionId || "2620",
            languageId: body.languageId || "1014",
            origin: request.nextUrl.origin,
          })
        : suggestions.keywords.map((text) => ({ text, meta: null, volume: 0 }))

      if (kind === "keywords") {
        return NextResponse.json({ items })
      }

      return NextResponse.json({
        items,
        prompts: suggestions.prompts.map((text) => ({ text, meta: null })),
        competitors: suggestions.competitors,
      })
    }

    return NextResponse.json({
      items: [],
      prompts: suggestions.prompts.map((text) => ({ text, meta: null })),
      competitors: suggestions.competitors,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "Failed to load suggestions",
        },
      },
      { status: 500 },
    )
  }
}
