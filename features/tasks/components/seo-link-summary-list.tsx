"use client"

import React, { useCallback, useMemo, useState } from "react"
import { ChevronDown, Loader2, Pencil, Trash2 } from "lucide-react"
import { Button } from "../../../app/components/ui/button"
import { Input } from "../../../app/components/ui/input"
import { cn } from "../../../app/lib/utils"
import { KeywordPresenceHeatmap } from "../../artifacts/keyword-presence-heatmap-view"

export type SeoLinkStatusResult =
  | { kind: "checking" }
  | { kind: "invalid" }
  | { kind: "timeout" }
  | { kind: "unreachable" }
  | { kind: "unknown" }
  | { kind: "http"; statusCode: number }

export type SeoLinkSummaryItem = {
  normalizedUrl: string
  url: string
  displayUrl: string
  isValid: boolean
  occurrences?: number
  /** Preferred page name (anchor text). Falls back to hostname. */
  pageName?: string | null
  anchorSamples?: string[]
  sources?: Array<{ key: string; title: string; count?: number }>
}

type SeoLinkSummaryListProps = {
  items: SeoLinkSummaryItem[]
  statusByUrl: Record<string, SeoLinkStatusResult>
  isLoading?: boolean
  emptyMessage?: string
  readOnly?: boolean
  /** Article plain text (ideally with hrefs inlined) for presence heatmap. */
  plainText?: string | null
  /** When set, shows Replace / Remove actions. */
  onReplaceLink?: (args: { fromUrl: string; toUrl: string }) => void | Promise<void>
  onRemoveLink?: (args: { url: string }) => void | Promise<void>
  className?: string
}

function statusLabel(status: SeoLinkStatusResult): string {
  if (status.kind === "http") return String(status.statusCode)
  if (status.kind === "checking") return "…"
  if (status.kind === "invalid") return "Invalid"
  if (status.kind === "timeout") return "Timeout"
  if (status.kind === "unreachable") return "Unreachable"
  return "Unknown"
}

function statusColor(status: SeoLinkStatusResult): string {
  if (status.kind === "invalid") return "text-red-600"
  if (
    status.kind === "checking"
    || status.kind === "unknown"
    || status.kind === "timeout"
    || status.kind === "unreachable"
  ) {
    return "text-gray-500"
  }
  if (status.kind === "http") {
    if (status.statusCode >= 500) return "text-red-600"
    if (status.statusCode >= 400) return "text-orange-600"
    if (status.statusCode >= 300) return "text-amber-600"
    if (status.statusCode >= 200) return "text-green-600"
  }
  return "text-gray-500"
}

function hostnameFallback(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, "")
  } catch {
    return url
  }
}

export function resolveSeoLinkPageName(item: SeoLinkSummaryItem): string {
  const fromProp = typeof item.pageName === "string" ? item.pageName.trim() : ""
  if (fromProp) return fromProp
  const fromAnchor = item.anchorSamples?.find((sample) => sample.trim())?.trim()
  if (fromAnchor) return fromAnchor
  return hostnameFallback(item.displayUrl || item.url)
}

/**
 * Shared minimalist linkbuilding list used by task overview SEO and artifact SEO dock.
 */
