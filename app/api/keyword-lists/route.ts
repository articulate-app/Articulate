import { NextRequest, NextResponse } from 'next/server';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getCurrentUser } from '../../../lib/utils/getCurrentUser';
import type { CreateKeywordListRequest, KeywordListsResponse } from '../../../lib/types/keyword';

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
    
    const { data: lists, error } = await supabase
      .from('keyword_lists')
      .select('*')
      .eq('created_by', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching keyword lists:', error);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to fetch keyword lists" } },
        { status: 500 }
      );
    }

    const response: KeywordListsResponse = {
      lists: lists || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/keyword-lists:', error);
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

    const body: CreateKeywordListRequest = await request.json();
    const { name, notes } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: "Name is required" } },
        { status: 400 }
      );
    }

    const supabase = createClientComponentClient();
    
    const { data: newList, error } = await supabase
      .from('keyword_lists')
      .insert({
        name: name.trim(),
        notes: notes?.trim() || null,
        created_by: currentUser.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating keyword list:', error);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to create keyword list" } },
        { status: 500 }
      );
    }

    return NextResponse.json(newList);
  } catch (error) {
    console.error('Error in POST /api/keyword-lists:', error);
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 }
    );
  }
} 