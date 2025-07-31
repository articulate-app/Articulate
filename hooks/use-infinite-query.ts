'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { PostgrestQueryBuilder } from '@supabase/postgrest-js'
import { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useSyncExternalStore } from 'react'

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

// Extracts the table names from the database type
type SupabaseTableName = keyof DatabaseSchema['Tables']

// Extracts the table definition from the database type
type SupabaseTableData<T extends SupabaseTableName> = DatabaseSchema['Tables'][T]['Row']

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

function createStore<TData extends { id: any }, T extends SupabaseTableName>(
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
    if (state.hasInitialFetch && (state.isFetching || state.count <= state.data.length)) return;

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
          (item) => !state.data.find((old) => old.id === item.id)
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
    if (state.isFetching) return;
    await fetchPage(state.data.length, props.queryKey || String(props.tableName), externalSignal);
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
 * Update an item in the store for a given table and queryKey.
 * Triggers a re-render in all subscribers.
 */
export function updateItemInStore<TData extends { id: any }>(
  tableName: string,
  queryKey: string | undefined,
  updatedItem: TData
) {
  const key = getStoreKey(tableName, queryKey)
  const store = storeRegistry[key]
  if (!store) return
  const state = store.getState()
  const idx = state.data.findIndex((item: TData) => item.id === updatedItem.id)
  if (idx === -1) return
  const newData = [...state.data]
  newData[idx] = { ...newData[idx], ...updatedItem }
  store.setState({ data: newData })
}

/**
 * Optimistically add an item to the store for a given table and queryKey.
 * Triggers a re-render in all subscribers.
 */
export function addItemToStore<TData extends { id: any }>(
  tableName: string,
  queryKey: string | undefined,
  newItem: TData
) {
  const key = getStoreKey(tableName, queryKey)
  const store = storeRegistry[key]
  if (!store) return
  const state = store.getState()
  if (state.data.find((item: TData) => item.id === newItem.id)) return // avoid duplicates
  const newData = [newItem, ...state.data]
  store.setState({ data: newData })
}

/**
 * Remove an item from the store for a given table and queryKey.
 * Triggers a re-render in all subscribers.
 */
export function removeItemFromStore<TData extends { id: any }>(
  tableName: string,
  queryKey: string | undefined,
  id: TData['id']
) {
  const key = getStoreKey(tableName, queryKey)
  const store = storeRegistry[key]
  if (!store) return
  const state = store.getState()
  const newData = state.data.filter((item: TData) => item.id !== id)
  store.setState({ data: newData })
}

function useInfiniteQuery<
  TData extends { id: any },
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

  return {
    data: state.data,
    count: state.count,
    isSuccess: state.isSuccess,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    error: state.error,
    hasMore: state.count > state.data.length,
    fetchNextPage: storeRef.current.fetchNextPage,
  }
}

export {
  useInfiniteQuery,
  type SupabaseQueryHandler,
  type SupabaseTableData,
  type SupabaseTableName,
  type UseInfiniteQueryProps,
}
