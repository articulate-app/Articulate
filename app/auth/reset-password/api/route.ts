import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');
  const accessToken = requestUrl.searchParams.get('access_token');

  console.log('Reset password request:', { 
    code: !!code, 
    type, 
    accessToken: !!accessToken,
    host: requestUrl.host 
  });

  if (!code && !accessToken) {
    console.log('No code or access_token provided');
    return NextResponse.redirect(new URL('/auth?error=Invalid reset link', request.url), { status: 302 });
  }

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  
  try {
    let session;
    
    if (accessToken) {
      // If we have an access token, set the session directly
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: '', // Not needed for this flow
      });
      
      if (error) {
        console.error('Session set error:', error);
        return NextResponse.redirect(new URL('/auth?error=Could not establish session', request.url), { status: 302 });
      }
      
      session = data.session;
      console.log('Session set with access token:', session);
    } else {
      // Exchange the code for a session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code!);
      
      if (error) {
        console.error('Code exchange error:', error);
        return NextResponse.redirect(new URL('/auth?error=Invalid or expired reset link', request.url), { status: 302 });
      }
      
      session = data.session;
      console.log('Code exchange successful:', session);
    }

    // Verify the session was properly set
    const { data: { session: verifiedSession }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session verification error:', sessionError);
      return NextResponse.redirect(new URL('/auth?error=Could not verify session', request.url), { status: 302 });
    }

    if (!verifiedSession) {
      console.error('No session found after exchange/set');
      return NextResponse.redirect(new URL('/auth?error=Could not establish session', request.url), { status: 302 });
    }

    console.log('Session verified:', verifiedSession);

    // If this is a password reset, redirect to the update password page
    if (type === 'recovery') {
      const updatePasswordUrl = new URL('/auth/update-password', request.url);
      if (code) updatePasswordUrl.searchParams.set('code', code);
      if (accessToken) updatePasswordUrl.searchParams.set('access_token', accessToken);
      
      // Ensure we're using the correct domain
      if (requestUrl.host.startsWith('www.')) {
        updatePasswordUrl.host = 'app.whyarticulate.com';
      }
      
      return NextResponse.redirect(updatePasswordUrl, { status: 302 });
    }

    // Default redirect to home
    return NextResponse.redirect(new URL('/', request.url), { status: 302 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.redirect(new URL('/auth?error=An unexpected error occurred', request.url), { status: 302 });
  }
} 