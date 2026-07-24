export const AI_PANE_TAB_STRIP_CLASS = "inline-flex h-full min-h-14 min-w-max items-stretch"

/**
 * Active title tab has no bottom grey border so it opens into the pane below.
 * Inactive tabs (and header fillers) keep `border-b border-gray-200`.
 */
export const AI_PANE_TAB_ACTIVE_CLASS =
  "relative z-[1] border-b border-b-transparent font-semibold text-gray-900"

export const AI_PANE_TAB_INACTIVE_CLASS = "border-b border-gray-200 font-normal text-gray-600"

/** Fills remaining header width with the same bottom rule as inactive tabs. */
export const AI_PANE_TAB_FILLER_CLASS = "min-h-14 min-w-0 flex-1 self-stretch border-b border-gray-200"
