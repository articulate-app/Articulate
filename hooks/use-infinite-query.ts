'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { PostgrestQueryBuilder } from '@supabase/postgrest-js'
import { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useSyncExternalStore, useCallback } from 'react'

const supabase = createClientComponentClient()

// The following types are used to make the hook type-safe. It extracts the database type from the supabase client.
type SupabaseClientType = typeof supabase

// Utility type to check if the type is any
type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N

// Extracts the database type from the supabase client. If the supabase client doesn't have a type, it will fallback properly.
type Database =
  SupabaseClientType extends SupabaseClient<infer U>
    ? IfAny<
        U,
        {
          public: {
            Tables: Record<string, any>
            Views: Record<string, any>
            Functions: Record<string, any>
          }
        },
        U
      >
    : never

// Change this to the database schema you want to use
type DatabaseSchema = Database['public']

// Extracts the table names from the database type (including views)
type SupabaseTableName = keyof DatabaseSchema['Tables'] | keyof DatabaseSchema['Views']

// Extracts the table definition from the database type (including views)
type SupabaseTableData<T extends SupabaseTableName> = 
  T extends keyof DatabaseSchema['Tables'] 
    ? DatabaseSchema['Tables'][T]['Row']
    : T extends keyof DatabaseSchema['Views']
    ? DatabaseSchema['Views'][T]['Row']
    : never

type SupabaseSelectBuilder<T extends SupabaseTableName> = any

// A function that modifies the query. Can be used to sort, filter, etc. If .range is used, it will be overwritten.
type SupabaseQueryHandler<T extends SupabaseTableName> = (
  query: SupabaseSelectBuilder<T>
) => SupabaseSelectBuilder<T>

interface UseInfiniteQueryProps<T extends SupabaseTableName, Query extends string = '*'> {
  // The table name to query
  tableName: T
  // The columns to select, defaults to `*`
  columns?: string
  // The number of items to fetch per page, defaults to `20`
  pageSize?: number
  // A function that modifies the query. Can be used to sort, filter, etc. If .range is used, it will be overwritten.
  trailingQuery?: SupabaseQueryHandler<T>
  // A key that uniquely identifies the query (e.g., filters)
  queryKey?: string
}

interface StoreState<TData> {
  data: TData[]
  count: number
  isSuccess: boolean
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  hasInitialFetch: boolean
}

type Listener = () => void

// Global registry for AbortControllers by queryKey
const infiniteQueryControllers: Record<string, AbortController[]> = {};
let abortedInfiniteQueryCount = 0;

function registerController(queryKey: string, controller: AbortController) {
  if (!infiniteQueryControllers[queryKey]) infiniteQueryControllers[queryKey] = [];
  infiniteQueryControllers[queryKey].push(controller);
}

export function abortAllInfiniteQueries() {
  let aborted = 0;
  for (const key in infiniteQueryControllers) {
    infiniteQueryControllers[key].forEach(controller => {
      if (!controller.signal.aborted) {
        controller.abort();
        aborted++;
        if (process.env.NODE_ENV === 'development') {
          console.log(`[InfiniteQuery] Aborted queryKey: ${key}`);
        }
      }
    });
    infiniteQueryControllers[key] = [];
  }
  abortedInfiniteQueryCount += aborted;
  if (process.env.NODE_ENV === 'development' && aborted > 0) {
    console.log(`[InfiniteQuery] Total aborted calls: ${abortedInfiniteQueryCount}`);
  }
}

