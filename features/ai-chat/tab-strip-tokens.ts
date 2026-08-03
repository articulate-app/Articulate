export const AI_PANE_TAB_STRIP_CLASS = "inline-flex h-full min-h-0 min-w-max items-stretch"

/**
 * Header rows own the continuous `border-b`. Active tabs cover that rule with a
 * white *bottom* edge (`border-b-white`, not `border-white`) so the tab opens into
 * the pane below while keeping `border-r border-gray-200` visible.
 */
export const AI_PANE_TAB_ACTIVE_CLASS =
  "relative z-[1] -mb-px border-b border-b-white font-semibold text-gray-900"

export const AI_PANE_TAB_INACTIVE_CLASS = "font-normal text-gray-600"

/** Multi-selected tabs (Shift / ⌘-click), including when also active. */
export const AI_PANE_TAB_SELECTED_CLASS = "bg-gray-100"

/** Fills remaining header width between the scrollable tabs and trailing controls. */
export const AI_PANE_TAB_FILLER_CLASS = "min-h-0 min-w-0 flex-1 self-stretch"
