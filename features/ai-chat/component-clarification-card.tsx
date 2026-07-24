"use client"

import React, { useMemo, useState } from "react"
import type {
  AiClarificationOption,
  AiClarificationRequest,
  ClarificationAnswerState,
} from "./ai-clarification"
import { cn } from "../../app/lib/utils"

export type ClarificationCardSubmit = {
  selectedOptionIds: string[]
  freeText?: string | null
}

/**
 * Shape-driven clarification card. Renders whatever options the backend supplies —
 * no branching on decision_kind, option id, label text, or category.
 */
export function ComponentClarificationCard({
  clarification,
  isResponding = false,
  answered = false,
  answer = null,
  onSubmit,
  onDismiss,
}: {
  clarification: AiClarificationRequest
  isResponding?: boolean
  /** When true, preserve question + selection but block further interaction. */
  answered?: boolean
  answer?: ClarificationAnswerState | null
  onSubmit: (payload: ClarificationCardSubmit) => void
  onDismiss?: () => void
}) {
  const options = clarification.options
  const isMulti = clarification.allow_multiple === true
  const showFreeText = clarification.allow_free_text === true
  const isLocked = answered || isResponding
  const showSearch =
    !answered && (options.length > 8 || clarification.picker?.searchable === true)

  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    answered && answer?.selectedOptionIds?.length ? answer.selectedOptionIds : [],
  )
  const [freeText, setFreeText] = useState(() =>
    answered && answer?.freeText ? answer.freeText : "",
  )

  const effectiveSelectedIds =
    answered && answer?.selectedOptionIds?.length
      ? answer.selectedOptionIds
      : selectedIds
  const effectiveFreeText =
    answered && answer?.freeText != null ? answer.freeText : freeText

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return options
    return options.filter((option) => {
      const haystack = [option.label, option.description ?? ""].join(" ").toLowerCase()
      return haystack.includes(trimmed)
    })
  }, [options, query])

  const minSelections = clarification.min_selections
  const maxSelections = clarification.max_selections

  const selectionCount = effectiveSelectedIds.length
  const withinMin =
    minSelections == null || selectionCount >= minSelections
  const withinMax =
    maxSelections == null || selectionCount <= maxSelections
  const freeTextTrimmed = effectiveFreeText.trim()
  const canSubmitMulti =
    !isLocked
    && withinMin
    && withinMax
    && (selectionCount > 0 || (showFreeText && freeTextTrimmed.length > 0))

  const canSubmitFreeText =
    !isLocked
    && showFreeText
    && freeTextTrimmed.length > 0
    && (
      !isMulti
      || options.length === 0
      || (withinMin && withinMax)
    )

  const toggleOption = (option: AiClarificationOption) => {
    if (isLocked || option.disabled) return
    if (!isMulti) {
      // Keep the chosen option visibly selected while the follow-up is in flight.
      setSelectedIds([option.id])
      onSubmit({ selectedOptionIds: [option.id], freeText: freeTextTrimmed || null })
      return
    }
    setSelectedIds((prev) => {
      const exists = prev.includes(option.id)
      if (exists) return prev.filter((id) => id !== option.id)
      if (maxSelections != null && prev.length >= maxSelections) return prev
      return [...prev, option.id]
    })
  }

  const handleConfirm = () => {
    if (!canSubmitMulti) return
    onSubmit({
      selectedOptionIds: effectiveSelectedIds,
      freeText: freeTextTrimmed || null,
    })
  }

  const handleFreeTextSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmitFreeText) return
    onSubmit({
      selectedOptionIds: effectiveSelectedIds,
      freeText: freeTextTrimmed,
    })
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm",
        answered && "bg-gray-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-medium text-gray-900">{clarification.question}</div>
        {answered ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            Answered
          </span>
        ) : onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            disabled={isResponding}
            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            Dismiss
          </button>
        ) : null}
      </div>

      {options.length > 0 ? (
        <div className="mt-2 space-y-2">
          {showSearch ? (
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              disabled={isLocked}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:opacity-60"
            />
          ) : null}

          {filteredOptions.length === 0 ? (
            <p className="text-xs text-gray-500">No matching options.</p>
          ) : (
            <div
              className="space-y-1.5"
              role={isMulti ? "group" : "radiogroup"}
              aria-label={clarification.question}
            >
              {filteredOptions.map((option) => {
                const isSelected = effectiveSelectedIds.includes(option.id)
                if (answered && !isSelected) return null
                return (
                  <button
                    key={option.id}
                    type="button"
                    role={isMulti ? "checkbox" : "radio"}
                    aria-checked={isSelected}
                    disabled={isLocked || option.disabled === true}
                    onClick={() => toggleOption(option)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border bg-white px-2.5 py-2 text-left transition-colors",
                      "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400",
                      isSelected && "border-gray-400 bg-gray-50",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-gray-400",
                        isMulti ? "rounded-sm" : "rounded-full",
                        isSelected && "border-gray-900 bg-gray-900",
                      )}
                      aria-hidden
                    >
                      {isSelected && isMulti ? (
                        <span className="text-[9px] leading-none text-white">✓</span>
                      ) : null}
                      {isSelected && !isMulti ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-gray-900">
                        {option.label}
                        {option.recommended ? (
                          <span className="ml-1.5 text-[10px] font-normal text-gray-500">
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      {option.description ? (
                        <span className="mt-0.5 block text-[11px] text-gray-500">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {isMulti && !answered ? (
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <p className="text-[11px] text-gray-500">
                {minSelections != null || maxSelections != null
                  ? [
                      minSelections != null ? `Min ${minSelections}` : null,
                      maxSelections != null ? `Max ${maxSelections}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Select one or more"}
              </p>
              <button
                type="button"
                disabled={!canSubmitMulti}
                onClick={handleConfirm}
                className="rounded-md border border-gray-900 bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500"
              >
                Confirm
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showFreeText && (!answered || freeTextTrimmed.length > 0) ? (
        answered ? (
          <p className="mt-2.5 text-xs text-gray-700 break-words [overflow-wrap:anywhere]">
            {freeTextTrimmed}
          </p>
        ) : (
          <form onSubmit={handleFreeTextSubmit} className="mt-2.5 flex items-center gap-2">
            <input
              type="text"
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              placeholder="Type your answer…"
              disabled={isLocked}
              className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canSubmitFreeText}
              className="rounded-md border border-gray-900 bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500"
            >
              Reply
            </button>
          </form>
        )
      ) : null}
    </div>
  )
}
