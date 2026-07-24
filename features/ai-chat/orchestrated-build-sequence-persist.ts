/**
 * Persist orchestrated-build poll cursors so refresh resumes without replaying events.
 * Keyed by build_id → last processed `after_sequence`.
 * Cleared only when the build leaves active tracking (not on every terminal snapshot),
 * so an in-flight refresh still resumes correctly.
 */

const STORAGE_KEY = "ai_orchestrated_build_after_sequence_v1"

/** In-memory fallback when localStorage is unavailable (SSR / test). */
const memoryFallback: Record<string, number> = {}

function readMap(): Record<string, number> {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return { ...memoryFallback }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...memoryFallback }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...memoryFallback }
    const out: Record<string, number> = { ...memoryFallback }
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        out[key] = Math.trunc(value)
      }
    }
    return out
  } catch {
    return { ...memoryFallback }
  }
}

function writeMap(map: Record<string, number>): void {
  Object.keys(memoryFallback).forEach((key) => {
    delete memoryFallback[key]
  })
  Object.assign(memoryFallback, map)
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota / private mode — memory fallback still holds */
  }
}

export function loadPersistedBuildAfterSequence(buildId: string): number {
  const id = buildId.trim()
  if (!id) return 0
  return readMap()[id] ?? 0
}

export function persistBuildAfterSequence(buildId: string, afterSequence: number): void {
  const id = buildId.trim()
  if (!id) return
  const next = Math.max(0, Math.trunc(afterSequence))
  const map = readMap()
  if (map[id] === next) return
  map[id] = next
  writeMap(map)
}

export function clearPersistedBuildAfterSequence(buildId: string): void {
  const id = buildId.trim()
  if (!id) return
  const map = readMap()
  if (!(id in map)) return
  delete map[id]
  writeMap(map)
}
