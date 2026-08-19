/** Non-React helpers for artifact chips in markdown/HTML (safe for marked / SSR). */

export const ARTIFACT_FILE_CHIP_CLASS =
  "ai-msg-entity-chip ai-msg-artifact-file-chip my-1 mr-1.5 inline-flex min-w-0 max-w-[260px] cursor-pointer select-none items-center gap-2.5 align-middle rounded-2xl border border-gray-200 bg-white px-2.5 py-2 text-left text-[13px] font-medium leading-snug text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] no-underline transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white"

/** Inline SVG for markdown/HTML entity chips (no React). */
export function artifactDocumentGlyphHtml(): string {
  return (
    `<span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700" aria-hidden="true">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>` +
    `</span>`
  )
}
