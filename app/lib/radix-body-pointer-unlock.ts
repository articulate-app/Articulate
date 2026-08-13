/**
 * Radix Dialog / AlertDialog / DropdownMenu can leave
 * `document.body.style.pointerEvents = "none"` after close+unmount races.
 * Call this around menu→dialog handoffs and after confirm actions that navigate away.
 */

export function clearBodyPointerEvents(): void {
  if (typeof document === "undefined") return
  const body = document.body
  if (!body) return
  // Prefer removeProperty so computed style falls back to stylesheet defaults.
  if (body.style.pointerEvents) {
    body.style.removeProperty("pointer-events")
  }
  // Belt-and-suspenders: some Radix versions set the inline value again mid-animation.
  const computed =
    typeof window !== "undefined" ? window.getComputedStyle(body).pointerEvents : ""
  if (computed === "none" && !body.style.pointerEvents) {
    body.style.pointerEvents = "auto"
  }
}

/** Schedule unlocks that survive component unmount (do not store timers in React effects). */
export function scheduleBodyPointerUnlock(
  delaysMs: number[] = [0, 50, 150, 300, 600, 1000],
): number[] {
  clearBodyPointerEvents()
  if (typeof window === "undefined") return []
  return delaysMs.map((ms) => window.setTimeout(clearBodyPointerEvents, ms))
}
