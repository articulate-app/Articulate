import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export interface CurrentUser {
  id: number;
  full_name: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const supabase = createClientComponentClient();
    
    // Get the current auth user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      console.error('Error getting auth user:', authError);
      return null;
    }

    // Get the user from the database using auth_user_id
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('auth_user_id', authUser.id)
      .single();

    if (dbError || !dbUser) {
      console.error('Error getting database user:', dbError);
      return null;
    }

    return {
      id: dbUser.id,
      full_name: dbUser.full_name,
    };
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return null;
  }
} 