"use client"

/**
 * AI chats directory — same list + title search as the AI pane clock (HistoryDropdown).
 */

import { useMemo, useRef, type RefObject } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { SearchResultRow } from "./SearchResultRow"
import { ObjectPaneScrollShell, objectPaneCenteredStateClass } from "./object-pane-content"
import type { GlobalSearchDocument } from "../../lib/global-search-types"
import { groupByFriendlyDateBucket } from "../../lib/friendly-date-buckets"
import { mapVisibleAiThreadToSearchDocument } from "../../lib/services/ai-threads-list"
import { useThreads } from "../../../features/ai-chat/hooks"
import type { AiThread } from "../../../features/ai-chat/types"

function getThreadDisplayTitle(title: string | null | undefined): string {
  const normalized = (title ?? "").trim()
  return normalized.length > 0 ? normalized : "New chat"
}

function threadToSearchDocument(thread: AiThread): GlobalSearchDocument {
  return mapVisibleAiThreadToSearchDocument({
    id: thread.id,
    title: thread.title,
    scope: thread.scope,
    visibility: thread.visibility,
    project_id: thread.project_id ?? null,
    task_id: thread.task_id ?? null,
    created_at: thread.created_at,
    last_message_at: thread.last_message_at ?? null,
  })
}

function getAiThreadDate(item: GlobalSearchDocument): string | null {
  const meta = item.display_payload?.meta ?? []
  const lastMessage = meta.find((entry) => (entry.label?.trim() ?? "").toLowerCase() === "last_message_at")
  const created = meta.find((entry) => (entry.label?.trim() ?? "").toLowerCase() === "created_at")
  return (
    lastMessage?.value?.trim() ||
    created?.value?.trim() ||
    (typeof item.raw?.last_message_at === "string" ? item.raw.last_message_at : null) ||
    item.created_at ||
    null
  )
}

function buildRowKey(viewScope: string, groupLabel: string, item: GlobalSearchDocument, index: number): string {
  const id = item.entity_id ?? item.title ?? index
  return `${viewScope}:ai:${groupLabel}:${id}:${index}`
}

export function AiThreadsFullResultsPane({
  onResultSelect,
  viewScope,
  searchQuery = "",
  embedInParentScroll = false,
  scrollRootRef = null,
  scrollClassName,
}: {
  onResultSelect: (item: GlobalSearchDocument) => void
  viewScope: string
  /** Local title filter — same behavior as the clock HistoryDropdown. */
  searchQuery?: string
  embedInParentScroll?: boolean
  scrollRootRef?: RefObject<HTMLElement | null> | null
  scrollClassName?: string
}) {
  const { threads, isLoading, isError } = useThreads()
  const localScrollContainerRef = useRef<HTMLDivElement | null>(null)
  void scrollRootRef

  const trimmedQuery = searchQuery.trim().toLowerCase()

  const filteredThreads = useMemo(() => {
    if (!trimmedQuery) return threads
    return threads.filter((thread) => {
      const title = getThreadDisplayTitle(thread.title)
      return title.toLowerCase().includes(trimmedQuery)
    })
  }, [threads, trimmedQuery])

  const items = useMemo(
    () => filteredThreads.map(threadToSearchDocument),
    [filteredThreads],
  )

  const groupedItems = useMemo(
    () => groupByFriendlyDateBucket(items, (item) => getAiThreadDate(item)),
    [items],
  )

  const body = (() => {
    if (isLoading) {
      return (
        <div className={objectPaneCenteredStateClass()}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AI chats...
        </div>
      )
    }
    if (isError) {
      return (
        <div className={cn(objectPaneCenteredStateClass(), "text-red-500")}>
          Unable to load AI chats.
        </div>
      )
    }
    if (items.length === 0) {
      return (
        <div className={objectPaneCenteredStateClass()}>
          {trimmedQuery ? "No AI chats match your search." : "No AI chats yet."}
        </div>
      )
    }
    return (
      <div className="flex min-h-full flex-col py-1">
        {groupedItems.map((group) => (
          <section key={group.label} className="pt-1">
            <div
              className={cn(
                "sticky top-0 z-10 bg-white/95 py-1.5 text-[11px] font-normal text-gray-400 backdrop-blur-sm",
                embedInParentScroll ? "px-1" : "px-3",
              )}
            >
              {group.label}
            </div>
            <div className={cn(embedInParentScroll && "divide-y divide-gray-100")}>
              {group.items.map((item, index) => (
                <SearchResultRow
                  key={buildRowKey(viewScope, group.label, item, index)}
                  item={item}
                  onSelect={onResultSelect}
                  className={embedInParentScroll ? "h-auto min-h-10 px-1 py-2" : undefined}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  })()

  if (embedInParentScroll) {
    return <div className="min-w-0">{body}</div>
  }
  return (
    <ObjectPaneScrollShell scrollRef={localScrollContainerRef} className={scrollClassName}>
      {body}
    </ObjectPaneScrollShell>
  )
}
