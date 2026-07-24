import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Secrets:
 * - DATAFORSEO_ID — DataForSEO API login
 * - DATAFORSEO_SECRET — DataForSEO API password
 *
 * Returns Google "searches related to" style keywords via DataForSEO Labs.
 */

const DATAFORSEO_RELATED_URL =
  "https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live";

const DEFAULT_LOCATION_CODE = 2620; // Portugal
const DEFAULT_LANGUAGE_CODE = "pt";

const LANGUAGE_ID_TO_HL: Record<string, string> = {
  "1000": "en",
  "1014": "pt",
  "1003": "es",
  "1002": "fr",
  "1001": "de",
};

const REGION_ID_TO_LOCATION: Record<string, number> = {
  "2840": 2840,
  "2826": 2826,
  "2620": 2620,
  "2724": 2724,
  "2076": 2076,
  "2276": 2276,
  "2250": 2250,
};

interface RelatedKeywordsRequest {
  keyword: string;
  regionId?: string;
  languageId?: string;
  depth?: number;
  limit?: number;
}

interface KeywordMonthlySearchVolume {
  year: number;
  month: number;
  monthlySearches: number;
}

interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number;
  competitionIndex: number;
  monthlySearchVolumes: KeywordMonthlySearchVolume[];
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function resolveLanguageCode(languageId?: string): string {
  if (!languageId || !languageId.trim()) return DEFAULT_LANGUAGE_CODE;
  const t = languageId.trim();
  if (LANGUAGE_ID_TO_HL[t]) return LANGUAGE_ID_TO_HL[t];
  if (/^[a-z]{2}$/i.test(t)) return t.toLowerCase();
  return DEFAULT_LANGUAGE_CODE;
}

function resolveLocationCode(regionId?: string): number {
  if (!regionId || !regionId.trim()) return DEFAULT_LOCATION_CODE;
  const t = regionId.trim();
  if (REGION_ID_TO_LOCATION[t]) return REGION_ID_TO_LOCATION[t];
  if (/^\d+$/.test(t)) return Number(t);
  return DEFAULT_LOCATION_CODE;
}

function toBasicAuth(login: string, password: string): string {
  return `Basic ${btoa(`${login}:${password}`)}`;
}

function mapItems(items: unknown): KeywordIdea[] {
  if (!Array.isArray(items)) return [];
  const rows: KeywordIdea[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const keywordData = item.keyword_data as Record<string, unknown> | undefined;
    if (!keywordData) continue;
    const keyword =
      typeof keywordData.keyword === "string" ? keywordData.keyword.trim() : "";
    if (!keyword) continue;

    const info = keywordData.keyword_info as Record<string, unknown> | undefined;
    const props = keywordData.keyword_properties as
      | Record<string, unknown>
      | undefined;

    const volume = Number(info?.search_volume);
    let competitionIndex = 0;
    const difficulty = Number(props?.keyword_difficulty);
    if (Number.isFinite(difficulty)) {
      competitionIndex = Math.max(0, Math.min(100, Math.round(difficulty)));
    } else {
      const competition = Number(info?.competition);
      if (Number.isFinite(competition)) {
        competitionIndex = Math.max(0, Math.min(100, Math.round(competition * 100)));
      }
    }

    const monthlyRaw = info?.monthly_searches;
    const monthlySearchVolumes: KeywordMonthlySearchVolume[] = [];
    if (Array.isArray(monthlyRaw)) {
      for (const entry of monthlyRaw) {
        if (!entry || typeof entry !== "object") continue;
        const row = entry as Record<string, unknown>;
        const year = Number(row.year);
        const month = Number(row.month);
        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
          continue;
        }
        monthlySearchVolumes.push({
          year,
          month,
          monthlySearches: Number(row.search_volume) || 0,
        });
      }
      monthlySearchVolumes.sort((a, b) => a.year - b.year || a.month - b.month);
    }

    rows.push({
      keyword,
      avgMonthlySearches: Number.isFinite(volume) ? volume : 0,
      competitionIndex,
      monthlySearchVolumes,
    });
  }

  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: { code: 405, message: "Method not allowed" } }, 405);
  }

  try {
    const body = (await req.json()) as RelatedKeywordsRequest;
    const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
    if (!keyword) {
      return json({ error: { code: 400, message: "Keyword is required" } }, 400);
    }

    const login = Deno.env.get("DATAFORSEO_ID")?.trim();
    const password = Deno.env.get("DATAFORSEO_SECRET")?.trim();
    if (!login || !password) {
      return json(
        {
          error: {
            code: 500,
            message: "DataForSEO credentials not configured",
          },
        },
        500,
      );
    }

    const depth = Math.max(1, Math.min(4, Number(body.depth) || 2));
    const limit = Math.max(1, Math.min(1000, Number(body.limit) || 50));
    const locationCode = resolveLocationCode(body.regionId);
    const languageCode = resolveLanguageCode(body.languageId);

    const response = await fetch(DATAFORSEO_RELATED_URL, {
      method: "POST",
      headers: {
        Authorization: toBasicAuth(login, password),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword,
          location_code: locationCode,
          language_code: languageCode,
          depth,
          limit,
          include_seed_keyword: false,
        },
      ]),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DataForSEO HTTP error:", response.status, errorText);
      return json(
        {
          error: {
            code: response.status,
            message: `DataForSEO error: ${response.status}`,
            details: errorText,
          },
        },
        response.status,
      );
    }

    const payload = await response.json();
    const statusCode = Number(payload?.status_code);
    if (statusCode && statusCode !== 20000) {
      console.error("DataForSEO status:", statusCode, payload?.status_message);
      return json(
        {
          error: {
            code: 502,
            message: payload?.status_message || "DataForSEO request failed",
          },
        },
        502,
      );
    }

    const task = Array.isArray(payload?.tasks) ? payload.tasks[0] : null;
    const taskStatus = Number(task?.status_code);
    if (taskStatus && taskStatus !== 20000) {
      console.error("DataForSEO task status:", taskStatus, task?.status_message);
      // Soft-fail: research UI still works with Ads + Autocomplete alone.
      return json({ results: [] }, 200);
    }

    const items = task?.result?.[0]?.items;
    const results = mapItems(items);

    return json({ results, count: results.length }, 200);
  } catch (error) {
    console.error("related-keywords error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: { code: 500, message } }, 500);
  }
});
