import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { abortAllInfiniteQueries } from '../../hooks/use-infinite-query';

let cancelledQueryCount = 0;

export function useCancelQueriesOnRouteChange() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPath.current) {
      queryClient.cancelQueries();
      abortAllInfiniteQueries();
      cancelledQueryCount++;
      if (process.env.NODE_ENV === "development") {
        console.log(`[useCancelQueriesOnRouteChange] Cancelled queries on route change (${cancelledQueryCount} times)`);
      }
    }
    prevPath.current = pathname;
  }, [pathname, queryClient]);
}
