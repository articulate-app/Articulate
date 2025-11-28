import { NextRequest, NextResponse } from 'next/server';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getCurrentUser } from '../../../lib/utils/getCurrentUser';
import type { CreateSearchHistoryRequest, SearchHistoryResponse } from '../../../lib/types/keyword';

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json(
        { error: { code: 401, message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const supabase = createClientComponentClient();
    
    const { data: history, error } = await supabase
      .from('keyword_search_history')
      .select('*')
      .eq('searched_by', currentUser.id)
      .order('searched_at', { ascending: false })
      .limit(50); // Limit to most recent 50 searches

    if (error) {
      console.error('Error fetching search history:', error);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to fetch search history" } },
        { status: 500 }
      );
    }

    const response: SearchHistoryResponse = {
      history: history || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/keyword-search-history:', error);
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json(
        { error: { code: 401, message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const body: CreateSearchHistoryRequest = await request.json();
    const { term, region, language } = body;

    if (!term || term.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: "Search term is required" } },
        { status: 400 }
      );
    }

    const supabase = createClientComponentClient();
    
    const { data: newHistory, error } = await supabase
      .from('keyword_search_history')
      .insert({
        term: term.trim(),
        region: region?.trim() || null,
        language: language?.trim() || null,
        searched_by: currentUser.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error logging search history:', error);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to log search history" } },
        { status: 500 }
      );
    }

    return NextResponse.json(newHistory);
  } catch (error) {
    console.error('Error in POST /api/keyword-search-history:', error);
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 }
    );
  }
} 