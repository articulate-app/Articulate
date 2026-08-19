type SurfaceClaim = {
  ownerId: string
  priority: number
  claimedAt: number
}

const claimsByBrowser = new Map<string, SurfaceClaim[]>()
const listenersByBrowser = new Map<string, Set<() => void>>()

function emit(browserId: string) {
  const listeners = listenersByBrowser.get(browserId)
  if (!listeners) return
  for (const listener of listeners) listener()
}

function winningClaim(browserId: string): SurfaceClaim | null {
  const claims = claimsByBrowser.get(browserId)
  if (!claims || claims.length === 0) return null
  return [...claims].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return b.claimedAt - a.claimedAt
  })[0] ?? null
}

export function getDesktopBrowserSurfaceOwner(browserId: string): string | null {
  return winningClaim(browserId)?.ownerId ?? null
}

export function isDesktopBrowserSurfaceOwner(browserId: string, ownerId: string): boolean {
  return getDesktopBrowserSurfaceOwner(browserId) === ownerId
}

export function subscribeDesktopBrowserSurfaceOwner(
  browserId: string,
  listener: () => void,
): () => void {
  const existing = listenersByBrowser.get(browserId) ?? new Set<() => void>()
  existing.add(listener)
  listenersByBrowser.set(browserId, existing)
  return () => {
    const next = listenersByBrowser.get(browserId)
    if (!next) return
    next.delete(listener)
    if (next.size === 0) listenersByBrowser.delete(browserId)
  }
}

export function claimDesktopBrowserSurface(
  browserId: string,
  ownerId: string,
  priority: number,
): () => void {
  if (!browserId || !ownerId) return () => undefined
  const remaining = (claimsByBrowser.get(browserId) ?? []).filter((claim) => claim.ownerId !== ownerId)
  remaining.push({ ownerId, priority, claimedAt: Date.now() })
  claimsByBrowser.set(browserId, remaining)
  emit(browserId)
  return () => {
    const next = (claimsByBrowser.get(browserId) ?? []).filter((claim) => claim.ownerId !== ownerId)
    if (next.length === 0) claimsByBrowser.delete(browserId)
    else claimsByBrowser.set(browserId, next)
    emit(browserId)
  }
}

export const DESKTOP_BROWSER_SURFACE_PRIORITY = {
  chat: 1,
  pane: 2,
  overlay: 3,
} as const
