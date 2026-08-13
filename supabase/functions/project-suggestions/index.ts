import "jsr:@supabase/functions-js/edge-runtime.d.ts"

/**
 * Generate trackable keyword phrases, AI prompts, and competitor leads
 * from project context. Secrets: OPENAI_API_KEY
 */

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type SuggestionKind = "keywords" | "prompts" | "competitors" | "all"

type ProjectSuggestionsRequest = {
  kind?: SuggestionKind
  name: string
  description?: string | null
  goal?: string | null
  projectUrl?: string | null
  languageCode?: string | null
  existing?: string[]
}

type CompetitorSuggestion = {
  name: string
  website: string
  reason?: string | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error("Failed to parse model JSON")
  }
}

function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
    return host || null
  } catch {
    return null
  }
}

async function callOpenAiJson(systemPrompt: string, userPrompt: string): Promise<unknown> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI failed (${response.status})`)
  }
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Empty OpenAI response")
  }
  return extractJson(content)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (!OPENAI_API_KEY) {
      return json({ error: { message: "OPENAI_API_KEY not configured" } }, 500)
    }

    const body = (await req.json()) as ProjectSuggestionsRequest
    const name = String(body.name || "").trim()
    if (!name) {
      return json({ error: { message: "Project name is required" } }, 400)
    }

    const kind: SuggestionKind = body.kind || "all"
    const languageCode = (body.languageCode || "pt").trim() || "pt"
    const domain = domainFromUrl(body.projectUrl)
    const existing = Array.isArray(body.existing)
      ? body.existing.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : []

    const context = [
      `Brand/project name: ${name}`,
      domain ? `Website: ${domain}` : null,
      body.description ? `Description: ${String(body.description).slice(0, 400)}` : null,
      body.goal ? `Goal (context only, do NOT copy verbatim): ${String(body.goal).slice(0, 400)}` : null,
      `Language for suggestions: ${languageCode}`,
    ]
      .filter(Boolean)
      .join("\n")

    const wantKeywords = kind === "all" || kind === "keywords"
    const wantPrompts = kind === "all" || kind === "prompts"
    const wantCompetitors = kind === "all" || kind === "competitors"

    const systemPrompt = `You help a marketing platform suggest tracking targets.
Return JSON only.
Rules:
- Never paste the company mission/goal as a keyword or prompt.
- Keywords must be short search queries people type in Google (2–5 words), commercially relevant, with real search intent.
- Prompts must be questions end-users ask ChatGPT/Gemini about the category or buying alternatives — not internal strategy questions the brand asks itself.
- Competitors must be real peer brands with plausible homepage URLs.
- Prefer the project's market language (${languageCode}).`

    const userPrompt = `${context}

Generate:
${wantKeywords ? `- "keywords": 10 short Google-search phrases relevant to this brand's market (not the brand name alone unless it is a known searched brand term).` : ""}
${wantPrompts ? `- "prompts": 8 AI prompts users would ask when researching this category / vendors / alternatives.` : ""}
${wantCompetitors ? `- "competitors": 6 objects { "name", "website", "reason" } — direct peers to monitor on social + blog.` : ""}

JSON shape example:
{
  "keywords": ["string"],
  "prompts": ["string"],
  "competitors": [{"name":"string","website":"https://...","reason":"string"}]
}`

    const raw = (await callOpenAiJson(systemPrompt, userPrompt)) as Record<string, unknown>
    const keywords = wantKeywords
      ? (Array.isArray(raw.keywords) ? raw.keywords : [])
          .map((item) => String(item || "").trim())
          .filter((item) => item.length >= 3 && item.length <= 60)
          .filter((item) => !existing.includes(item.toLowerCase()))
          .slice(0, 12)
      : []

    const prompts = wantPrompts
      ? (Array.isArray(raw.prompts) ? raw.prompts : [])
          .map((item) => String(item || "").trim())
          .filter((item) => item.length >= 12 && item.length <= 160)
          .filter((item) => !existing.includes(item.toLowerCase()))
          .slice(0, 10)
      : []

    const competitors: CompetitorSuggestion[] = wantCompetitors
      ? (Array.isArray(raw.competitors) ? raw.competitors : [])
          .map((row) => {
            if (!row || typeof row !== "object") return null
            const record = row as Record<string, unknown>
            const competitorName = String(record.name || "").trim()
            let website = String(record.website || "").trim()
            if (!competitorName || !website) return null
            if (!/^https?:\/\//i.test(website)) website = `https://${website}`
            if (domain && website.toLowerCase().includes(domain.toLowerCase())) {
              return null
            }
            if (existing.includes(competitorName.toLowerCase())) return null
            return {
              name: competitorName,
              website,
              reason: record.reason ? String(record.reason) : null,
            } satisfies CompetitorSuggestion
          })
          .filter((row): row is CompetitorSuggestion => Boolean(row))
          .slice(0, 8)
      : []

    return json({
      keywords,
      prompts,
      competitors,
      meta: { name, domain, languageCode, kind },
    })
  } catch (error) {
    console.error("project-suggestions error", error)
    return json(
      {
        error: {
          message: error instanceof Error ? error.message : "Failed to generate suggestions",
        },
      },
      500,
    )
  }
})
