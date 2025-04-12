import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const accessToken = requestUrl.searchParams.get('access_token');
  const type = requestUrl.searchParams.get('type');

  console.log('🔐 Reset password request:', { code: !!code, accessToken: !!accessToken, type });

  const supabase = createRouteHandlerClient({ cookies });

  try {
    if (accessToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: '',
      });
      if (error) {
        console.error('Session set error:', error);
        throw error;
      }
      console.log('🔐 Session set with access token');
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error('Code exchange error:', error);
        throw error;
      }
      console.log('🔐 Code exchanged for session');
    } else {
      console.error('No code or access token provided');
      return NextResponse.redirect(new URL('/auth?error=missing-token', request.url));
    }

    // Verify the session was properly set
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session verification error:', sessionError);
      throw sessionError;
    }

    if (!session) {
      console.error('No session found after exchange/set');
      throw new Error('No session found');
    }

    console.log('🔐 Session verified:', session);

    // Redirect to update password page
    const updatePasswordUrl = new URL('/auth/update-password', request.url);
    if (code) updatePasswordUrl.searchParams.set('code', code);
    if (accessToken) updatePasswordUrl.searchParams.set('access_token', accessToken);
    return NextResponse.redirect(updatePasswordUrl);
  } catch (error) {
    console.error('🔐 Session exchange failed:', error);
    return NextResponse.redirect(new URL('/auth?error=unexpected', request.url));
  }
} 