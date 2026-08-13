export type AutoThreadSelectionResolution =
  | { type: "none" }
  | { type: "load-requested-thread"; threadId: string; source: "external" | "url" }
  | { type: "activate-requested-open-tab"; threadId: string; source: "external" | "url" }
  | { type: "bootstrap-scope-thread" }

type ResolveAutoThreadSelectionArgs = {
  isOpen: boolean
  isCreating: boolean
  activeThreadId: string | null
  externalRequestedThreadId: string | null
  urlRequestedThreadId: string | null
  disableUrlSync: boolean
  openTabIds: string[]
}

/**
 * Resolve whether the pane should auto-select a thread from URL/external state.
 *
 * Important: once a thread is selected, keep it locked until the user explicitly
 * changes it (tab click/history pick/new chat) or the address bar `aiThreadId`
 * changes. Background data churn / stale external ids must not hijack selection.
 */
export function resolveAutoThreadSelection({
  isOpen,
  isCreating,
  activeThreadId,
  externalRequestedThreadId,
  urlRequestedThreadId,
  disableUrlSync,
  openTabIds,
}: ResolveAutoThreadSelectionArgs): AutoThreadSelectionResolution {
  if (!isOpen || isCreating) return { type: "none" }

  // Keep external (search opener) as a one-shot initializer only.
  // It should never steal selection after the user/thread state is active.
  // Search opens while a thread is already active must update `aiThreadId` in
  // the URL and leave `disableUrlSync` false so the URL branch below can follow.
  if (activeThreadId) {
    if (disableUrlSync) return { type: "none" }
    if (!urlRequestedThreadId || urlRequestedThreadId === activeThreadId) return { type: "none" }
    if (openTabIds.includes(urlRequestedThreadId)) {
      return { type: "activate-requested-open-tab", threadId: urlRequestedThreadId, source: "url" }
    }
    return { type: "load-requested-thread", threadId: urlRequestedThreadId, source: "url" }
  }

  const requestedThreadId = externalRequestedThreadId ?? urlRequestedThreadId
  const source: "external" | "url" = externalRequestedThreadId ? "external" : "url"
  if (requestedThreadId) {
    if (openTabIds.includes(requestedThreadId)) {
      return { type: "activate-requested-open-tab", threadId: requestedThreadId, source }
    }
    return { type: "load-requested-thread", threadId: requestedThreadId, source }
  }

  return { type: "bootstrap-scope-thread" }
}

/**
 * Whether the active-thread → URL sync effect should write `aiThreadId`.
 * When the address bar already requests a different persisted thread (e.g. search
 * preview click), do not stomp it — the URL→state effect will follow.
 */
export function shouldWriteActiveThreadToUrl(args: {
  activeThreadId: string
  liveThreadId: string | null
  isPersistedThreadId: (value: string) => boolean
}): boolean {
  const { activeThreadId, liveThreadId, isPersistedThreadId } = args
  if (liveThreadId === activeThreadId) return false
  if (liveThreadId && isPersistedThreadId(liveThreadId)) return false
  return true
}
