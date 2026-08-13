// supabase/functions/sync-project-keyword-rankings/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const GOOGLE_CSE_API_KEY = Deno.env.get("GOOGLE_CSE_API_KEY")!
const GOOGLE_CSE_CX = Deno.env.get("GOOGLE_CSE_CX")!

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Map FE region IDs (geoLanguageMaps) -> CSE "gl" two-letter country codes
const REGION_TO_GL: Record<string, string> = {
  "": "",
  "2840": "us", // United States
  "2826": "gb", // United Kingdom
  "2620": "pt", // Portugal
  "2724": "es", // Spain
  "2076": "br", // Brazil
  "2276": "de", // Germany
  "2250": "fr", // France
  // Legacy mistaken Portugal id still present on some rows
  "2252": "fr",
}

const LANGUAGE_CODE_TO_LR: Record<string, string> = {
  EN: "lang_en",
  PT: "lang_pt",
  ES: "lang_es",
  FR: "lang_fr",
  DE: "lang_de",
}

const LANGUAGE_CODE_TO_HL: Record<string, string> = {
  EN: "en",
  PT: "pt",
  ES: "es",
  FR: "fr",
  DE: "de",
}

type ProjectKeyword = {
  id: number
  project_id: number
  keyword: string
  language_code: string | null
  region_code: string | null
}

type Project = {
  id: number
  project_url: string | null
}

function getBaseDomain(url: string): string | null {
  try {
    const u = new URL(url)
    let host = u.hostname.toLowerCase()
    if (host.startsWith("www.")) host = host.slice(4)
    return host
  } catch {
    return null
  }
}

function buildQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue
    usp.append(k, String(v))
  }
  return usp.toString()
}

type RankingResult = {
  rank: number | null
  foundUrl: string | null
  foundDomain: string | null
  topResults: { position: number; title: string; link: string }[]
}

async function fetchKeywordRanking(
  keyword: string,
  baseDomain: string,
  languageCode: string | null,
  regionCode: string | null,
): Promise<RankingResult> {
  let start = 1
  let rank: number | null = null
  let foundUrl: string | null = null
  let foundDomain: string | null = null
  const topResults: { position: number; title: string; link: string }[] = []

  const langKey = languageCode ? languageCode.toUpperCase() : null
  const lr = langKey ? LANGUAGE_CODE_TO_LR[langKey] ?? "" : ""
  const hl = langKey ? LANGUAGE_CODE_TO_HL[langKey] ?? "" : ""
  const gl = regionCode ? REGION_TO_GL[regionCode] ?? "" : ""

  while (start <= 100) {
    const params: Record<string, string | number | undefined> = {
      key: GOOGLE_CSE_API_KEY,
      cx: GOOGLE_CSE_CX,
      q: keyword,
      num: 10,
      start,
    }

    if (lr) params.lr = lr
    if (hl) params.hl = hl
    if (gl) params.gl = gl

    const url =
      `https://www.googleapis.com/customsearch/v1?${buildQueryString(params)}`

    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error("CSE error", resp.status, text)
      break
    }

    const json = await resp.json() as {
      items?: Array<{ link?: string; title?: string }>
    }

    if (!json.items || !Array.isArray(json.items) || json.items.length === 0) {
      break
    }

    for (let i = 0; i < json.items.length; i++) {
      const item = json.items[i]!
      const position = start + i
      const link: string = item.link ?? ""

      if (topResults.length < 10) {
        topResults.push({
          position,
          title: item.title ?? "",
          link,
        })
      }

      if (rank === null && link) {
        try {
          const itemUrl = new URL(link)
          let itemHost = itemUrl.hostname.toLowerCase()
          if (itemHost.startsWith("www.")) itemHost = itemHost.slice(4)

          if (itemHost === baseDomain) {
            rank = position
            foundUrl = link
            foundDomain = itemHost
          }
        } catch {
          // ignore bad URLs
        }
      }
    }

    if (rank !== null && topResults.length >= 10) {
      break
    }

    start += 10
  }

  return { rank, foundUrl, foundDomain, topResults }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const projectIdFilter = Number(body?.project_id)
    const keywordIdFilter = Number(body?.project_keyword_id)
    const today = new Date().toISOString().slice(0, 10)

    let pkQuery = supabaseAdmin
      .from("project_keywords")
      .select("id, project_id, keyword, language_code, region_code")
      .eq("is_active", true)

    if (Number.isFinite(projectIdFilter) && projectIdFilter > 0) {
      pkQuery = pkQuery.eq("project_id", projectIdFilter)
    }
    if (Number.isFinite(keywordIdFilter) && keywordIdFilter > 0) {
      pkQuery = pkQuery.eq("id", keywordIdFilter)
    }

    const { data: keywords, error: kwError } = await pkQuery
    if (kwError) {
      console.error("Keyword query error", kwError)
      return new Response(JSON.stringify({ error: kwError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (!keywords || keywords.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active project keywords to sync" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const projectIds = Array.from(
      new Set(keywords.map((k: ProjectKeyword) => k.project_id)),
    )

    const { data: projects, error: projError } = await supabaseAdmin
      .from("projects")
      .select("id, project_url")
      .in("id", projectIds)

    if (projError) {
      console.error("Project query error", projError)
      return new Response(JSON.stringify({ error: projError }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const projectUrlMap = new Map<number, string | null>()
    ;(projects ?? []).forEach((p: Project) => {
      projectUrlMap.set(p.id, p.project_url)
    })

    let processed = 0

    for (const kw of keywords as ProjectKeyword[]) {
      const projectUrl = projectUrlMap.get(kw.project_id) ?? null
      if (!projectUrl) {
        console.warn(
          `Project ${kw.project_id} has no project_url; skipping keyword ${kw.id}`,
        )
        continue
      }

      const baseDomain = getBaseDomain(projectUrl)
      if (!baseDomain) {
        console.warn(
          `Could not parse base domain from project_url=${projectUrl}; skipping keyword ${kw.id}`,
        )
        continue
      }

      try {
        const result = await fetchKeywordRanking(
          kw.keyword,
          baseDomain,
          kw.language_code,
          kw.region_code,
        )

        const { error: upsertError } = await supabaseAdmin
          .from("project_keyword_rankings")
          .upsert(
            {
              project_keyword_id: kw.id,
              check_date: today,
              rank: result.rank,
              found_url: result.foundUrl,
              found_domain: result.foundDomain,
              top_results: result.topResults,
            },
            { onConflict: "project_keyword_id,check_date" },
          )

        if (upsertError) {
          console.error("Upsert ranking error", upsertError)
        } else {
          processed++
        }
      } catch (e) {
        console.error(`Error ranking keyword id=${kw.id}`, e)
      }
    }

    return new Response(
      JSON.stringify({
        message: "Keyword rankings sync completed",
        processed,
        total_keywords: keywords.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  } catch (e) {
    console.error("sync-project-keyword-rankings error", e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
