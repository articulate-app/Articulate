'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useCancelQueriesOnRouteChange } from '../../hooks/use-cancel-queries-on-route-change';

function QueryCancelProvider() {
  useCancelQueriesOnRouteChange();
  return null;
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <QueryCancelProvider />
      {children}
    </QueryClientProvider>
  );
} 