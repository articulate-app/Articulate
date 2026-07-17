"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Sparkles } from "lucide-react"
import { type AiSelectedTextContext } from "./ai-chat-text-selection"

type SelectionAnchor = { left: number; top: number }

type ActiveSelection = {
  context: AiSelectedTextContext
  anchor: SelectionAnchor
}

type SelectionAskAiMenuProps = {
  /** CSS selector marking containers whose text is selectable (e.g. '[data-ai-selectable="chat-message"]'). */
  containerSelector: string
  /** Build the selection context from the matched container + current range. Return null to ignore. */
  resolve: (container: HTMLElement, range: Range) => AiSelectedTextContext | null
  /** Invoked when the user clicks "Ask AI" — attaches the selection as free-form context. */
  onAsk: (context: AiSelectedTextContext) => void
  /** Minimum selected characters before the affordance appears. */
  minChars?: number
}

const MENU_MIN_CHARS_DEFAULT = 2

/**
 * Floating "Ask AI" affordance shown when the user highlights text inside a matching container.
 * Intentionally NOT a list of preset actions — clicking simply attaches the passage to the composer
 * as free-form context so the user can type any instruction.
 */
export function SelectionAskAiMenu({
  containerSelector,
  resolve,
  onAsk,
  minChars = MENU_MIN_CHARS_DEFAULT,
}: SelectionAskAiMenuProps) {
  const [active, setActive] = useState<ActiveSelection | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const isPointerInsideMenuRef = useRef(false)

  const evaluateSelection = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setActive(null)
      return
    }
    const text = selection.toString().trim()
    if (text.length < minChars) {
      setActive(null)
      return
    }
    const range = selection.getRangeAt(0)
    const anchorNode = range.commonAncestorContainer
    const anchorEl =
      anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as HTMLElement)
        : anchorNode.parentElement
    const container = anchorEl?.closest(containerSelector) as HTMLElement | null
    if (!container) {
      setActive(null)
      return
    }
    const context = resolve(container, range)
    if (!context || !context.selected_text.trim()) {
      setActive(null)
      return
    }
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setActive(null)
      return
    }
    setActive({
      context,
      anchor: { left: rect.left + rect.width / 2, top: rect.top },
    })
  }, [containerSelector, resolve, minChars])

  useEffect(() => {
    const handleMouseUp = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      // Defer so the browser finalizes the selection first.
      window.setTimeout(evaluateSelection, 0)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!event.shiftKey && event.key !== "Shift") return
      window.setTimeout(evaluateSelection, 0)
    }
    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("keyup", handleKeyUp)
    return () => {
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("keyup", handleKeyUp)
    }
  }, [evaluateSelection])

  useEffect(() => {
    if (!active) return
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.toString().trim().length < minChars) {
        if (!isPointerInsideMenuRef.current) setActive(null)
      }
    }
    const handleScroll = () => setActive(null)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null)
    }
    document.addEventListener("selectionchange", handleSelectionChange)
    window.addEventListener("scroll", handleScroll, true)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      window.removeEventListener("scroll", handleScroll, true)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [active, minChars])

  if (!active || typeof document === "undefined") return null

  const left = Math.max(12, Math.min(active.anchor.left, window.innerWidth - 12))
  const top = Math.max(12, active.anchor.top - 8)

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[10000] -translate-x-1/2 -translate-y-full"
      style={{ left: `${left}px`, top: `${top}px` }}
      onMouseEnter={() => {
        isPointerInsideMenuRef.current = true
      }}
      onMouseLeave={() => {
        isPointerInsideMenuRef.current = false
      }}
      // Keep the current text selection alive while interacting with the affordance.
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        onClick={() => {
          const context = active.context
          setActive(null)
          onAsk(context)
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-700 shadow-lg hover:bg-violet-50"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Add to chat
      </button>
    </div>,
    document.body,
  )
}