function createStore<TData extends { id?: any; doc_id?: any }, T extends SupabaseTableName>(
  props: UseInfiniteQueryProps<T>
) {
  const { tableName, columns = '*', pageSize = 20, trailingQuery } = props

  let state: StoreState<TData> = {
    data: [],
    count: 0,
    isSuccess: false,
    isLoading: false,
    isFetching: false,
    error: null,
    hasInitialFetch: false,
  }

  const listeners = new Set<Listener>()

  const notify = () => {
    listeners.forEach((listener) => listener())
  }

  const setState = (newState: Partial<StoreState<TData>>) => {
    state = { ...state, ...newState }
    notify()
  }

  const fetchPage = async (skip: number, queryKey: string, externalSignal?: AbortSignal) => {
    console.log('[useInfiniteQuery] fetchPage called for queryKey:', queryKey, 'skip:', skip);
    
    // Guard against duplicate requests
    if (state.isFetching) {
      console.log('[useInfiniteQuery] Already fetching, skipping request');
      return;
    }
    
    // Guard against fetching when we have all data
    if (state.hasInitialFetch && state.count > 0 && state.data.length >= state.count) {
      console.log('[useInfiniteQuery] All data loaded, skipping request');
      return;
    }

    setState({ isFetching: true });

    const controller = new AbortController();
    const signal = externalSignal || controller.signal;
    registerController(queryKey, controller);

    let query = supabase
      .from(tableName)
      .select(columns, { count: 'exact' }) as unknown as SupabaseSelectBuilder<T>;

    if (trailingQuery) {
      query = trailingQuery(query);
    }
    if ('abortSignal' in query && typeof query.abortSignal === 'function') {
      query = query.abortSignal(signal);
    }
    try {
      const { data: newData, count, error } = await query.range(skip, skip + pageSize - 1);
      if (error) {
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[InfiniteQuery] Aborted fetch for queryKey: ${queryKey}`);
          }
        } else {
          console.error('An unexpected error occurred:', error);
        }
        setState({ error });
      } else {
        const deduplicatedData = ((newData || []) as TData[]).filter(
          (item) => !state.data.find((old) => {
            // Handle both id and doc_id fields for documents
            const oldId = (old as any).doc_id || (old as any).id;
            const newId = (item as any).doc_id || (item as any).id;
            return oldId === newId;
          })
        );
        setState({
          data: [...state.data, ...deduplicatedData],
          count: count || 0,
          isSuccess: true,
          error: null,
        });
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[InfiniteQuery] Aborted fetch for queryKey: ${queryKey}`);
        }
      } else {
        console.error('An unexpected error occurred:', err);
      }
      setState({ error: err });
    } finally {
      setState({ isFetching: false });
    }
  };

  const fetchNextPage = async (externalSignal?: AbortSignal) => {
    if (state.isFetching) {
      console.log('[useInfiniteQuery] fetchNextPage: Already fetching, skipping');
      return;
    }
    
    // Check if there's more data to fetch
    const hasMore = state.count === 0 || state.data.length < state.count;
    if (!hasMore) {
      console.log('[useInfiniteQuery] fetchNextPage: No more data to fetch, skipping');
      return;
    }
    
    // Calculate offset based on current data length
    const offset = state.data.length;
    console.log('[useInfiniteQuery] fetchNextPage: offset =', offset, 'data.length =', state.data.length);
    
    await fetchPage(offset, props.queryKey || String(props.tableName), externalSignal);
  };

  const initialize = async () => {
    setState({ isLoading: true, isSuccess: false, data: [] });
    await fetchNextPage();
    setState({ isLoading: false, hasInitialFetch: true });
  };

  return {
    getState: () => state,
    setState,
    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    fetchNextPage,
    initialize,
  }
}

// Empty initial state to avoid hydration errors.
const initialState: any = {
  data: [],
  count: 0,
  isSuccess: false,
  isLoading: false,
  isFetching: false,
  error: null,
  hasInitialFetch: false,
}

// Global registry for stores, keyed by tableName and queryKey
export const storeRegistry: Record<string, any> = {}

function getStoreKey(tableName: string, queryKey?: string) {
  return queryKey ? `${tableName}::${queryKey}` : tableName
}

function registerStore<TData>(tableName: string, queryKey: string | undefined, store: any) {
  const key = getStoreKey(tableName, queryKey)
  storeRegistry[key] = store
}

/**
 * Get an item from the store for a given table and queryKey by ID.
 * Returns the item if found, null otherwise.
 */
export function getItemFromStore<TData extends { id?: any; doc_id?: any }>(
  tableName: string,
  queryKey: string | undefined,
  id: TData['id'] | TData['doc_id']
): TData | null {
  const key = getStoreKey(tableName, queryKey)
  const store = storeRegistry[key]
  if (!store) return null
  const state = store.getState()
  return state.data.find((item: TData) => {
    const itemId = (item as any).doc_id || (item as any).id;
    return itemId === id;
  }) || null
}

/**
 * Update an item in the store for a given table and queryKey.
 * Triggers a re-render in all subscribers.
 */
