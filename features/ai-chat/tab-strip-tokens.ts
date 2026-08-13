/**
 * Cursor-like pane tabs: short row, one subtle bottom rule, active = gray chip.
 * No per-tab vertical borders or “folder tab” overlap tricks.
 */

export const AI_PANE_TAB_ROW_CLASS =
  "flex h-10 min-h-10 items-center gap-0 border-b border-b-gray-200/80 bg-white pl-1 pr-0"

export const AI_PANE_TAB_SCROLL_CLASS =
  "ai-chat-tabs-scroll min-h-0 min-w-0 overflow-x-auto overflow-y-hidden"

export const AI_PANE_TAB_STRIP_CLASS =
  "inline-flex h-full min-h-0 min-w-max items-center gap-0.5 py-1"

/** Shared chip shell — width is content-driven with a soft max. */
export const AI_PANE_TAB_CHIP_CLASS =
  "flex h-7 max-w-[11rem] min-w-0 shrink-0 cursor-pointer items-center gap-1 overflow-hidden rounded-md px-2 text-[13px] leading-none transition-colors"

export const AI_PANE_TAB_ACTIVE_CLASS =
  "bg-gray-100 font-medium text-gray-900"

export const AI_PANE_TAB_INACTIVE_CLASS =
  "bg-transparent font-normal text-gray-500 hover:bg-gray-50 hover:text-gray-800"

/** Multi-selected tabs (Shift / ⌘-click), including when also active. */
export const AI_PANE_TAB_SELECTED_CLASS = "ring-1 ring-inset ring-gray-300"

export const AI_PANE_TAB_FILLER_CLASS = "min-h-0 min-w-0 flex-1 self-stretch"

export const AI_PANE_TAB_CHROME_CLASS =
  "flex shrink-0 items-center gap-0.5 self-stretch pr-1.5"
