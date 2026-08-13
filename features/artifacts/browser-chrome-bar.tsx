"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, History, RotateCw } from "lucide-react"
import { Button } from "../../app/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../app/components/ui/dropdown-menu"
import { PANE_CHROME_ICON_BUTTON_CLASS, PANE_CHROME_ICON_CLASS } from "../../app/components/tasks/pane-header-tokens"
import type { BrowserHistoryEntry } from "../../app/lib/services/agentic-publishing"
import type { BrowserViewerMode } from "../../app/lib/publishing/browser-viewport"
import { cn } from "../../app/lib/utils"

type BrowserChromeBarProps = {
  url: string
  canGoBack: boolean
  canGoForward: boolean
  history: BrowserHistoryEntry[]
  disabled?: boolean
  busy?: boolean
  viewerMode?: BrowserViewerMode
  onViewerModeChange?: (mode: BrowserViewerMode) => void
  /** Called when the address field gains/loses focus (so polls do not overwrite typing). */
  onEditingChange?: (isEditing: boolean) => void
  onSubmitUrl: (url: string) => void
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onSelectHistory: (entryId: number) => void
}

export function BrowserChromeBar({
  url,
  canGoBack,
  canGoForward,
  history,
  disabled = false,
  busy = false,
  viewerMode,
  onViewerModeChange,
  onEditingChange,
  onSubmitUrl,
  onBack,
  onForward,
  onReload,
  onSelectHistory,
}: BrowserChromeBarProps) {
  const [draft, setDraft] = useState(url)
  const isEditingRef = useRef(false)

  // Sync remote URL into the field only when the user is not typing.
  useEffect(() => {
    if (isEditingRef.current) return
    setDraft(url)
  }, [url])

  const controlsDisabled = disabled || busy

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(PANE_CHROME_ICON_BUTTON_CLASS, "h-8 w-8")}
        disabled={controlsDisabled || !canGoBack}
        onClick={onBack}
        aria-label="Back"
        title="Back"
      >
        <ArrowLeft className={PANE_CHROME_ICON_CLASS} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(PANE_CHROME_ICON_BUTTON_CLASS, "h-8 w-8")}
        disabled={controlsDisabled || !canGoForward}
        onClick={onForward}
        aria-label="Forward"
        title="Forward"
      >
        <ArrowRight className={PANE_CHROME_ICON_CLASS} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(PANE_CHROME_ICON_BUTTON_CLASS, "h-8 w-8")}
        disabled={controlsDisabled}
        onClick={onReload}
        aria-label="Reload"
        title="Reload"
      >
        <RotateCw className={cn(PANE_CHROME_ICON_CLASS, busy ? "animate-spin" : undefined)} />
      </Button>

      <form
        className="min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault()
          isEditingRef.current = false
          onEditingChange?.(false)
          onSubmitUrl(draft)
        }}
      >
        <input
          type="text"
          value={draft}
          disabled={disabled}
          onFocus={() => {
            isEditingRef.current = true
            onEditingChange?.(true)
          }}
          onBlur={() => {
            isEditingRef.current = false
            onEditingChange?.(false)
            // Keep whatever the user typed until a later remote URL sync (or submit).
          }}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Enter URL"
          className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 text-[13px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-300 focus:bg-white"
        />
      </form>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(PANE_CHROME_ICON_BUTTON_CLASS, "h-8 w-8")}
            disabled={controlsDisabled || history.length === 0}
            aria-label="History"
            title="History"
          >
            <History className={PANE_CHROME_ICON_CLASS} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-72 w-80 overflow-auto">
          {history.length === 0 ? (
            <DropdownMenuItem disabled>No history yet</DropdownMenuItem>
          ) : (
            history
              .slice()
              .reverse()
              .map((entry) => (
                <DropdownMenuItem
                  key={entry.id}
                  className="flex flex-col items-start gap-0.5 py-2"
                  onSelect={() => onSelectHistory(entry.id)}
                >
                  <span className="w-full truncate text-sm text-gray-900">
                    {entry.title || entry.url}
                  </span>
                  <span className="w-full truncate text-xs text-gray-500">{entry.url}</span>
                </DropdownMenuItem>
              ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {viewerMode && onViewerModeChange ? (
        <div
          className="ml-0.5 flex shrink-0 items-center rounded-md border border-gray-200 bg-gray-50 p-0.5"
          role="group"
          aria-label="Viewer mode"
        >
          {(["fit", "fill"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => onViewerModeChange(mode)}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                viewerMode === mode
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800",
              )}
              title={
                mode === "fit"
                  ? "Fit — show the full remote browser"
                  : "Fill — crop to fill the pane"
              }
            >
              {mode === "fit" ? "Fit" : "Fill"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
