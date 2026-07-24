import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Secrets (Supabase Edge Function):
 * - GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET (OAuth refresh)
 * - GOOGLE_ADS_OAUTH_CLIENT_ID — optional; used if GOOGLE_ADS_CLIENT_ID is unset (same OAuth client id)
 * - GOOGLE_ADS_CUSTOMER_ID — customer in the API URL (no hyphens, or hyphens stripped)
 * - GOOGLE_ADS_LOGIN_CUSTOMER_ID — optional; MCC / manager id for `login-customer-id` header when
 *   accessing a client via a manager. If unset, `GOOGLE_ADS_CUSTOMER_ID` is used (same as Next route).
 * - GOOGLE_ADS_DEVELOPER_TOKEN
 *
 * Matches app/api/keyword-ideas/route.ts Google Ads metrics behavior.
 * Autocomplete expansion for keyword research lives in the Next.js route only;
 * this edge function is used for exact-keyword metric enrichment.
 */
interface KeywordIdeasRequest {
  keyword: string;
  regionId?: string;
  languageId?: string;
  pageSize?: number;
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

interface KeywordIdeasResponse {
  elapsedMs: number;
  results: KeywordIdea[];
  nextPageToken?: string | null;
}

interface GoogleAdsKeywordIdea {
  text: string;
  keywordIdeaMetrics: {
    avgMonthlySearches: string;
    competitionIndex: string;
    monthlySearchVolumes?: unknown;
  };
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  JANUARY: 1,
  FEBRUARY: 2,
  MARCH: 3,
  APRIL: 4,
  MAY: 5,
  JUNE: 6,
  JULY: 7,
  AUGUST: 8,
  SEPTEMBER: 9,
  OCTOBER: 10,
  NOVEMBER: 11,
  DECEMBER: 12,
};

function parseMonthlySearchVolumes(raw: unknown): KeywordMonthlySearchVolume[] {
  if (!Array.isArray(raw)) return [];
  const rows: KeywordMonthlySearchVolume[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const year = Number(record.year);
    const monthRaw = record.month;
    const month =
      typeof monthRaw === "number"
        ? monthRaw
        : typeof monthRaw === "string"
        ? (MONTH_NAME_TO_NUMBER[monthRaw.toUpperCase()] ?? Number(monthRaw))
        : NaN;
    const monthlySearches = Number(
      record.monthlySearches ?? record.monthly_searches,
    );
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      continue;
    }
    rows.push({
      year,
      month,
      monthlySearches: Number.isFinite(monthlySearches) ? monthlySearches : 0,
    });
  }
  rows.sort((a, b) => a.year - b.year || a.month - b.month);
  return rows;
}

interface GoogleAdsResponse {
  results: GoogleAdsKeywordIdea[];
  nextPageToken?: string;
}

/**
 * GenerateKeywordIdeas expects numeric resource ids (e.g. languageConstants/1014).
 * ISO codes like "pt" produce BAD_RESOURCE_ID (“'pt' part of the resource name is invalid”).
 * Align with app/lib/geoLanguageMaps.ts.
 */
const LANGUAGE_ISO_TO_CID: Record<string, string> = {
  en: "1000",
  pt: "1014",
  es: "1003",
  fr: "1002",
  de: "1001",
};

const LANGUAGE_NAME_TO_CID: Record<string, string> = {
  english: "1000",
  portuguese: "1014",
  spanish: "1003",
  french: "1002",
  german: "1001",
};

const REGION_ISO_TO_GEO: Record<string, string> = {
  us: "2840",
  gb: "2826",
  uk: "2826",
  pt: "2620",
  es: "2724",
  br: "2076",
  de: "2276",
  fr: "2250",
};

const REGION_NAME_TO_GEO: Record<string, string> = {
  "united states": "2840",
  "united kingdom": "2826",
  portugal: "2620",
  spain: "2724",
  brazil: "2076",
  germany: "2276",
  france: "2250",
};

function resolveLanguageConstantId(
  languageId: string | undefined,
): { id: string } | { error: string } | null {
  if (languageId === undefined || languageId.trim() === "") return null;
  const t = languageId.trim();
  if (/^\d+$/.test(t)) return { id: t };
  const lower = t.toLowerCase();
  if (lower.length === 2 && LANGUAGE_ISO_TO_CID[lower]) {
    return { id: LANGUAGE_ISO_TO_CID[lower] };
  }
  if (LANGUAGE_NAME_TO_CID[lower]) return { id: LANGUAGE_NAME_TO_CID[lower] };
  return {
    error:
      `Invalid languageId "${t}". Use a Google Ads language constant id (e.g. 1014 for Portuguese), or ISO 639-1 (en, pt, es, fr, de).`,
  };
}

