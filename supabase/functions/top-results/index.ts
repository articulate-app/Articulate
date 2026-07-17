import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Mirrors app/api/top-results/route.ts
 * Expects languageId/regionId as user-facing names (e.g. "English", "United States")
 * matching useTopResults / TopResultsSection behavior.
 */

const topResultsCache = new Map<
  string,
  { results: TopResultItem[]; params: CseParams; timestamp: number }
>();
const CACHE_DURATION = 2 * 60 * 1000;

const languageMapping: Record<string, string> = {
  English: "lang_en",
  Portuguese: "lang_pt",
  Spanish: "lang_es",
  French: "lang_fr",
  German: "lang_de",
};

const regionMapping: Record<string, string> = {
  "United States": "countryUS",
  "United Kingdom": "countryGB",
  Portugal: "countryPT",
  Spain: "countryES",
  Brazil: "countryBR",
  Germany: "countryDE",
  France: "countryFR",
};

interface TopResultsRequest {
  q: string;
  languageId?: string | number;
  regionId?: string | number;
}

interface TopResultItem {
  title: string;
  link: string;
  displayLink: string;
}

interface CseParams {
  lr?: string;
  cr?: string;
}

interface TopResultsResponse {
  results: TopResultItem[];
  params: CseParams;
  q: string;
  paramsUsed: string;
  serpKey: string;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getCacheKey(
  q: string,
  languageId?: string | number,
  regionId?: string | number,
): string {
  const lr = languageId ? languageMapping[languageId.toString()] || "" : "";
  const cr = regionId ? regionMapping[regionId.toString()] || "" : "";
  return `${q.toLowerCase().trim()}|${lr}|${cr}`;
}

function getCSEParams(
  languageId?: string | number,
  regionId?: string | number,
): CseParams {
  const params: CseParams = {};

  if (languageId && languageId !== "") {
    const lr = languageMapping[languageId.toString()];
    if (lr) params.lr = lr;
  }

  if (regionId && regionId !== "") {
    const cr = regionMapping[regionId.toString()];
    if (cr) params.cr = cr;
  }

  return params;
}

function buildParamsUsedString(
  q: string,
  languageId?: string | number,
  regionId?: string | number,
): string {
  const params = new URLSearchParams({
    q,
    num: "10",
    start: "1",
    key: "REDACTED",
    cx: "REDACTED",
  });

  const cseParams = getCSEParams(languageId, regionId);
  if (cseParams.lr) params.append("lr", cseParams.lr);
  if (cseParams.cr) params.append("cr", cseParams.cr);

  return params.toString();
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as TopResultsRequest;
    const { q, languageId, regionId } = body;

    if (!q || !q.trim()) {
      return json({ error: 'Query parameter "q" is required' }, 400);
    }

    const cacheKey = getCacheKey(q, languageId, regionId);
    const cached = topResultsCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return json(
        {
          ...cached,
          q: q.trim(),
          paramsUsed: buildParamsUsedString(q.trim(), languageId, regionId),
          serpKey: cacheKey,
        },
        200,
      );
    }

    const cseParams = getCSEParams(languageId, regionId);

    const searchParams = new URLSearchParams({
      key: Deno.env.get("GOOGLE_CSE_API_KEY")!,
      cx: Deno.env.get("GOOGLE_CSE_CX")!,
      q: q.trim(),
      num: "10",
      start: "1",
    });

    if (cseParams.lr) searchParams.append("lr", cseParams.lr);
    if (cseParams.cr) searchParams.append("cr", cseParams.cr);

    const cseUrl =
      `https://www.googleapis.com/customsearch/v1?${searchParams.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(cseUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as {
        error?: { message?: string };
      };
      console.error("Google CSE API error:", errorData);

      return json(
        {
          error: "Failed to fetch search results",
          details: errorData.error?.message || "Unknown error",
        },
        response.status,
      );
    }

    const data = (await response.json()) as {
      items?: Array<{ title?: string; link?: string; displayLink?: string }>;
    };

    const results: TopResultItem[] = (data.items || []).map((item) => ({
      title: item.title || "",
      link: item.link || "",
      displayLink:
        item.displayLink ||
        (() => {
          try {
            return item.link ? new URL(item.link).hostname : "";
          } catch {
            return "";
          }
        })(),
    }));

    const paramsUsed = buildParamsUsedString(q.trim(), languageId, regionId);

    const responseData: TopResultsResponse = {
      results,
      params: cseParams,
      q: q.trim(),
      paramsUsed,
      serpKey: cacheKey,
    };

    topResultsCache.set(cacheKey, {
      results,
      params: cseParams,
      timestamp: Date.now(),
    });

    return json(responseData, 200);
  } catch (error: unknown) {
    console.error("Top results API error:", error);

    if (error instanceof Error && error.name === "AbortError") {
      return json(
        { error: "Request timed out. Please try again." },
        408,
      );
    }

    return json({ error: "Internal server error" }, 500);
  }
});
