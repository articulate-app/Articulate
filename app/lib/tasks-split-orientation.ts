export type TasksSplitOrientation = "horizontal" | "vertical"

/** Minimum split-container width (px) before desktop uses left/right instead of top/bottom. */
export const DESKTOP_SPLIT_HORIZONTAL_MIN_WIDTH = 1100

export function getPreferredSplitOrientation(
  containerWidth?: number | null,
): TasksSplitOrientation {
  const width =
    typeof containerWidth === "number" && Number.isFinite(containerWidth)
      ? containerWidth
      : typeof window !== "undefined"
        ? window.innerWidth
        : 0
  return width >= DESKTOP_SPLIT_HORIZONTAL_MIN_WIDTH ? "horizontal" : "vertical"
}

/** Desktop split orientation from measured container width; mobile always vertical. */
export function getEffectiveSplitOrientation(args: {
  isMobile: boolean
  isSplitEnabled: boolean
  containerWidth: number | null
  storedOrientation: TasksSplitOrientation
}): TasksSplitOrientation {
  if (args.isMobile) return "vertical"
  if (!args.isSplitEnabled) return args.storedOrientation
  if (args.containerWidth == null) return args.storedOrientation
  return getPreferredSplitOrientation(args.containerWidth)
}