function resolveGeoTargetConstantId(
  regionId: string | undefined,
): { id: string } | { error: string } | null {
  if (regionId === undefined || regionId.trim() === "") return null;
  const t = regionId.trim();
  if (/^\d+$/.test(t)) return { id: t };
  const lower = t.toLowerCase();
  if (lower.length === 2 && REGION_ISO_TO_GEO[lower]) {
    return { id: REGION_ISO_TO_GEO[lower] };
  }
  if (REGION_NAME_TO_GEO[lower]) return { id: REGION_NAME_TO_GEO[lower] };
  return {
    error:
      `Invalid regionId "${t}". Use a Google Ads geo target constant id (e.g. 2620 for Portugal), or ISO country code (us, gb, pt, …).`,
  };
}

const CACHE_DURATION = 2 * 60 * 1000;
const cache = new Map<string, { data: KeywordIdeasResponse; timestamp: number }>();

const RATE_LIMIT_REQUESTS = 3;
const RATE_LIMIT_WINDOW = 5 * 1000;
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GoogleOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface GoogleOAuthErrorBody {
  error: string;
  error_description: string;
}

function normalizeGoogleAdsCustomerId(value: string): string {
  return value.replace(/-/g, "").trim();
}

function getGoogleAdsOAuthClientId(): string | undefined {
  const primary = Deno.env.get("GOOGLE_ADS_CLIENT_ID")?.trim();
  if (primary) return primary;
  return Deno.env.get("GOOGLE_ADS_OAUTH_CLIENT_ID")?.trim();
}

async function getFreshAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get("GOOGLE_ADS_REFRESH_TOKEN")?.trim();
  const clientId = getGoogleAdsOAuthClientId();
  const clientSecret = Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")?.trim();

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_ADS_CLIENT_ID (or GOOGLE_ADS_OAUTH_CLIENT_ID), GOOGLE_ADS_CLIENT_SECRET, or GOOGLE_ADS_REFRESH_TOKEN",
    );
  }

  const tokenUrl = "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as GoogleOAuthErrorBody;
    throw new Error(
      `OAuth token refresh failed: ${err.error ?? response.status} - ${err.error_description ?? ""}`,
    );
  }

  const data = (await response.json()) as GoogleOAuthTokenResponse;
  if (!data.access_token) {
    throw new Error("No access_token received from Google OAuth");
  }

  return data.access_token;
}

function validateKeywordIdeasEnv(): boolean {
  const required = [
    "GOOGLE_ADS_CUSTOMER_ID",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_REFRESH_TOKEN",
  ] as const;

  const missing = required.filter((k) => !Deno.env.get(k)?.trim());
  if (missing.length > 0) {
    console.error("Missing env:", missing);
    return false;
  }

  if (!getGoogleAdsOAuthClientId()) {
    console.error(
      "Missing GOOGLE_ADS_CLIENT_ID (or GOOGLE_ADS_OAUTH_CLIENT_ID)",
    );
    return false;
  }

  return true;
}

function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const rateLimit = rateLimitMap.get(ip);

  if (!rateLimit || now > rateLimit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (rateLimit.count >= RATE_LIMIT_REQUESTS) {
    return true;
  }

  rateLimit.count++;
  return false;
}

