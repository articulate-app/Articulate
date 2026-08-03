"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Replace, Search } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "../../app/components/ui/popover"
import { cn } from "../../app/lib/utils"
import { extractPrimaryArtifactHtml } from "../../app/lib/artifact-selection-patch"
import type { ArtifactContentJson } from "../../app/lib/artifacts/artifact-types"
import {
  countInHtmlTextNodes,
  replaceInHtmlTextNodes,
} from "./artifact-find-replace"

export type ArtifactFindReplacePopoverProps = {
  contentJson: ArtifactContentJson | null | undefined
  contentText: string | null | undefined
  disabled?: boolean
  onApply: (next: { contentJson: ArtifactContentJson; contentText: string }) => void
}

function contentJsonFromHtml(
  previous: ArtifactContentJson | null | undefined,
  html: string,
  plain: string,
): ArtifactContentJson {
  const base: ArtifactContentJson =
    previous && typeof previous === "object" ? { ...previous } : { version: 1 }
  const blocks = Array.isArray(base.blocks) ? [...base.blocks] : []
  if (blocks.length === 1) {
    return {
      ...base,
      version: Number(base.version) || 1,
      blocks: [{ ...blocks[0], type: "rich_text", html, text: plain }],
    }
  }
  return {
    ...base,
    version: Number(base.version) || 1,
    blocks: [{ id: "body", type: "rich_text", html, text: plain }],
  }
}

function htmlToPlain(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }
  const doc = new DOMParser().parseFromString(html, "text/html")
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").trim()
}

/** Find & replace for artifact rich HTML (text nodes only). */
export function ArtifactFindReplacePopover({
  contentJson,
  contentText,
  disabled,
  onApply,
}: ArtifactFindReplacePopoverProps) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState("")
  const [replaceWith, setReplaceWith] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const sourceHtml = useMemo(() => {
    return (
      extractPrimaryArtifactHtml(contentJson)
      || (contentText && /<[a-z][\s\S]*>/i.test(contentText) ? contentText : null)
      || (contentText
        ? `<p>${contentText
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>")}</p>`
        : "<p></p>")
    )
  }, [contentJson, contentText])

  const matchCount = useMemo(
    () => (find.trim() ? countInHtmlTextNodes(sourceHtml, find, { caseSensitive }) : 0),
    [caseSensitive, find, sourceHtml],
  )

  useEffect(() => {
    if (!open) setStatus(null)
  }, [open])

  const applyReplace = (all: boolean) => {
    const needle = find
    if (!needle) {
      setStatus("Enter text to find")
      return
    }
    const result = replaceInHtmlTextNodes(sourceHtml, needle, replaceWith, {
      all,
      caseSensitive,
    })
    if (result.replacements === 0) {
      setStatus("No matches")
      return
    }
    const plain = htmlToPlain(result.html)
    onApply({
      contentJson: contentJsonFromHtml(contentJson, result.html, plain),
      contentText: plain,
    })
    setStatus(
      all
        ? `Replaced ${result.replacements} match${result.replacements === 1 ? "" : "es"}`
        : "Replaced 1 match",
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
          aria-label="Find and replace"
          title="Find and replace"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[120] w-[min(92vw,22rem)] space-y-2 p-3">
        <div className="text-xs font-medium text-foreground">Find and replace</div>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Find</span>
          <input
            value={find}
            onChange={(event) => setFind(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Text to find"
            autoFocus
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">Replace with</span>
          <input
            value={replaceWith}
            onChange={(event) => setReplaceWith(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Replacement text"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                applyReplace(true)
              }
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.target.checked)}
            className="rounded border-border"
          />
          Match case
        </label>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className={cn("text-[11px]", matchCount > 0 ? "text-foreground" : "text-muted-foreground")}>
            {find.trim() ? `${matchCount} match${matchCount === 1 ? "" : "es"}` : "—"}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => applyReplace(false)}
              disabled={!find.trim() || matchCount === 0}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
            >
              <Replace className="h-3 w-3" aria-hidden />
              Replace
            </button>
            <button
              type="button"
              onClick={() => applyReplace(true)}
              disabled={!find.trim() || matchCount === 0}
              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Replace all
            </button>
          </div>
        </div>
        {status ? <p className="text-[11px] text-muted-foreground">{status}</p> : null}
      </PopoverContent>
    </Popover>
  )
}
