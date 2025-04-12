import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');

  console.log('Reset password request:', { code, type });

  if (!code) {
    console.log('No code provided');
    return NextResponse.redirect(new URL('/auth?error=Invalid reset link', request.url));
  }

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  
  try {
    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('Code exchange error:', error);
      return NextResponse.redirect(new URL('/auth?error=Invalid or expired reset link', request.url));
    }

    console.log('Code exchange successful:', data);

    // If this is a password reset, redirect to the update password page
    if (type === 'recovery') {
      const updatePasswordUrl = new URL('/auth/update-password', request.url);
      updatePasswordUrl.searchParams.set('code', code);
      return NextResponse.redirect(updatePasswordUrl);
    }

    // Default redirect to home
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.redirect(new URL('/auth?error=An unexpected error occurred', request.url));
  }
} 