import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken, validateGoogleAdsConfig } from '../../lib/googleAdsAuth';
import {
  parseMonthlySearchVolumes,
  type KeywordMonthlySearchVolume,
} from '../../lib/keyword-ideas-metrics';
import {
  fetchGoogleAutocompleteSuggestions,
  normalizeKeywordKey,
} from '../../lib/google-autocomplete';
import { emptyKeywordIdea, mergeKeywordIdeas } from '../../lib/keyword-ideas-merge';
import { fetchRelatedKeywordIdeas } from '../../lib/dataforseo-related-keywords';
import {
  fetchCategoryKeywordIdeas,
  isKeywordExpansionSparse,
} from '../../lib/dataforseo-keyword-ideas';
import {
  buildGoogleAdsKeywordSeed,
  expandKeywordSeedVariants,
  resolveKeywordResearchMode,
} from '../../lib/keyword-research-input';

interface KeywordIdeasRequest {
  /** Required for seed mode; optional when mode=url with contentSeedKeyword */
  keyword?: string;
  /** URL mode: article or page URL seed for Google Ads */
  url?: string;
  mode?: 'seed' | 'url';
  contentSeedKeyword?: string;
  regionId?: string;
  languageId?: string;
  pageSize?: number;
  /**
   * primary = Google Ads only (fast first paint).
   * full = Ads + autocomplete + DataForSEO related + historical metrics.
   */
  phase?: 'primary' | 'full';
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
  phase?: 'primary' | 'full';
}

interface GoogleAdsKeywordIdea {
  text?: string;
  keywordIdeaMetrics?: {
    avgMonthlySearches?: string;
    competitionIndex?: string;
    monthlySearchVolumes?: unknown;
  };
  keywordMetrics?: {
    avgMonthlySearches?: string;
    competitionIndex?: string;
    monthlySearchVolumes?: unknown;
  };
}

interface GoogleAdsResponse {
  results?: GoogleAdsKeywordIdea[];
  nextPageToken?: string;
}

