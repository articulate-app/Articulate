"use client"

import React, { useMemo } from "react"
import { parseInlineMarkdownSegments } from "./parse-inline-markdown"

type InlineMarkdownTextProps = {
  text: string
  className?: string
}

/**
 * Render light inline markdown (`**bold**`, `*italic*`, `` `code` ``) as React nodes.
 */
export function InlineMarkdownText({ text, className }: InlineMarkdownTextProps) {
  const nodes = useMemo(() => {
    return parseInlineMarkdownSegments(text).map((segment, index) => {
      if (segment.type === "bold") {
        return (
          <strong key={`md-${index}`} className="font-semibold text-inherit">
            {segment.value}
          </strong>
        )
      }
      if (segment.type === "italic") {
        return (
          <em key={`md-${index}`} className="italic text-inherit">
            {segment.value}
          </em>
        )
      }
      if (segment.type === "code") {
        return (
          <code
            key={`md-${index}`}
            className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.92em] text-inherit"
          >
            {segment.value}
          </code>
        )
      }
      return <React.Fragment key={`md-${index}`}>{segment.value}</React.Fragment>
    })
  }, [text])

  if (!className) return <>{nodes}</>
  return <span className={className}>{nodes}</span>
}
