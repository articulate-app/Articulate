/** Match user/project detail panes with a taller two-line header band. */
export const TASK_PANE_HEADER_SHELL_CLASS =
  "sticky top-0 z-10 border-b border-gray-200 bg-white px-3"

export const TASK_PANE_HEADER_ROW_CLASS =
  "flex min-h-[76px] items-center justify-between gap-2 py-3"

/**
 * Compact single-line pane header band. Height matches the left-pane object pill
 * toolbar (`h-14` / 56px) so right-pane tab headers align with the left toolbar density.
 * Tab headers should also apply `border-b border-gray-200` on this same row (not below it)
 * so the rule lines up with the left toolbar divider.
 */
export const COMPACT_PANE_HEADER_ROW_CLASS =
  "flex h-14 min-h-14 items-center justify-between gap-2"
