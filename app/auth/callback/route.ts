import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const accessToken = requestUrl.searchParams.get('access_token');
  const type = requestUrl.searchParams.get('type');

  if (accessToken) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: '', // Not needed for this flow
    });
  }

  // If this is a password reset, redirect to the reset password page
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/reset-password', request.url));
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL('/dashboard', request.url));
} 