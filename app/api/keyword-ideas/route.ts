import { NextRequest, NextResponse } from 'next/server';
import { getFreshAccessToken, validateGoogleAdsConfig } from '../../lib/googleAdsAuth';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getCurrentUser } from '../../../lib/utils/getCurrentUser';

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
  };
}

interface GoogleAdsResponse {
  results: GoogleAdsKeywordIdea[];
  nextPageToken?: string;
}

// In-memory cache for requests (2 minutes)
const cache = new Map<string, { data: KeywordIdeasResponse; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Rate limiting (3 requests per 5 seconds per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 3;
const RATE_LIMIT_WINDOW = 5 * 1000; // 5 seconds

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
    const { keyword, regionId, languageId, pageSize = 15 } = body;

    // Validate required fields
    if (!keyword || keyword.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: "Keyword is required" } },
        { status: 400 }
      );
    }

    // Create cache key
    const cacheKey = `${keyword.toLowerCase().trim()}-${regionId || 'any'}-${languageId || 'any'}-${pageSize}`;
    
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

    // Build Google Ads API request payload
    const payload: any = {
      keywordSeed: { keywords: [keyword.trim()] },
      keywordPlanNetwork: "GOOGLE_SEARCH",
      pageSize: pageSize,
    };

    // Add optional parameters
    if (regionId && regionId !== "") {
      payload.geoTargetConstants = [`geoTargetConstants/${regionId}`];
    }

    if (languageId && languageId !== "") {
      payload.language = `languageConstants/${languageId}`;
    }

    // Make request to Google Ads API
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
    const googleAdsUrl = `https://googleads.googleapis.com/v19/customers/${customerId}:generateKeywordIdeas`;
    
    // Debug logging
    console.log('Google Ads API Request:', {
      url: googleAdsUrl,
      customerId,
      developerToken: developerToken ? '***' + developerToken.slice(-4) : 'missing',
      accessToken: accessToken ? '***' + accessToken.slice(-8) : 'missing',
      payload
    });
    
    const response = await fetch(googleAdsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': customerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Ads API error:', response.status, errorText);
      
      return NextResponse.json(
        { 
          error: { 
            code: response.status, 
            message: `Google Ads API error: ${response.status}`,
            details: errorText
          } 
        },
        { status: response.status }
      );
    }

    const googleAdsData: GoogleAdsResponse = await response.json();
    
    // Debug logging to see the actual response structure
    console.log('Google Ads API Response:', JSON.stringify(googleAdsData, null, 2));
    
    // Validate response structure
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
    
    // Transform the response with additional safety checks
    const results: KeywordIdea[] = googleAdsData.results.map((item, index) => {
      try {
        if (!item || typeof item !== 'object') {
          console.warn(`Invalid keyword item at index ${index}:`, item);
          return {
            keyword: 'Unknown',
            avgMonthlySearches: 0,
            competitionIndex: 0,
          };
        }
        
        return {
          keyword: item.text || 'Unknown',
          avgMonthlySearches: parseInt(item.keywordIdeaMetrics?.avgMonthlySearches) || 0,
          competitionIndex: parseInt(item.keywordIdeaMetrics?.competitionIndex) || 0,
        };
      } catch (itemError) {
        console.warn(`Error processing keyword item at index ${index}:`, itemError, item);
        return {
          keyword: 'Unknown',
          avgMonthlySearches: 0,
          competitionIndex: 0,
        };
      }
    });

    // Sort by monthly searches (descending)
    results.sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches);

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