function getCachedResponse(cacheKey: string): KeywordIdeasResponse | null {
  const cached = cache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    cache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

function setCachedResponse(cacheKey: string, data: KeywordIdeasResponse): void {
  cache.set(cacheKey, { data, timestamp: Date.now() });
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
    return json({ error: { code: 405, message: "Method not allowed" } }, 405);
  }

  const startTime = Date.now();

  try {
    const clientIP = getClientIP(req);
    if (isRateLimited(clientIP)) {
      return json(
        {
          error: {
            code: 429,
            message:
              "Rate limit exceeded. Please try again in a few seconds.",
          },
        },
        429,
      );
    }

    const body = (await req.json()) as KeywordIdeasRequest;
    const { keyword, regionId, languageId, pageSize = 15 } = body;

    if (!keyword || keyword.trim().length === 0) {
      return json(
        { error: { code: 400, message: "Keyword is required" } },
        400,
      );
    }

    const langRes = resolveLanguageConstantId(languageId);
    if (langRes && "error" in langRes) {
      return json({ error: { code: 400, message: langRes.error } }, 400);
    }
    const regionRes = resolveGeoTargetConstantId(regionId);
    if (regionRes && "error" in regionRes) {
      return json({ error: { code: 400, message: regionRes.error } }, 400);
    }

    const resolvedLanguageId = langRes && "id" in langRes ? langRes.id : null;
    const resolvedRegionId = regionRes && "id" in regionRes ? regionRes.id : null;

    const cacheKey =
      `${keyword.toLowerCase().trim()}-${resolvedRegionId ?? "any"}-${resolvedLanguageId ?? "any"}-${pageSize}`;

    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      return json(cachedResponse, 200);
    }

    if (!validateKeywordIdeasEnv()) {
      return json(
        { error: { code: 500, message: "Google Ads API not configured" } },
        500,
      );
    }

    const accessToken = await getFreshAccessToken();

    const payload: Record<string, unknown> = {
      keywordSeed: { keywords: [keyword.trim()] },
      keywordPlanNetwork: "GOOGLE_SEARCH",
      pageSize: pageSize,
    };

    if (resolvedRegionId) {
      payload.geoTargetConstants = [`geoTargetConstants/${resolvedRegionId}`];
    }

    if (resolvedLanguageId) {
      payload.language = `languageConstants/${resolvedLanguageId}`;
    }

    const customerId = normalizeGoogleAdsCustomerId(
      Deno.env.get("GOOGLE_ADS_CUSTOMER_ID")!,
    );
    const loginCustomerIdRaw = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")?.trim();
    const loginCustomerId = loginCustomerIdRaw
      ? normalizeGoogleAdsCustomerId(loginCustomerIdRaw)
      : customerId;

    const developerToken = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;
    const googleAdsUrl =
      `https://googleads.googleapis.com/v22/customers/${customerId}:generateKeywordIdeas`;

    console.log("Google Ads API Request:", {
      url: googleAdsUrl,
      customerId,
      loginCustomerId: loginCustomerId === customerId ? "(same)" : loginCustomerId,
      developerToken: developerToken
        ? "***" + developerToken.slice(-4)
        : "missing",
      accessToken: accessToken
        ? "***" + accessToken.slice(-8)
        : "missing",
      payload,
    });

    const response = await fetch(googleAdsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "login-customer-id": loginCustomerId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Ads API error:", response.status, errorText);

      return json(
        {
          error: {
            code: response.status,
            message: `Google Ads API error: ${response.status}`,
            details: errorText,
          },
        },
        response.status,
      );
    }

    const googleAdsData = (await response.json()) as GoogleAdsResponse;

    console.log("Google Ads API Response:", JSON.stringify(googleAdsData, null, 2));

    if (!googleAdsData || typeof googleAdsData !== "object") {
      console.error("Invalid Google Ads response: not an object", googleAdsData);
      return json(
        {
          error: {
            code: 500,
            message: "Invalid response from Google Ads API",
            details: "Response is not a valid object",
          },
        },
        500,
      );
    }

    if (!Array.isArray(googleAdsData.results)) {
      console.error(
        "Invalid Google Ads response: results is not an array",
        googleAdsData,
      );
      return json(
        {
          error: {
            code: 500,
            message: "Invalid response from Google Ads API",
            details:
              `Expected results to be an array, got ${typeof googleAdsData.results}`,
          },
        },
        500,
      );
    }

    const results: KeywordIdea[] = googleAdsData.results.map((item, index) => {
      try {
        if (!item || typeof item !== "object") {
          console.warn(`Invalid keyword item at index ${index}:`, item);
          return {
            keyword: "Unknown",
            avgMonthlySearches: 0,
            competitionIndex: 0,
            monthlySearchVolumes: [],
          };
        }

        return {
          keyword: item.text || "Unknown",
          avgMonthlySearches:
            parseInt(String(item.keywordIdeaMetrics?.avgMonthlySearches), 10) ||
            0,
          competitionIndex:
            parseInt(String(item.keywordIdeaMetrics?.competitionIndex), 10) || 0,
          monthlySearchVolumes: parseMonthlySearchVolumes(
            item.keywordIdeaMetrics?.monthlySearchVolumes,
          ),
        };
      } catch (itemError) {
        console.warn(
          `Error processing keyword item at index ${index}:`,
          itemError,
          item,
        );
        return {
          keyword: "Unknown",
          avgMonthlySearches: 0,
          competitionIndex: 0,
          monthlySearchVolumes: [],
        };
      }
    });

    results.sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches);

    const responseData: KeywordIdeasResponse = {
      elapsedMs: Date.now() - startTime,
      results,
      nextPageToken: googleAdsData.nextPageToken || null,
    };

    setCachedResponse(cacheKey, responseData);

    return json(responseData, 200);
  } catch (error: unknown) {
    console.error("Keyword ideas API error:", error);

    if (error instanceof Error && error.name === "AbortError") {
      return json({ error: { code: 408, message: "Request timeout" } }, 408);
    }

    const message = error instanceof Error ? error.message : "Unknown error occurred";

    let errorMessage = "Internal server error";
    let errorDetails = message;

    if (
      message.includes("OAuth") ||
      message.includes("GOOGLE_ADS_CLIENT") ||
      message.includes("GOOGLE_ADS_REFRESH")
    ) {
      errorMessage = "Failed to obtain Google Ads access token";
      errorDetails = message;
    } else if (message.includes("map")) {
      errorMessage = "Failed to process Google Ads API response";
      errorDetails =
        "Invalid response structure from Google Ads API. Please check the debug logs for more details.";
    } else if (message.includes("fetch")) {
      errorMessage = "Failed to communicate with Google Ads API";
      errorDetails = message;
    } else if (message.includes("JSON")) {
      errorMessage = "Failed to parse Google Ads API response";
      errorDetails = "Invalid JSON response from Google Ads API";
    }

    return json(
      {
        error: {
          code: 500,
          message: errorMessage,
          details: errorDetails,
        },
      },
      500,
    );
  }
});
