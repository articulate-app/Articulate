/** Match user/project detail panes with a taller two-line header band. */
export const TASK_PANE_HEADER_SHELL_CLASS =
  "sticky top-0 z-10 border-b border-gray-200 bg-white px-3"

export const TASK_PANE_HEADER_ROW_CLASS =
  "flex min-h-[76px] items-center justify-between gap-2 py-3"

/**
 * Task details experiment: single-line header matching browser chrome (`h-10`).
 * Apply on the bordered shell (border-box) so the bottom rule lines up with the
 * left-pane second row — not on an inner child under a separate border-b shell.
 */
export const TASK_DETAILS_HEADER_ROW_CLASS =
  "flex h-10 min-h-10 items-center justify-between gap-2 border-b border-gray-200/80 bg-white px-3"

/**
 * Compact single-line pane header band for non-tab chrome (e.g. left toolbar).
 * Pane tab strips use the shorter `AI_PANE_TAB_ROW_CLASS` instead.
 */
export const COMPACT_PANE_HEADER_ROW_CLASS =
  "flex h-14 min-h-14 items-center justify-between gap-2"

/** Shared add / more / expand / close controls on middle + AI pane tab rows. */
export const PANE_CHROME_ICON_BUTTON_CLASS =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"

/** Thin stroke icons — closer to Cursor chrome density. */
export const PANE_CHROME_ICON_CLASS = "h-3.5 w-3.5"
