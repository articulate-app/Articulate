'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icons } from '@/components/icons';

export default function ResetPasswordPage() {
  const router = useRouter();

  useEffect(() => {
    // This page will be briefly shown while the route handler processes the code
    // and redirects to the appropriate page
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <Icons.spinner className="h-8 w-8 animate-spin" />
        <p className="text-sm text-muted-foreground">Processing reset link...</p>
      </div>
    </div>
  );
} 