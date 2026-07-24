/** Placeholder titles shown until Protocol V2 / user rename supplies a real title. */
const PLACEHOLDER_AI_THREAD_TITLES = new Set([
  "",
  "new chat",
  "creating chat...",
  "creating chat…",
])

/** True when the title is empty or still the default "New chat" placeholder. */
export function isPlaceholderAiThreadTitle(title: string | null | undefined): boolean {
  const normalized = (title ?? "").trim().toLowerCase()
  return PLACEHOLDER_AI_THREAD_TITLES.has(normalized)
}
