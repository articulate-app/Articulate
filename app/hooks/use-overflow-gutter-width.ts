import { useLayoutEffect, useState, type RefObject } from "react"

/** Width reserved by a classic scrollbar / `scrollbar-gutter` on `overflow` elements. */
export function useOverflowGutterWidth(
  ref: RefObject<HTMLElement | null>,
  observeKey?: string | number | boolean | null,
): number {
  const [gutterWidth, setGutterWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) {
      setGutterWidth(0)
      return
    }
    const update = () => {
      setGutterWidth(Math.max(0, node.offsetWidth - node.clientWidth))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [observeKey, ref])

  return gutterWidth
}
