'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessToken = searchParams.get('access_token');
  const type = searchParams.get('type');

  useEffect(() => {
    const handleReset = async () => {
      if (accessToken && type === 'recovery') {
        const supabase = createClientComponentClient();
        
        // Set the session with the access token
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: '', // Not needed for this flow
        });

        if (error) {
          console.error('Error setting session:', error.message);
          return;
        }

        // Redirect to update password page
        router.push('/auth/update-password');
      }
    };

    handleReset();
  }, [accessToken, type, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Processing password reset...
          </h2>
        </div>
      </div>
    </div>
  );
} 