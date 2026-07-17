export const MOBILE_SPLIT_DEFAULT_TOP_PERCENT = 55
export const MOBILE_SPLIT_MIN_PANE_PERCENT = 28

export function clampMobileSplitTopPercent(value: number): number {
  return Math.min(100 - MOBILE_SPLIT_MIN_PANE_PERCENT, Math.max(MOBILE_SPLIT_MIN_PANE_PERCENT, value))
}
