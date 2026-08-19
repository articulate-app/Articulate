import type { DesktopBrowserBounds } from "./articulate-desktop"

export function clipDesktopBrowserBounds(
  bounds: DesktopBrowserBounds,
  chromeRects: Array<{ left: number; right: number; bottom: number }>,
): DesktopBrowserBounds {
  let minY = 0
  const right = bounds.x + bounds.width
  for (const chrome of chromeRects) {
    if (chrome.right <= bounds.x || chrome.left >= right) continue
    minY = Math.max(minY, chrome.bottom)
  }
  let y = bounds.y
  let height = bounds.height
  if (y < minY) {
    height -= minY - y
    y = minY
  }
  const nextHeight = Math.max(0, Math.round(height))
  return {
    ...bounds,
    y: Math.max(0, Math.round(y)),
    height: nextHeight,
    visible: Boolean(bounds.visible) && bounds.width >= 1 && nextHeight >= 32,
  }
}

export function readPaneTabBarRects(
  root: ParentNode | null = typeof document === "undefined" ? null : document,
): Array<{ left: number; right: number; bottom: number }> {
  if (!root || typeof (root as Document).querySelectorAll !== "function") return []
  const nodes = (root as Document).querySelectorAll("[data-pane-tab-bar]")
  const rects: Array<{ left: number; right: number; bottom: number }> = []
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const rect = node.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    rects.push({ left: rect.left, right: rect.right, bottom: rect.bottom })
  })
  return rects
}
