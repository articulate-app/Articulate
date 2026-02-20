/**
 * Best-effort registry for in-flight suggestion autosaves.
 * Task planner's approve flow can await these to ensure the latest edits are persisted,
 * without adding any explicit PATCH calls.
 *
 * Currently, the Tasks planner suggestion pane is read-only, so nothing registers here yet.
 * This exists to satisfy the "flushPendingEdits" contract and allow future editable fields.
 */

const inFlightBySourceKey = new Map<string, Promise<unknown>>()

export function registerSuggestionAutosave(sourceKey: string | null, promise: Promise<unknown>) {
  const key = typeof sourceKey === 'string' ? sourceKey.trim() : ''
  if (!key) return
  inFlightBySourceKey.set(key, promise)
  promise.finally(() => {
    if (inFlightBySourceKey.get(key) === promise) {
      inFlightBySourceKey.delete(key)
    }
  })
}

export async function flushPendingEdits(sourceKey: string | null) {
  const key = typeof sourceKey === 'string' ? sourceKey.trim() : ''
  if (!key) return
  const p = inFlightBySourceKey.get(key)
  if (p) await p
}


