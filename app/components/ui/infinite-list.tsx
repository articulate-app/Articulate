"use client"

import React from "react"
import { cn } from "@/lib/utils"
import {
  SupabaseQueryHandler,
  SupabaseTableData,
  useInfiniteQuery,
  SupabaseTableName,
} from "../../../hooks/use-infinite-query"

/**
 * Props for the InfiniteList component.
 */
export interface InfiniteListProps<TableName extends SupabaseTableName, TData = SupabaseTableData<TableName>> {
  tableName: TableName
  columns?: string
  pageSize?: number
  trailingQuery?: SupabaseQueryHandler<TableName>
  className?: string
  renderNoResults?: () => React.ReactNode
  renderEndMessage?: () => React.ReactNode
  renderSkeleton?: (count: number) => React.ReactNode
  /**
   * Render prop that receives the data array and meta (isFetching, hasMore)
   */
  children: (data: TData[], meta: { isFetching: boolean; hasMore: boolean }) => React.ReactNode
  /**
   * Whether this list is being rendered inside a table
   */
  isTableBody?: boolean
  /**
   * Optional queryKey for cache/cancellation
   */
  queryKey?: string
}

const DefaultNoResults = () => (
  <div className="text-center text-muted-foreground py-10">No results.</div>
)

const DefaultEndMessage = () => (
  <div className="text-center text-muted-foreground py-4 text-sm">You&apos;ve reached the end.</div>
)

const defaultSkeleton = (count: number) => (
  <div className="flex flex-col gap-2 px-4">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="h-4 w-full bg-muted animate-pulse" />
    ))}
  </div>
)

/**
 * Generic, reusable infinite list component for Supabase tables.
 * Handles infinite scroll, loading, and empty states.
 *
 * @template TableName - The Supabase table name type.
 */
export function InfiniteList<TableName extends SupabaseTableName, TData = SupabaseTableData<TableName>>({
  tableName,
  columns = '*',
  pageSize = 20,
  trailingQuery,
  className,
  renderNoResults = DefaultNoResults,
  renderEndMessage = DefaultEndMessage,
  renderSkeleton = defaultSkeleton,
  children,
  isTableBody = false,
  queryKey,
}: InfiniteListProps<TableName, TData>) {
  const { data, isFetching, hasMore, fetchNextPage, isSuccess } = useInfiniteQuery({
    tableName,
    columns,
    pageSize,
    trailingQuery,
    queryKey,
  })

  // Ref for the scrolling container
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  // Intersection observer logic - target the last rendered *item* or a dedicated sentinel
  const loadMoreSentinelRef = React.useRef<HTMLDivElement>(null)
  const observer = React.useRef<IntersectionObserver | null>(null)

  React.useEffect(() => {
    if (observer.current) observer.current.disconnect()

    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetching) {
          fetchNextPage()
        }
      },
      {
        root: scrollContainerRef.current, // Use the scroll container for scroll detection
        threshold: 0.1, // Trigger when 10% of the target is visible
        rootMargin: '0px 0px 100px 0px', // Trigger loading a bit before reaching the end
      }
    )

    if (loadMoreSentinelRef.current) {
      observer.current.observe(loadMoreSentinelRef.current)
    }

    return () => {
      if (observer.current) observer.current.disconnect()
    }
  }, [isFetching, hasMore, fetchNextPage])

  const content = (
    <>
      {isSuccess && data.length === 0 && renderNoResults()}
      {children(data as any[], { isFetching, hasMore })}
      {isFetching && renderSkeleton && renderSkeleton(pageSize)}
      <div ref={loadMoreSentinelRef} style={{ height: '1px' }} />
      {!hasMore && data.length > 0 && renderEndMessage()}
    </>
  )

  if (isTableBody) {
    return content
  }

  return (
    <div ref={scrollContainerRef} className={cn('relative h-full overflow-auto', className)}>
      {content}
    </div>
  )
} 