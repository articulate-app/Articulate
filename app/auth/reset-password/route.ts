import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessToken = url.searchParams.get('access_token');
  const type = url.searchParams.get('type');

  if (accessToken) {
    const supabase = createRouteHandlerClient({ cookies });
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: '',
    });
  }

  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/update-password', request.url));
  }

  return NextResponse.redirect(new URL('/dashboard', request.url));
} 