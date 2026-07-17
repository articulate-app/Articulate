"use client"

import React, { useEffect, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import {
  AI_CHAT_MODEL_OPTIONS,
  getAiChatModelLabel,
  type AiChatModelKey,
} from "./ai-chat-model-selection"

type AiChatModelPickerProps = {
  modelKey: AiChatModelKey
  onModelKeyChange: (key: AiChatModelKey) => void
  disabled?: boolean
}

/** Compact model selector for the AI chat composer footer. */
export function AiChatModelPicker({ modelKey, onModelKeyChange, disabled }: AiChatModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [isOpen])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        className="inline-flex h-7 items-center gap-1 rounded-sm px-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100/80 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select AI model"
        title="Select AI model"
      >
        <span className="max-w-[140px] truncate">{getAiChatModelLabel(modelKey)}</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      </button>
      {isOpen ? (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-[9999] mb-1 min-w-[168px] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {AI_CHAT_MODEL_OPTIONS.map((option) => {
            const isSelected = option.key === modelKey
            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onModelKeyChange(option.key)
                  setIsOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  isSelected ? "font-medium text-gray-900" : "text-gray-600"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-gray-700" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
