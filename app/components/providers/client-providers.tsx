'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useCancelQueriesOnRouteChange } from '../../hooks/use-cancel-queries-on-route-change';

function QueryCancelProvider() {
  useCancelQueriesOnRouteChange();
  return null;
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
      },
    },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <QueryCancelProvider />
      {children}
    </QueryClientProvider>
  );
} 