import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');

  if (!code) {
    return NextResponse.redirect(new URL('/auth?error=Invalid reset link', request.url));
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  
  if (error) {
    return NextResponse.redirect(new URL('/auth?error=Invalid or expired reset link', request.url));
  }

  // Verify we have a valid session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/auth?error=Session not found', request.url));
  }

  // If this is a password reset, redirect to the update password page
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/update-password', request.url));
  }

  // Default redirect to home
  return NextResponse.redirect(new URL('/', request.url));
} 