"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Code2, Eye } from "lucide-react"
import { cn } from "../../app/lib/utils"
import { Button } from "../../app/components/ui/button"
import {
  extractRawArtifactHtml,
  htmlEmailDocumentForPreview,
} from "./artifact-html-document"

export type ArtifactHtmlDocumentVariant = "document" | "preview"

type ArtifactHtmlDocumentViewProps = {
  html: string
  readOnly?: boolean
  className?: string
  onChange?: (nextHtml: string) => void
  /**
   * document — flush in the artifact pane; iframe auto-heights so the pane scrolls.
   * preview — chrome-less card/chat preview (no nested window frame).
   */
  variant?: ArtifactHtmlDocumentVariant
  /** Hide Preview/Code toolbar (e.g. brand template HTML preview). */
  hideToolbar?: boolean
}

function measureIframeContentHeight(doc: Document, minHeight: number): number {
  const html = doc.documentElement
  const body = doc.body
  let bottom = 0
  const last = body?.lastElementChild as HTMLElement | null
  if (last) {
    const rect = last.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    bottom = Math.ceil(rect.bottom - bodyRect.top + (body.scrollTop || 0))
  }
  return Math.max(
    html?.scrollHeight ?? 0,
    body?.scrollHeight ?? 0,
    html?.offsetHeight ?? 0,
    body?.offsetHeight ?? 0,
    bottom,
    minHeight,
  )
}

/**
 * Preview / code surface for full HTML email documents.
 * Bypasses TipTap so nested presentation tables and <style> survive.
 */
export function ArtifactHtmlDocumentView({
  html,
  readOnly = false,
  className,
  onChange,
  variant = "document",
  hideToolbar = false,
}: ArtifactHtmlDocumentViewProps) {
  const isPreviewCard = variant === "preview"
  const [mode, setMode] = useState<"preview" | "code">("preview")
  const [draft, setDraft] = useState(html)
  const [iframeHeight, setIframeHeight] = useState(isPreviewCard ? 160 : 480)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraft(html)
  }, [html])

  const srcDoc = useMemo(() => htmlEmailDocumentForPreview(draft || html), [draft, html])

  const resizeIframeToContent = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      if (!doc) return
      const next = measureIframeContentHeight(doc, isPreviewCard ? 80 : 240)
      setIframeHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev))
    } catch {
      // sandbox / cross-origin — keep last height
    }
  }, [isPreviewCard])

  const scheduleResize = useCallback(() => {
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = setTimeout(() => {
      resizeIframeToContent()
    }, 32)
  }, [resizeIframeToContent])

  useEffect(() => {
    const timer = window.setTimeout(resizeIframeToContent, 50)
    const timer2 = window.setTimeout(resizeIframeToContent, 300)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(timer2)
    }
  }, [srcDoc, resizeIframeToContent])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const attachObservers = () => {
      try {
        const doc = iframe.contentDocument
        if (!doc?.body) return () => {}

        const onImgLoad = () => scheduleResize()
        for (const img of Array.from(doc.images)) {
          if (!img.complete) img.addEventListener("load", onImgLoad)
          img.addEventListener("error", onImgLoad)
        }

        const ro = typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => scheduleResize())
          : null
        ro?.observe(doc.documentElement)
        if (doc.body) ro?.observe(doc.body)

        const mo = typeof MutationObserver !== "undefined"
          ? new MutationObserver(() => {
              for (const img of Array.from(doc.images)) {
                if (!img.complete) img.addEventListener("load", onImgLoad)
              }
              scheduleResize()
            })
          : null
        mo?.observe(doc.body, { childList: true, subtree: true, attributes: true })

        scheduleResize()
        return () => {
          ro?.disconnect()
          mo?.disconnect()
          for (const img of Array.from(doc.images)) {
            img.removeEventListener("load", onImgLoad)
            img.removeEventListener("error", onImgLoad)
          }
        }
      } catch {
        return () => {}
      }
    }

    let cleanup = attachObservers()
    const onLoad = () => {
      cleanup()
      cleanup = attachObservers()
    }
    iframe.addEventListener("load", onLoad)
    return () => {
      iframe.removeEventListener("load", onLoad)
      cleanup()
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    }
  }, [srcDoc, scheduleResize])

  const showToolbar = !isPreviewCard && !hideToolbar
  const showPreview = mode === "preview" || isPreviewCard || hideToolbar

  return (
    <div className={cn("flex min-w-0 flex-col", showToolbar && "gap-2", className)}>
      {showToolbar ? (
        !readOnly || mode === "code" ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant={mode === "preview" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setMode("preview")}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              type="button"
              variant={mode === "code" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setMode("code")}
            >
              <Code2 className="h-3.5 w-3.5" />
              Code
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setMode("code")}
            >
              <Code2 className="h-3.5 w-3.5" />
              View code
            </Button>
          </div>
        )
      ) : null}

      {showPreview ? (
        <iframe
          ref={iframeRef}
          title="HTML email preview"
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          scrolling="no"
          onLoad={resizeIframeToContent}
          style={{ height: iframeHeight }}
          className="block w-full border-0 bg-transparent"
        />
      ) : (
        <textarea
          value={draft}
          readOnly={readOnly}
          spellCheck={false}
          className={cn(
            "min-h-[320px] w-full flex-1 resize-y rounded-md border border-gray-200 bg-gray-50 p-3",
            "font-mono text-[11px] leading-relaxed text-gray-800 outline-none",
            "focus-visible:ring-2 focus-visible:ring-blue-500/30",
            readOnly && "cursor-default opacity-90",
          )}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            onChange?.(next)
          }}
          aria-label="HTML source"
        />
      )}
    </div>
  )
}

export function ArtifactHtmlDocumentFromArtifact({
  artifact,
  readOnly,
  className,
  onChange,
  variant = "document",
  hideToolbar = false,
}: {
  artifact: Parameters<typeof extractRawArtifactHtml>[0]
  readOnly?: boolean
  className?: string
  onChange?: (nextHtml: string) => void
  variant?: ArtifactHtmlDocumentVariant
  hideToolbar?: boolean
}) {
  const html = extractRawArtifactHtml(artifact)
  return (
    <ArtifactHtmlDocumentView
      html={html}
      readOnly={readOnly}
      className={className}
      onChange={onChange}
      variant={variant}
      hideToolbar={hideToolbar}
    />
  )
}
