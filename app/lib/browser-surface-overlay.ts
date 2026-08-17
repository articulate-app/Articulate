/**
 * While chrome overlays (e.g. workspace `+` menu) are open, suppress native BrowserView /
 * live-view iframes so the menu is not painted underneath them.
 */

type Listener = () => void

let overlayCount = 0
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

/** Call while an overlay that must appear above the browser surface is open. */
export function acquireBrowserSurfaceOverlay(): () => void {
  overlayCount += 1
  notify()
  let released = false
  return () => {
    if (released) return
    released = true
    overlayCount = Math.max(0, overlayCount - 1)
    notify()
  }
}

export function isBrowserSurfaceOverlayActive(): boolean {
  return overlayCount > 0
}

export function subscribeBrowserSurfaceOverlay(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
