import { NextRequest, NextResponse } from 'next/server';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getCurrentUser } from '../../../../lib/utils/getCurrentUser';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      return NextResponse.json(
        { error: { code: 401, message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const keywordId = parseInt(params.id);
    
    if (isNaN(keywordId)) {
      return NextResponse.json(
        { error: { code: 400, message: "Invalid keyword ID" } },
        { status: 400 }
      );
    }

    const supabase = createClientComponentClient();
    
    // First, verify the keyword belongs to a list owned by the current user
    const { data: keyword, error: fetchError } = await supabase
      .from('keywords')
      .select(`
        id,
        keyword_lists!inner(created_by)
      `)
      .eq('id', keywordId)
      .eq('keyword_lists.created_by', currentUser.id)
      .single();

    if (fetchError || !keyword) {
      return NextResponse.json(
        { error: { code: 404, message: "Keyword not found" } },
        { status: 404 }
      );
    }

    // Delete the keyword
    const { error: deleteError } = await supabase
      .from('keywords')
      .delete()
      .eq('id', keywordId);

    if (deleteError) {
      console.error('Error deleting keyword:', deleteError);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to delete keyword" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/keywords/[id]:', error);
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 }
    );
  }
} 