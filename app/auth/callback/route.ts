import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const accessToken = requestUrl.searchParams.get('access_token');
  const type = requestUrl.searchParams.get('type');
  const redirect = requestUrl.searchParams.get('redirect');

  if (accessToken) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: '', // Not needed for this flow
    });
  }

  // If this is a password reset, redirect to the update password page
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/update-password', request.url));
  }

  // Redirect to the original target if present
  if (redirect) {
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  // Default: tasks
  return NextResponse.redirect(new URL('/tasks', request.url));
} 