export function updateItemInStore<TData extends { id?: any; doc_id?: any }>(
  tableName: string,
  queryKey: string | undefined,
  updatedItem: TData
) {
  const key = getStoreKey(tableName, queryKey)
  const store = storeRegistry[key]
  if (!store) return
  const state = store.getState()
  const updatedId = (updatedItem as any).doc_id || (updatedItem as any).id;
  const idx = state.data.findIndex((item: TData) => {
    const itemId = (item as any).doc_id || (item as any).id;
    return itemId === updatedId;
  })
  if (idx === -1) return
  const newData = [...state.data]
  newData[idx] = { ...newData[idx], ...updatedItem }
  store.setState({ data: newData })
}

/**
 * Optimistically add an item to the store for a given table and queryKey.
 * Triggers a re-render in all subscribers.
 */
export function addItemToStore<TData extends { id?: any; doc_id?: any }>(
  tableName: string,
  queryKey: string | undefined,
  newItem: TData
) {
  const key = getStoreKey(tableName, queryKey)
  const store = storeRegistry[key]
  if (!store) return
  const state = store.getState()
  const newId = (newItem as any).doc_id || (newItem as any).id;
  if (state.data.find((item: TData) => {
    const itemId = (item as any).doc_id || (item as any).id;
    return itemId === newId;
  })) return // avoid duplicates
  const newData = [newItem, ...state.data]
  store.setState({ data: newData })
}

/**
 * Remove an item from the store for a given table and queryKey.
 * Triggers a re-render in all subscribers.
 */
export function removeItemFromStore<TData extends { id?: any; doc_id?: any }>(
  tableName: string,
  queryKey: string | undefined,
  id: TData['id'] | TData['doc_id']
) {
  const key = getStoreKey(tableName, queryKey)
  const store = storeRegistry[key]
  if (!store) return
  const state = store.getState()
  const newData = state.data.filter((item: TData) => {
    const itemId = (item as any).doc_id || (item as any).id;
    return itemId !== id;
  })
  store.setState({ data: newData })
}

function useInfiniteQuery<
  TData extends { id?: any; doc_id?: any },
  T extends SupabaseTableName = SupabaseTableName,
>(props: UseInfiniteQueryProps<T>) {
  const storeRef = useRef(createStore<TData, T>(props))
  const prevProps = useRef({
    tableName: props.tableName,
    columns: props.columns,
    pageSize: props.pageSize,
    queryKey: props.queryKey,
  });

  // Register the store globally for cache updates
  useEffect(() => {
    registerStore(props.tableName as string, props.queryKey, storeRef.current)
    // Cleanup on unmount
    return () => {
      const key = getStoreKey(props.tableName as string, props.queryKey)
      delete storeRegistry[key]
    }
  }, [props.tableName, props.queryKey])

  const state = useSyncExternalStore(
    storeRef.current.subscribe,
    () => storeRef.current.getState(),
    () => initialState as StoreState<TData>
  )

  useEffect(() => {
    const hasChanged =
      prevProps.current.tableName !== props.tableName ||
      prevProps.current.columns !== props.columns ||
      prevProps.current.pageSize !== props.pageSize ||
      prevProps.current.queryKey !== props.queryKey;

    if (storeRef.current.getState().hasInitialFetch && hasChanged) {
      storeRef.current = createStore<TData, T>(props);
      // ✅ Re-register the new store in the global registry
      registerStore(props.tableName as string, props.queryKey, storeRef.current);
      prevProps.current = {
        tableName: props.tableName,
        columns: props.columns,
        pageSize: props.pageSize,
        queryKey: props.queryKey,
      };
    }

    if (!state.hasInitialFetch && typeof window !== 'undefined') {
      storeRef.current.initialize();
    }
  }, [props.tableName, props.columns, props.pageSize, props.queryKey, state.hasInitialFetch]);

  // Stable fetchNextPage reference
  const fetchNextPage = useCallback(() => {
    return storeRef.current.fetchNextPage()
  }, [])

  return {
    data: state.data,
    count: state.count,
    isSuccess: state.isSuccess,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    error: state.error,
    hasMore: state.count === 0 || state.data.length < state.count,
    fetchNextPage,
  }
}

export {
  useInfiniteQuery,
  type SupabaseQueryHandler,
  type SupabaseTableData,
  type SupabaseTableName,
  type UseInfiniteQueryProps,
}
