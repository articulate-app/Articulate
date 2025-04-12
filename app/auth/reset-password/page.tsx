'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icons } from '@/components/icons';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const type = searchParams.get('type');

    console.log('Reset password page params:', { code, type });

    if (code) {
      // Construct the full URL for the API route
      const apiUrl = new URL('/api/auth/reset-password', window.location.origin);
      apiUrl.searchParams.set('code', code);
      if (type) apiUrl.searchParams.set('type', type);
      
      console.log('Redirecting to:', apiUrl.toString());
      router.push(apiUrl.toString());
    }
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <Icons.spinner className="h-8 w-8 animate-spin" />
        <p className="text-sm text-muted-foreground">Processing reset link...</p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Icons.spinner className="h-8 w-8 animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
} 