export function SeoLinkSummaryList({
  items,
  statusByUrl,
  isLoading = false,
  emptyMessage = "No links found.",
  readOnly = false,
  plainText = null,
  onReplaceLink,
  onRemoveLink,
  className,
}: SeoLinkSummaryListProps) {
  const [expandedUrls, setExpandedUrls] = useState<Set<string>>(() => new Set())
  const [replacingUrl, setReplacingUrl] = useState<string | null>(null)
  const [replaceDraft, setReplaceDraft] = useState("")
  const [busyUrl, setBusyUrl] = useState<string | null>(null)

  const canEdit = !readOnly && Boolean(onReplaceLink || onRemoveLink)

  const toggleExpanded = useCallback((normalizedUrl: string) => {
    setExpandedUrls((prev) => {
      const next = new Set(prev)
      if (next.has(normalizedUrl)) next.delete(normalizedUrl)
      else next.add(normalizedUrl)
      return next
    })
  }, [])

  const sortedItems = useMemo(() => items, [items])

  if (isLoading) {
    return <p className={cn("text-xs text-gray-500", className)}>Loading links…</p>
  }

  if (sortedItems.length === 0) {
    return <p className={cn("text-xs text-gray-500", className)}>{emptyMessage}</p>
  }

  return (
    <ul className={cn("space-y-0.5", className)}>
      {sortedItems.map((item) => {
        const status: SeoLinkStatusResult = !item.isValid
          ? { kind: "invalid" }
          : (statusByUrl[item.normalizedUrl] ?? { kind: "checking" })
        const isExpanded = expandedUrls.has(item.normalizedUrl)
        const isReplacing = replacingUrl === item.normalizedUrl
        const isBusy = busyUrl === item.normalizedUrl
        const pageName = resolveSeoLinkPageName(item)
        const sources = item.sources ?? []

        return (
          <li key={item.normalizedUrl} className="group py-1.5">
            <div className="flex items-start gap-1.5">
              <button
                type="button"
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => toggleExpanded(item.normalizedUrl)}
                title={isExpanded ? "Hide details" : "Show details"}
                aria-label={isExpanded ? "Hide details" : "Show details"}
                aria-expanded={isExpanded}
              >
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", !isExpanded && "-rotate-90")}
                />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <a
                      href={item.isValid ? item.url : undefined}
                      target={item.isValid ? "_blank" : undefined}
                      rel={item.isValid ? "noreferrer noopener" : undefined}
                      className={cn(
                        "block truncate text-sm leading-5",
                        item.isValid
                          ? "text-gray-900 hover:text-gray-950 hover:underline"
                          : "text-gray-500",
                      )}
                      title={pageName}
                    >
                      {pageName}
                    </a>
                    <p className="mt-0.5 truncate text-[11px] text-gray-500" title={item.displayUrl}>
                      {item.displayUrl}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 text-[11px] font-medium tabular-nums",
                      statusColor(status),
                    )}
                  >
                    {statusLabel(status)}
                  </span>
                  {typeof item.occurrences === "number" && item.occurrences > 0 ? (
                    <span className="mt-0.5 shrink-0 text-[11px] tabular-nums text-gray-400">
                      ×{item.occurrences}
                    </span>
                  ) : null}
                  {canEdit ? (
                    <div className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      {onReplaceLink ? (
                        <button
                          type="button"
                          className="rounded p-1 text-gray-400 hover:text-gray-700"
                          title="Replace link"
                          disabled={isBusy}
                          onClick={() => {
                            setReplacingUrl(item.normalizedUrl)
                            setReplaceDraft(item.displayUrl)
                            setExpandedUrls((prev) => new Set(prev).add(item.normalizedUrl))
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {onRemoveLink ? (
                        <button
                          type="button"
                          className="rounded p-1 text-gray-400 hover:text-red-500"
                          title="Remove link"
                          disabled={isBusy}
                          onClick={() => {
                            void (async () => {
                              setBusyUrl(item.normalizedUrl)
                              try {
                                await onRemoveLink({ url: item.displayUrl })
                              } finally {
                                setBusyUrl(null)
                                setReplacingUrl(null)
                              }
                            })()
                          }}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {isExpanded ? (
                  <div className="mt-1.5 space-y-1.5 pl-0.5">
                    {isReplacing && onReplaceLink ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={replaceDraft}
                          onChange={(event) => setReplaceDraft(event.target.value)}
                          className="h-7 text-xs"
                          placeholder="https://"
                          disabled={isBusy}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isBusy || !replaceDraft.trim()}
                          onClick={() => {
                            void (async () => {
                              setBusyUrl(item.normalizedUrl)
                              try {
                                await onReplaceLink({
                                  fromUrl: item.displayUrl,
                                  toUrl: replaceDraft.trim(),
                                })
                                setReplacingUrl(null)
                                setReplaceDraft("")
                              } finally {
                                setBusyUrl(null)
                              }
                            })()
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={isBusy}
                          onClick={() => {
                            setReplacingUrl(null)
                            setReplaceDraft("")
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}

                    {sources.length > 0 ? (
                      <ul className="space-y-0.5">
                        {sources.map((source) => (
                          <li
                            key={`${item.normalizedUrl}-${source.key}`}
                            className="truncate text-[11px] text-gray-500"
                          >
                            {source.title}
                            {typeof source.count === "number" && source.count > 1
                              ? ` ×${source.count}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {plainText?.trim() ? (
                      <KeywordPresenceHeatmap
                        plainText={plainText}
                        keyword={item.url}
                        matchMode="substring"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
