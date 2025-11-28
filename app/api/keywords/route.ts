import { NextRequest, NextResponse } from 'next/server';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getCurrentUser } from '../../../lib/utils/getCurrentUser';
import type { CreateKeywordRequest, KeywordsResponse } from '../../../lib/types/keyword';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json(
        { error: { code: 401, message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('listId');

    if (!listId) {
      return NextResponse.json(
        { error: { code: 400, message: "listId parameter is required" } },
        { status: 400 }
      );
    }

    const parsedListId = parseInt(listId);
    
    if (isNaN(parsedListId)) {
      return NextResponse.json(
        { error: { code: 400, message: "Invalid listId parameter" } },
        { status: 400 }
      );
    }

    const supabase = createClientComponentClient();
    
    // First, verify the list belongs to the current user
    const { data: list, error: listError } = await supabase
      .from('keyword_lists')
      .select('id')
      .eq('id', parsedListId)
      .eq('created_by', currentUser.id)
      .single();

    if (listError || !list) {
      return NextResponse.json(
        { error: { code: 404, message: "Keyword list not found" } },
        { status: 404 }
      );
    }

    // Fetch keywords for the list
    const { data: keywords, error } = await supabase
      .from('keywords')
      .select('*')
      .eq('list_id', parsedListId)
      .order('added_at', { ascending: false });

    if (error) {
      console.error('Error fetching keywords:', error);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to fetch keywords" } },
        { status: 500 }
      );
    }

    const response: KeywordsResponse = {
      keywords: keywords || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/keywords:', error);
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

    const body: CreateKeywordRequest = await request.json();
    const { list_id, keyword, avg_monthly_searches, competition_index } = body;

    if (!list_id || !keyword || keyword.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: "list_id and keyword are required" } },
        { status: 400 }
      );
    }

    const supabase = createClientComponentClient();
    
    // First, verify the list belongs to the current user
    const { data: list, error: listError } = await supabase
      .from('keyword_lists')
      .select('id')
      .eq('id', list_id)
      .eq('created_by', currentUser.id)
      .single();

    if (listError || !list) {
      return NextResponse.json(
        { error: { code: 404, message: "Keyword list not found" } },
        { status: 404 }
      );
    }

    // Add the keyword to the list
    const { data: newKeyword, error } = await supabase
      .from('keywords')
      .insert({
        list_id,
        keyword: keyword.trim(),
        avg_monthly_searches,
        competition_index,
        added_by: currentUser.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding keyword:', error);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to add keyword" } },
        { status: 500 }
      );
    }

    return NextResponse.json(newKeyword);
  } catch (error) {
    console.error('Error in POST /api/keywords:', error);
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 }
    );
  }
} 