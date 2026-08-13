/**
 * Map pointer coordinates from the Articulate display surface onto Chrome CSS pixels.
 *
 * Screencast frames are letterboxed/fitted into the canvas host. Clicks must land on
 * the same visual pixel the user sees — never assume 1:1 unless sizes match.
 */

export type ScreencastViewportMeta = {
  deviceWidth: number
  deviceHeight: number
  pageScaleFactor?: number
  offsetTop?: number
  offsetLeft?: number
  scrollOffsetX?: number
  scrollOffsetY?: number
}

export type DisplayRect = {
  width: number
  height: number
}

export type ContentFitRect = {
  /** Top-left of the fitted content inside the display (CSS px). */
  x: number
  y: number
  /** Fitted content size inside the display (CSS px). */
  width: number
  height: number
  /** Uniform scale: display content size / device size. */
  scale: number
}

/**
 * Contain-fit the remote viewport into the display without stretching.
 * Matches `object-fit: contain` / canvas drawImage centering.
 */
export function fitContentRect(
  display: DisplayRect,
  deviceWidth: number,
  deviceHeight: number,
): ContentFitRect {
  const dw = Math.max(1, deviceWidth)
  const dh = Math.max(1, deviceHeight)
  const hostW = Math.max(1, display.width)
  const hostH = Math.max(1, display.height)
  const scale = Math.min(hostW / dw, hostH / dh)
  const width = dw * scale
  const height = dh * scale
  return {
    x: (hostW - width) / 2,
    y: (hostH - height) / 2,
    width,
    height,
    scale,
  }
}

export type MappedBrowserPoint = {
  /** Chrome CSS coordinates for Input.dispatchMouseEvent. */
  x: number
  y: number
  /** False when the pointer is outside the fitted page content. */
  inside: boolean
}

/**
 * Convert a pointer position relative to the display host into Chrome CSS coordinates.
 *
 * @param displayX - CSS px from the left edge of the surface host
 * @param displayY - CSS px from the top edge of the surface host
 */
export function mapDisplayToBrowser(
  displayX: number,
  displayY: number,
  display: DisplayRect,
  meta: ScreencastViewportMeta,
): MappedBrowserPoint {
  const deviceWidth = Math.max(1, meta.deviceWidth || 1)
  const deviceHeight = Math.max(1, meta.deviceHeight || 1)
  const fit = fitContentRect(display, deviceWidth, deviceHeight)

  const localX = displayX - fit.x
  const localY = displayY - fit.y
  const inside =
    localX >= 0 &&
    localY >= 0 &&
    localX <= fit.width &&
    localY <= fit.height

  const scale = fit.scale > 0 ? fit.scale : 1
  // Screencast metadata already describes the CSS viewport; pageScaleFactor is usually 1
  // for Emulation.setDeviceMetricsOverride with deviceScaleFactor: 1.
  const pageScale = meta.pageScaleFactor && meta.pageScaleFactor > 0 ? meta.pageScaleFactor : 1
  const cssX = localX / scale / pageScale
  const cssY = localY / scale / pageScale

  return {
    x: clamp(cssX, 0, deviceWidth),
    y: clamp(cssY, 0, deviceHeight),
    inside,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Normalize a typed URL for toolbar navigation (add https when missing). */
export function normalizeBrowserUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  if (trimmed.startsWith("//")) return `https:${trimmed}`
  return `https://${trimmed}`
}
