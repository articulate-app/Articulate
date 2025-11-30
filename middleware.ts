import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;
  
  // Define public paths that don't require authentication
  const publicPaths = [
    '/auth',
    '/auth/reset-password',
    '/auth/update-password',
    '/auth/callback',
    '/api/auth',
  ];

  // Allow public paths to continue without authentication check
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return res;
  }

  try {
    // Create a Supabase client with the correct configuration
    const supabase = createMiddlewareClient({ req, res });

    // Get the session
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    // Log session state for debugging
    console.log('Middleware session check:', {
      pathname,
      hasSession: !!session,
      sessionError: sessionError?.message,
      userId: session?.user?.id
    });

    // If there's a session error, log it but don't block the request
    if (sessionError) {
      console.error('Session error:', sessionError);
    }

    // If user is not signed in and the current path is not public,
    // redirect the user to /auth
    if (!session && !publicPaths.some(path => pathname.startsWith(path))) {
      const redirectUrl = new URL('/auth', req.url);
      // Preserve the full path and query string
      const fullPath = req.nextUrl.pathname + req.nextUrl.search;
      redirectUrl.searchParams.set('redirect', fullPath);
      return NextResponse.redirect(redirectUrl);
    }

    // If user is signed in and the current path is /auth,
    // redirect the user to /tasks
    if (session && pathname === '/auth') {
      const redirectUrl = new URL('/tasks', req.url);
      return NextResponse.redirect(redirectUrl);
    }

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    // In case of error, allow the request to continue
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}; 