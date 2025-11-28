import { NextRequest, NextResponse } from 'next/server';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getCurrentUser } from '../../../../lib/utils/getCurrentUser';

export async function PUT(
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

    const listId = parseInt(params.id);
    
    if (isNaN(listId)) {
      return NextResponse.json(
        { error: { code: 400, message: "Invalid list ID" } },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, notes } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 400, message: "Name is required" } },
        { status: 400 }
      );
    }

    const supabase = createClientComponentClient();
    
    // First, verify the list belongs to the current user
    const { data: existingList, error: fetchError } = await supabase
      .from('keyword_lists')
      .select('id')
      .eq('id', listId)
      .eq('created_by', currentUser.id)
      .single();

    if (fetchError || !existingList) {
      return NextResponse.json(
        { error: { code: 404, message: "Keyword list not found" } },
        { status: 404 }
      );
    }

    // Update the list
    const { data: updatedList, error: updateError } = await supabase
      .from('keyword_lists')
      .update({
        name: name.trim(),
        notes: notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listId)
      .eq('created_by', currentUser.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating keyword list:', updateError);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to update keyword list" } },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedList);
  } catch (error) {
    console.error('Error in PUT /api/keyword-lists/[id]:', error);
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 }
    );
  }
}

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

    const listId = parseInt(params.id);
    
    if (isNaN(listId)) {
      return NextResponse.json(
        { error: { code: 400, message: "Invalid list ID" } },
        { status: 400 }
      );
    }

    const supabase = createClientComponentClient();
    
    // First, verify the list belongs to the current user
    const { data: existingList, error: fetchError } = await supabase
      .from('keyword_lists')
      .select('id')
      .eq('id', listId)
      .eq('created_by', currentUser.id)
      .single();

    if (fetchError || !existingList) {
      return NextResponse.json(
        { error: { code: 404, message: "Keyword list not found" } },
        { status: 404 }
      );
    }

    // Delete the list (keywords will be cascade deleted)
    const { error: deleteError } = await supabase
      .from('keyword_lists')
      .delete()
      .eq('id', listId)
      .eq('created_by', currentUser.id);

    if (deleteError) {
      console.error('Error deleting keyword list:', deleteError);
      return NextResponse.json(
        { error: { code: 500, message: "Failed to delete keyword list" } },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/keyword-lists/[id]:', error);
    return NextResponse.json(
      { error: { code: 500, message: "Internal server error" } },
      { status: 500 }
    );
  }
} 