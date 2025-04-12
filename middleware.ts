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

  // Create a Supabase client with the correct configuration
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Log the current path and session status for debugging
  console.log('🔐 Middleware hit:', {
    path: pathname,
    hasSession: session ? '✅' : '❌',
    cookies: req.cookies.getAll().map(c => c.name),
    url: req.url
  });

  // Allow public paths to continue without authentication check
  if (publicPaths.some(path => pathname.startsWith(path))) {
    console.log('🔐 Allowing access to public path:', pathname);
    return res;
  }

  // If user is not signed in and the current path is not public,
  // redirect the user to /auth
  if (!session) {
    console.log('🔐 No session found, redirecting to auth');
    return NextResponse.redirect(new URL('/auth', req.url));
  }

  // If user is signed in and the current path is /auth,
  // redirect the user to /dashboard
  if (session && pathname === '/auth') {
    console.log('🔐 User is signed in, redirecting to dashboard');
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}; 