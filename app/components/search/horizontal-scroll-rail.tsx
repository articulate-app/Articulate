"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const ARROW_SCROLL_AMOUNT = 320

export function HorizontalScrollRail({
  children,
  className,
  contentClassName,
}: {
  children: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const dragStateRef = useRef<{ startX: number; scrollLeft: number } | null>(null)

  const updateScrollState = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    setCanScrollLeft(container.scrollLeft > 4)
    setCanScrollRight(container.scrollLeft + container.clientWidth < container.scrollWidth - 4)
  }, [])

  useEffect(() => {
    updateScrollState()
    const container = containerRef.current
    if (!container) return
    container.addEventListener("scroll", updateScrollState, { passive: true })
    window.addEventListener("resize", updateScrollState)
    return () => {
      container.removeEventListener("scroll", updateScrollState)
      window.removeEventListener("resize", updateScrollState)
    }
  }, [updateScrollState])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (event: MouseEvent) => {
      const container = containerRef.current
      const dragState = dragStateRef.current
      if (!container || !dragState) return
      const delta = event.clientX - dragState.startX
      container.scrollLeft = dragState.scrollLeft - delta
    }

    const handleMouseUp = () => {
      dragStateRef.current = null
      setIsDragging(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const container = containerRef.current
    if (!container || container.scrollWidth <= container.clientWidth) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (delta === 0) return
    event.preventDefault()
    container.scrollLeft += delta
  }, [])

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const container = containerRef.current
    if (!container || container.scrollWidth <= container.clientWidth) return
    dragStateRef.current = {
      startX: event.clientX,
      scrollLeft: container.scrollLeft,
    }
    setIsDragging(true)
  }, [])

  const scrollByAmount = useCallback((direction: "left" | "right") => {
    containerRef.current?.scrollBy({
      left: direction === "left" ? -ARROW_SCROLL_AMOUNT : ARROW_SCROLL_AMOUNT,
      behavior: "smooth",
    })
  }, [])

  return (
    <div
      className={cn("group relative", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={containerRef}
        className={cn(
          "ai-chat-tabs-scroll overflow-x-auto overflow-y-hidden scroll-smooth",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab",
        )}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <div className={cn("flex min-w-max gap-3", contentClassName)}>{children}</div>
      </div>

      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByAmount("left")}
        className={cn(
          "absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 p-1.5 shadow-sm transition",
          isHovered && canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByAmount("right")}
        className={cn(
          "absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-gray-200 bg-white/95 p-1.5 shadow-sm transition",
          isHovered && canScrollRight ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
