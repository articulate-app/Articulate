import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const redirectUrl = searchParams.get('redirectUrl') ?? '/';

  if (token_hash && type) {
    const supabase = createRouteHandlerClient({ cookies });

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      redirect(redirectUrl); // ✅ Session is now set, redirect to your form
    }
  }

  redirect('/error'); // or wherever you want to send on failure
} 