// In-memory cache for requests (2 minutes)
const cache = new Map<string, { data: KeywordIdeasResponse; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Rate limiting (3 requests per 5 seconds per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 3;
const RATE_LIMIT_WINDOW = 5 * 1000; // 5 seconds

const DEFAULT_PAGE_SIZE = 40;
const PRIMARY_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 60;
const AUTOCOMPLETE_FETCH_LIMIT = 50;

function getClientIP(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0] || 
         request.headers.get('x-real-ip') || 
         'unknown';
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

function buildGeoLanguagePayload(regionId?: string, languageId?: string) {
  const payload: Record<string, unknown> = {};
  if (regionId && regionId !== '') {
    payload.geoTargetConstants = [`geoTargetConstants/${regionId}`];
  }
  if (languageId && languageId !== '') {
    payload.language = `languageConstants/${languageId}`;
  }
  return payload;
}

function mapGoogleAdsIdea(item: GoogleAdsKeywordIdea, index: number): KeywordIdea {
  try {
    if (!item || typeof item !== 'object') {
      console.warn(`Invalid keyword item at index ${index}:`, item);
      return emptyKeywordIdea('Unknown');
    }

    const metrics = item.keywordIdeaMetrics ?? item.keywordMetrics;
    return {
      keyword: item.text || 'Unknown',
      avgMonthlySearches: parseInt(String(metrics?.avgMonthlySearches ?? ''), 10) || 0,
      competitionIndex: parseInt(String(metrics?.competitionIndex ?? ''), 10) || 0,
      monthlySearchVolumes: parseMonthlySearchVolumes(metrics?.monthlySearchVolumes),
    };
  } catch (itemError) {
    console.warn(`Error processing keyword item at index ${index}:`, itemError, item);
    return emptyKeywordIdea('Unknown');
  }
}

async function fetchGenerateKeywordIdeas(args: {
  accessToken: string;
  customerId: string;
  developerToken: string;
  keyword?: string;
  url?: string;
  mode?: 'seed' | 'url';
  contentSeedKeyword?: string;
  regionId?: string;
  languageId?: string;
  pageSize: number;
}): Promise<GoogleAdsResponse> {
  const mode = args.mode ?? (args.url ? 'url' : 'seed');
  const seed = buildGoogleAdsKeywordSeed(
    mode === 'url'
      ? {
          mode: 'url',
          url: args.url ?? '',
          contentSeedKeyword: args.contentSeedKeyword ?? args.keyword,
        }
      : {
          mode: 'seed',
          seedKeyword: args.keyword ?? '',
        },
  );

  const payload = {
    ...seed,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    pageSize: args.pageSize,
    ...buildGeoLanguagePayload(args.regionId, args.languageId),
  };

  const googleAdsUrl =
    `https://googleads.googleapis.com/v22/customers/${args.customerId}:generateKeywordIdeas`;

  console.log('Google Ads API Request:', {
    url: googleAdsUrl,
    customerId: args.customerId,
    pageSize: args.pageSize,
    mode,
    keyword: args.keyword ?? null,
    pageUrl: args.url ?? null,
    regionId: args.regionId || null,
    languageId: args.languageId || null,
  });

  const response = await fetch(googleAdsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'developer-token': args.developerToken,
      'login-customer-id': args.customerId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google Ads API error:', response.status, errorText);
    const err = new Error(`Google Ads API error: ${response.status}`) as Error & {
      status?: number;
      details?: string;
    };
    err.status = response.status;
    err.details = errorText;
    throw err;
  }

  return (await response.json()) as GoogleAdsResponse;
}

/**
 * Enrich exact keywords with volume/competition via Keyword Plan historical metrics.
 * Soft-fails to [] so autocomplete suggestions still surface without metrics.
 */
async function fetchKeywordHistoricalMetrics(args: {
  accessToken: string;
  customerId: string;
  developerToken: string;
  keywords: string[];
  regionId?: string;
  languageId?: string;
}): Promise<KeywordIdea[]> {
  const keywords = args.keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (keywords.length === 0) return [];

  const payload = {
    keywords,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    ...buildGeoLanguagePayload(args.regionId, args.languageId),
  };

  const url =
    `https://googleads.googleapis.com/v22/customers/${args.customerId}:generateKeywordHistoricalMetrics`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'developer-token': args.developerToken,
        'login-customer-id': args.customerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Google Ads historical metrics error:', response.status, errorText);
      return [];
    }

    const data = (await response.json()) as GoogleAdsResponse;
    if (!Array.isArray(data.results)) return [];
    return data.results.map((item, index) => mapGoogleAdsIdea(item, index));
  } catch (error) {
    console.warn('Google Ads historical metrics failed:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Check rate limiting
    const clientIP = getClientIP(request);
    if (isRateLimited(clientIP)) {
      return NextResponse.json(
        { error: { code: 429, message: "Rate limit exceeded. Please try again in a few seconds." } },
        { status: 429 }
      );
    }

    // Parse request body
    const body: KeywordIdeasRequest = await request.json();
    const rawPageSize = body.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, rawPageSize));
    const { keyword, url, regionId, languageId, contentSeedKeyword } = body;
    const mode = resolveKeywordResearchMode(body);
    const phase: 'primary' | 'full' = body.phase === 'full' ? 'full' : 'primary';
    // Primary phase uses a smaller page for a faster Google Ads response.
    const effectivePageSize =
      phase === 'primary'
        ? Math.min(pageSize, PRIMARY_PAGE_SIZE)
        : pageSize;

    // Validate required fields
    if (mode === 'url') {
      if (!url || url.trim().length === 0) {
        return NextResponse.json(
          { error: { code: 400, message: "URL is required for url mode" } },
          { status: 400 }
        );
      }
    } else if (!keyword || keyword.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: "Keyword is required" } },
        { status: 400 }
      );
    }

    const trimmedKeyword = (keyword ?? contentSeedKeyword ?? url ?? '').trim();
    const trimmedUrl = url?.trim() ?? '';

    // Create cache key (v5: seed + url modes)
    const cacheKey = `v5-${mode}-${phase}-${trimmedKeyword.toLowerCase()}-${trimmedUrl}-${regionId || 'any'}-${languageId || 'any'}-${effectivePageSize}`;
    
    // Check cache first
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse);
    }

    // Validate Google Ads configuration
    if (!validateGoogleAdsConfig()) {
      return NextResponse.json(
        { error: { code: 500, message: "Google Ads API not configured" } },
        { status: 500 }
      );
    }

    // Get fresh access token
    const accessToken = await getFreshAccessToken();
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;

    // Fast path: return Google Ads ideas as soon as ready (first paint).
    if (phase === 'primary') {
      try {
        const googleAdsData = await fetchGenerateKeywordIdeas({
          accessToken,
          customerId,
          developerToken,
          mode,
          keyword: keyword?.trim() || contentSeedKeyword?.trim() || undefined,
          url: trimmedUrl || undefined,
          contentSeedKeyword: contentSeedKeyword?.trim() || undefined,
          regionId,
          languageId,
          pageSize: effectivePageSize,
        });

        // Google Ads often returns HTTP 200 with `{}` (no `results`) for seeds with
        // no ideas — common for some healthcare terms under account policy limits.
        // Treat missing results as an empty list; do not surface a fake 500.
        if (!googleAdsData || typeof googleAdsData !== 'object') {
          return NextResponse.json(
            {
              error: {
                code: 500,
                message: "Invalid response from Google Ads API",
              },
            },
            { status: 500 }
          );
        }

        const adsRows = Array.isArray(googleAdsData.results) ? googleAdsData.results : [];
        if (!Array.isArray(googleAdsData.results)) {
          console.warn('Google Ads returned no results array for seed; treating as empty', {
            keyword: trimmedKeyword || null,
            mode,
            keys: Object.keys(googleAdsData),
          });
        }

        const adsIdeas = adsRows.map((item, index) => mapGoogleAdsIdea(item, index));
        let results = mergeKeywordIdeas(
          trimmedKeyword,
          adsIdeas,
          [],
          [],
          effectivePageSize,
          [],
        );

        // When the typed seed still has 0 volume (common for hyphen/diacritic
        // spellings), pull historical metrics for planner-friendly variants.
        const seedRow = results[0];
        const seedNeedsMetrics =
          !!trimmedKeyword
          && (!seedRow
            || (
              seedRow.avgMonthlySearches <= 0
              && seedRow.competitionIndex <= 0
              && seedRow.monthlySearchVolumes.length === 0
            ));
        if (seedNeedsMetrics) {
          const historicalIdeas = await fetchKeywordHistoricalMetrics({
            accessToken,
            customerId,
            developerToken,
            keywords: expandKeywordSeedVariants(trimmedKeyword),
            regionId,
            languageId,
          });
          if (historicalIdeas.length > 0) {
            results = mergeKeywordIdeas(
              trimmedKeyword,
              adsIdeas,
              [],
              historicalIdeas,
              effectivePageSize,
              [],
            );
          }
        }

        const responseData: KeywordIdeasResponse = {
          elapsedMs: Date.now() - startTime,
          results,
          nextPageToken: googleAdsData.nextPageToken || null,
          phase: 'primary',
        };
        setCachedResponse(cacheKey, responseData);
        return NextResponse.json(responseData);
      } catch (err) {
        const error = err as Error & { status?: number; details?: string };
        return NextResponse.json(
          {
            error: {
              code: error.status || 500,
              message: error.message || 'Google Ads API error',
              details: error.details,
            },
          },
          { status: error.status || 500 }
        );
      }
    }

    // Expand ideas: Google Ads + Autocomplete + DataForSEO related (in parallel)
    const [adsSettled, autocompleteSettled, relatedSettled] = await Promise.allSettled([
      fetchGenerateKeywordIdeas({
        accessToken,
        customerId,
        developerToken,
        mode,
        keyword: keyword?.trim() || contentSeedKeyword?.trim() || undefined,
        url: trimmedUrl || undefined,
        contentSeedKeyword: contentSeedKeyword?.trim() || undefined,
        regionId,
        languageId,
        pageSize,
      }),
      fetchGoogleAutocompleteSuggestions({
        keyword: (keyword || contentSeedKeyword || trimmedKeyword).trim(),
        languageId,
        regionId,
        limit: Math.max(AUTOCOMPLETE_FETCH_LIMIT, pageSize),
        // Skip alphabet expansion on the critical path — seed + trailing-space is enough
        // for enrichment and keeps this phase much faster.
        expandAlphabet: false,
      }),
      fetchRelatedKeywordIdeas({
        keyword: trimmedKeyword,
        languageId,
        regionId,
        depth: 2,
        limit: Math.max(AUTOCOMPLETE_FETCH_LIMIT, pageSize),
      }),
    ]);

    if (adsSettled.status === 'rejected') {
      const err = adsSettled.reason as Error & { status?: number; details?: string };
      return NextResponse.json(
        {
          error: {
            code: err.status || 500,
            message: err.message || 'Google Ads API error',
            details: err.details,
          },
        },
        { status: err.status || 500 }
      );
    }

    const googleAdsData = adsSettled.value;
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        'Google Ads API Response: results=',
        Array.isArray(googleAdsData?.results) ? googleAdsData.results.length : 0,
      );
    }

    if (!googleAdsData || typeof googleAdsData !== 'object') {
      console.error('Invalid Google Ads response: not an object', googleAdsData);
      return NextResponse.json(
        { 
          error: { 
            code: 500, 
            message: "Invalid response from Google Ads API",
            details: "Response is not a valid object"
          } 
        },
        { status: 500 }
      );
    }

    // Empty `{}` is a valid Google Ads success when Keyword Planner has no ideas
    // for the seed (seen with some PT healthcare queries on this account).
    const adsRows = Array.isArray(googleAdsData.results) ? googleAdsData.results : [];
    if (!Array.isArray(googleAdsData.results)) {
      console.warn('Google Ads returned no results array for seed; treating as empty', {
        keyword: trimmedKeyword || null,
        mode,
        keys: Object.keys(googleAdsData),
      });
    }

    const adsIdeas = adsRows.map((item, index) => mapGoogleAdsIdea(item, index));

    let autocompleteSuggestions =
      autocompleteSettled.status === 'fulfilled' ? autocompleteSettled.value : [];

    if (autocompleteSettled.status === 'rejected') {
      console.warn('Google Autocomplete failed:', autocompleteSettled.reason);
    }

    let relatedIdeas =
      relatedSettled.status === 'fulfilled' ? relatedSettled.value : [];

    if (relatedSettled.status === 'rejected') {
      console.warn('DataForSEO related keywords failed:', relatedSettled.reason);
    }

    // When Ads has no useful volume ideas (common for niche PT seeds), escalate to
    // DataForSEO category ideas + alphabet autocomplete + deeper related searches.
    // This is the Mangools-style expansion path for zero-volume seeds.
    if (
      isKeywordExpansionSparse({
        seedKeyword: trimmedKeyword,
        adsIdeas,
        relatedIdeas,
        autocompleteSuggestions,
      })
    ) {
      const expandLimit = Math.max(AUTOCOMPLETE_FETCH_LIMIT, pageSize);
      const [categorySettled, autoExpandedSettled, relatedDeepSettled] =
        await Promise.allSettled([
          fetchCategoryKeywordIdeas({
            keyword: trimmedKeyword,
            languageId,
            regionId,
            limit: expandLimit,
          }),
          fetchGoogleAutocompleteSuggestions({
            keyword: (keyword || contentSeedKeyword || trimmedKeyword).trim(),
            languageId,
            regionId,
            limit: expandLimit,
            expandAlphabet: true,
          }),
          fetchRelatedKeywordIdeas({
            keyword: trimmedKeyword,
            languageId,
            regionId,
            depth: 3,
            limit: expandLimit,
            replaceWithCoreKeyword: true,
          }),
        ]);

      if (categorySettled.status === 'fulfilled' && categorySettled.value.length > 0) {
        relatedIdeas = [...relatedIdeas, ...categorySettled.value];
      } else if (categorySettled.status === 'rejected') {
        console.warn('DataForSEO category keyword ideas failed:', categorySettled.reason);
      }

      if (autoExpandedSettled.status === 'fulfilled') {
        autocompleteSuggestions = autoExpandedSettled.value;
      } else if (autoExpandedSettled.status === 'rejected') {
        console.warn('Google Autocomplete (alphabet) failed:', autoExpandedSettled.reason);
      }

      if (relatedDeepSettled.status === 'fulfilled' && relatedDeepSettled.value.length > 0) {
        relatedIdeas = [...relatedIdeas, ...relatedDeepSettled.value];
      } else if (relatedDeepSettled.status === 'rejected') {
        console.warn('DataForSEO deep related keywords failed:', relatedDeepSettled.reason);
      }
    }

    const knownMetricKeys = new Set([
      ...adsIdeas.map((idea) => normalizeKeywordKey(idea.keyword)),
      ...relatedIdeas.map((idea) => normalizeKeywordKey(idea.keyword)),
    ]);
    const missingFromAds = autocompleteSuggestions.filter(
      (suggestion) => !knownMetricKeys.has(normalizeKeywordKey(suggestion)),
    );
    // Always include seed orthographic variants — Ads ideas can omit the exact
    // typed form even when historical metrics have volume for "pre diabetes".
    const seedMetricKeywords = expandKeywordSeedVariants(trimmedKeyword).filter(
      (variant) => !knownMetricKeys.has(normalizeKeywordKey(variant)),
    );
    const historicalKeywords = [
      ...new Set([...seedMetricKeywords, ...missingFromAds]),
    ].slice(0, 50);

    const historicalIdeas =
      historicalKeywords.length > 0
        ? await fetchKeywordHistoricalMetrics({
            accessToken,
            customerId,
            developerToken,
            keywords: historicalKeywords,
            regionId,
            languageId,
          })
        : [];

    const results = mergeKeywordIdeas(
      trimmedKeyword,
      adsIdeas,
      autocompleteSuggestions,
      historicalIdeas,
      pageSize,
      relatedIdeas,
    );

    const responseData: KeywordIdeasResponse = {
      elapsedMs: Date.now() - startTime,
      results,
      nextPageToken: googleAdsData.nextPageToken || null,
      phase: 'full',
    };

    // Set cache
    setCachedResponse(cacheKey, responseData);

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error('Keyword ideas API error:', error);
    
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: { code: 408, message: "Request timeout" } },
        { status: 408 }
      );
    }

    // Provide more specific error details
    let errorMessage = "Internal server error";
    let errorDetails = error.message || "Unknown error occurred";
    
    if (error.message?.includes('map')) {
      errorMessage = "Failed to process Google Ads API response";
      errorDetails = "Invalid response structure from Google Ads API. Please check the debug logs for more details.";
    } else if (error.message?.includes('fetch')) {
      errorMessage = "Failed to communicate with Google Ads API";
      errorDetails = error.message;
    } else if (error.message?.includes('JSON')) {
      errorMessage = "Failed to parse Google Ads API response";
      errorDetails = "Invalid JSON response from Google Ads API";
    }

    return NextResponse.json(
      { 
        error: { 
          code: 500, 
          message: errorMessage, 
          details: errorDetails 
        } 
      },
      { status: 500 }
    );
  }
}
