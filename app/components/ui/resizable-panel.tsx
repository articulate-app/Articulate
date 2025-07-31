import React, { useRef, useState, useEffect, ReactNode } from "react"

interface ResizablePanelProps {
  children: ReactNode
  defaultWidth?: number // px
  minWidth?: number // px
  maxWidth?: number // px
  width?: number // controlled width (optional)
  onWidthChange?: (width: number) => void
  storageKey?: string
  className?: string
}

/**
 * A horizontally resizable panel (from the left edge), with keyboard and mouse support.
 * Persists width in localStorage if storageKey is provided.
 * Supports dynamic maxWidth and programmatic width changes.
 */
export function ResizablePanel({
  children,
  defaultWidth = 384, // 24rem
  minWidth,
  maxWidth,
  width: controlledWidth,
  onWidthChange,
  storageKey = "resizable-panel-width",
  className = ""
}: ResizablePanelProps) {
  const [width, setWidth] = useState<number>(controlledWidth ?? defaultWidth)
  const panelRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Sync with controlled width
  useEffect(() => {
    if (typeof controlledWidth === "number") {
      setWidth(controlledWidth)
    }
  }, [controlledWidth])

  // Load width from localStorage
  useEffect(() => {
    if (storageKey && typeof controlledWidth !== "number") {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = parseInt(stored, 10)
        if (!isNaN(parsed)) setWidth(parsed)
      }
    }
  }, [storageKey, controlledWidth])

  // Save width to localStorage
  useEffect(() => {
    if (storageKey && typeof controlledWidth !== "number") {
      localStorage.setItem(storageKey, String(width))
    }
  }, [width, storageKey, controlledWidth])

  // Clamp width to maxWidth/minWidth
  useEffect(() => {
    let clamped = width
    if (typeof minWidth === "number") clamped = Math.max(minWidth, clamped)
    if (typeof maxWidth === "number") clamped = Math.min(maxWidth, clamped)
    if (clamped !== width) setWidth(clamped)
  }, [minWidth, maxWidth])

  // Mouse/touch drag handlers
  useEffect(() => {
    if (!isDragging) return
    const handleMouseMove = (e: MouseEvent) => {
      let newWidth = window.innerWidth - e.clientX
      if (typeof minWidth === "number") newWidth = Math.max(minWidth, newWidth)
      if (typeof maxWidth === "number") newWidth = Math.min(maxWidth, newWidth)
      setWidth(newWidth)
      onWidthChange?.(newWidth)
    }
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      let newWidth = window.innerWidth - touch.clientX
      if (typeof minWidth === "number") newWidth = Math.max(minWidth, newWidth)
      if (typeof maxWidth === "number") newWidth = Math.min(maxWidth, newWidth)
      setWidth(newWidth)
      onWidthChange?.(newWidth)
    }
    const stopDrag = () => {
      setIsDragging(false)
      document.body.style.cursor = ""
    }
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", stopDrag)
    document.addEventListener("touchmove", handleTouchMove)
    document.addEventListener("touchend", stopDrag)
    document.body.style.cursor = "col-resize"
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", stopDrag)
      document.removeEventListener("touchmove", handleTouchMove)
      document.removeEventListener("touchend", stopDrag)
      document.body.style.cursor = ""
    }
  }, [isDragging, minWidth, maxWidth, onWidthChange])

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let newWidth = width
    if (e.key === "ArrowLeft") {
      newWidth = width - 16
      if (typeof minWidth === "number") newWidth = Math.max(minWidth, newWidth)
      if (typeof maxWidth === "number") newWidth = Math.min(maxWidth, newWidth)
      setWidth(newWidth)
      onWidthChange?.(newWidth)
      e.preventDefault()
    } else if (e.key === "ArrowRight") {
      newWidth = width + 16
      if (typeof minWidth === "number") newWidth = Math.max(minWidth, newWidth)
      if (typeof maxWidth === "number") newWidth = Math.min(maxWidth, newWidth)
      setWidth(newWidth)
      onWidthChange?.(newWidth)
      e.preventDefault()
    }
  }

  return (
    <div
      ref={panelRef}
      className={`h-full flex flex-col bg-white border-l border-gray-200 shadow-lg z-20 fixed right-0 top-0 bottom-0 transition-all duration-200 ease-in-out ${className}`}
      style={{ width }}
      role="complementary"
      aria-label="Task details panel"
    >
      {/* Resizer handle (visible, functional) */}
      <div
        className="absolute left-0 top-0 h-full w-5 cursor-col-resize z-50 flex items-center justify-center bg-transparent border-l-2 border-gray-200 hover:bg-gray-100 transition-colors duration-150"
        tabIndex={0}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        onMouseDown={() => { setIsDragging(true) }}
        onTouchStart={() => { setIsDragging(true) }}
        onKeyDown={handleKeyDown}
        style={{ outline: "none" }}
        aria-label="Resize details panel"
      >
        {/* Always-visible drag bar */}
        <div className="w-2 h-12 rounded bg-gray-300" style={{ pointerEvents: 'none' }} />
      </div>
      {/* Panel content */}
      <div className="flex-1 h-full overflow-auto">{children}</div>
    </div>
  )
}

export default ResizablePanel 