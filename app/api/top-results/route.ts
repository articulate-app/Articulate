import { NextRequest, NextResponse } from 'next/server';

// In-memory cache for top results
const topResultsCache = new Map<string, { results: any[], params: any, timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Language mapping (user-friendly names → CSE lr)
const languageMapping: Record<string, string> = {
  'English': 'lang_en',
  'Portuguese': 'lang_pt',
  'Spanish': 'lang_es',
  'French': 'lang_fr',
  'German': 'lang_de',
};

// Region mapping (user-friendly names → CSE cr)
const regionMapping: Record<string, string> = {
  'United States': 'countryUS',
  'United Kingdom': 'countryGB',
  'Portugal': 'countryPT',
  'Spain': 'countryES',
  'Brazil': 'countryBR',
  'Germany': 'countryDE',
  'France': 'countryFR',
};

interface TopResultsRequest {
  q: string;
  languageId?: string | number;
  regionId?: string | number;
}

interface TopResultsResponse {
  results: Array<{
    title: string;
    link: string;
    displayLink: string;
  }>;
  params: {
    lr?: string;
    cr?: string;
  };
  q: string;
  paramsUsed: string;
  serpKey: string;
}

function getCacheKey(q: string, languageId?: string | number, regionId?: string | number): string {
  const lr = languageId ? languageMapping[languageId.toString()] || '' : '';
  const cr = regionId ? regionMapping[regionId.toString()] || '' : '';
  return `${q.toLowerCase().trim()}|${lr}|${cr}`;
}

function getCSEParams(languageId?: string | number, regionId?: string | number) {
  const params: { lr?: string; cr?: string } = {};
  
  if (languageId && languageId !== '') {
    const lr = languageMapping[languageId.toString()];
    if (lr) params.lr = lr;
  }
  
  if (regionId && regionId !== '') {
    const cr = regionMapping[regionId.toString()];
    if (cr) params.cr = cr;
  }
  
  return params;
}

export async function POST(request: NextRequest) {
  try {
    const body: TopResultsRequest = await request.json();
    const { q, languageId, regionId } = body;

    // Validate required fields
    if (!q || !q.trim()) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(q, languageId, regionId);
    const cached = topResultsCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        ...cached,
        q: q.trim(),
        paramsUsed: buildParamsUsedString(q.trim(), languageId, regionId),
        serpKey: cacheKey,
      });
    }

    // Get CSE parameters
    const cseParams = getCSEParams(languageId, regionId);
    
    // Build CSE URL with GET parameters
    const searchParams = new URLSearchParams({
      key: process.env.GOOGLE_CSE_API_KEY!,
      cx: process.env.GOOGLE_CSE_CX!,
      q: q.trim(),
      num: '10',
      start: '1',
    });

    // Only add lr and cr if they have values
    if (cseParams.lr) searchParams.append('lr', cseParams.lr);
    if (cseParams.cr) searchParams.append('cr', cseParams.cr);

    const cseUrl = `https://www.googleapis.com/customsearch/v1?${searchParams.toString()}`;

    // Fetch from Google CSE with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(cseUrl, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Google CSE API error:', errorData);
      
      return NextResponse.json(
        { 
          error: 'Failed to fetch search results',
          details: errorData.error?.message || 'Unknown error'
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Transform results
    const results = (data.items || []).map((item: any) => ({
      title: item.title || '',
      link: item.link || '',
      displayLink: item.displayLink || new URL(item.link || '').hostname || '',
    }));

    const paramsUsed = buildParamsUsedString(q.trim(), languageId, regionId);

    const responseData: TopResultsResponse = {
      results,
      params: cseParams,
      q: q.trim(),
      paramsUsed,
      serpKey: cacheKey,
    };

    // Cache the results
    topResultsCache.set(cacheKey, {
      results,
      params: cseParams,
      timestamp: Date.now(),
    });

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error('Top results API error:', error);
    
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out. Please try again.' },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function buildParamsUsedString(q: string, languageId?: string | number, regionId?: string | number): string {
  const params = new URLSearchParams({
    q,
    num: '10',
    start: '1',
    key: 'REDACTED',
    cx: 'REDACTED',
  });

  const cseParams = getCSEParams(languageId, regionId);
  if (cseParams.lr) params.append('lr', cseParams.lr);
  if (cseParams.cr) params.append('cr', cseParams.cr);

  return params.toString();
} 