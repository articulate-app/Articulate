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

interface KeywordIdeasRequest {
  keyword: string;
  regionId?: string;
  languageId?: string;
  pageSize?: number;
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

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
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
  keyword: string;
  regionId?: string;
  languageId?: string;
  pageSize: number;
}): Promise<GoogleAdsResponse> {
  const payload = {
    keywordSeed: { keywords: [args.keyword.trim()] },
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    pageSize: args.pageSize,
    ...buildGeoLanguagePayload(args.regionId, args.languageId),
  };

  const googleAdsUrl =
    `https://googleads.googleapis.com/v22/customers/${args.customerId}:generateKeywordIdeas`;

  console.log('Google Ads API Request:', {
    url: googleAdsUrl,
    customerId: args.customerId,
    developerToken: args.developerToken
      ? '***' + args.developerToken.slice(-4)
      : 'missing',
    accessToken: args.accessToken ? '***' + args.accessToken.slice(-8) : 'missing',
    payload,
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
    const { keyword, regionId, languageId } = body;

    // Validate required fields
    if (!keyword || keyword.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: "Keyword is required" } },
        { status: 400 }
      );
    }

    const trimmedKeyword = keyword.trim();

    // Create cache key (v2: includes autocomplete expansion)
    const cacheKey = `v2-${trimmedKeyword.toLowerCase()}-${regionId || 'any'}-${languageId || 'any'}-${pageSize}`;
    
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

    // Expand ideas via Autocomplete in parallel with Google Ads Keyword Planner
    const [adsSettled, autocompleteSettled] = await Promise.allSettled([
      fetchGenerateKeywordIdeas({
        accessToken,
        customerId,
        developerToken,
        keyword: trimmedKeyword,
        regionId,
        languageId,
        pageSize,
      }),
      fetchGoogleAutocompleteSuggestions({
        keyword: trimmedKeyword,
        languageId,
        regionId,
        limit: Math.max(AUTOCOMPLETE_FETCH_LIMIT, pageSize),
        expandAlphabet: true,
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
    console.log('Google Ads API Response:', JSON.stringify(googleAdsData, null, 2));

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
    
    if (!Array.isArray(googleAdsData.results)) {
      console.error('Invalid Google Ads response: results is not an array', googleAdsData);
      return NextResponse.json(
        { 
          error: { 
            code: 500, 
            message: "Invalid response from Google Ads API",
            details: `Expected results to be an array, got ${typeof googleAdsData.results}`
          } 
        },
        { status: 500 }
      );
    }

    const adsIdeas = googleAdsData.results.map((item, index) => mapGoogleAdsIdea(item, index));

    const autocompleteSuggestions =
      autocompleteSettled.status === 'fulfilled' ? autocompleteSettled.value : [];

    if (autocompleteSettled.status === 'rejected') {
      console.warn('Google Autocomplete failed:', autocompleteSettled.reason);
    }

    const adsKeys = new Set(adsIdeas.map((idea) => normalizeKeywordKey(idea.keyword)));
    const missingFromAds = autocompleteSuggestions.filter(
      (suggestion) => !adsKeys.has(normalizeKeywordKey(suggestion)),
    );

    const historicalIdeas =
      missingFromAds.length > 0
        ? await fetchKeywordHistoricalMetrics({
            accessToken,
            customerId,
            developerToken,
            keywords: missingFromAds,
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
    );

    const responseData: KeywordIdeasResponse = {
      elapsedMs: Date.now() - startTime,
      results,
      nextPageToken: googleAdsData.nextPageToken || null,
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
