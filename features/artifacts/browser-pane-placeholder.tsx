"use client"

import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "../../app/components/ui/button"

type BrowserPanePlaceholderProps = {
  title: string
  description?: string | null
  error?: string | null
  busy?: boolean
  actionLabel?: string | null
  onAction?: (() => void) | null
  icon?: ReactNode
}

/**
 * Articulate-styled empty / loading / error surface for the Browser pane.
 * Keeps the pane white (never black) so disconnect/loading never looks like a
 * foreign Browser Use interstitial.
 */
export function BrowserPanePlaceholder({
  title,
  description,
  error,
  busy = false,
  actionLabel,
  onAction,
  icon,
}: BrowserPanePlaceholderProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white px-6 py-10 text-center">
      {icon ??
        (busy ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden /> : null)}
      <div className="max-w-sm space-y-1.5">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {description ? <p className="text-xs leading-relaxed text-gray-500">{description}</p> : null}
        {error ? <p className="text-xs leading-relaxed text-red-600">{error}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onAction}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
