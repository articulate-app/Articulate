"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { cn } from "../../../app/lib/utils"
import type { DiffLine } from "../utils/component-content-diff"
import { ComponentOutputLinkText } from "./component-output-link-text"

type ComponentContentDiffViewProps = {
  lines: DiffLine[]
  className?: string
  fromAiChat?: boolean
}

export function ComponentContentDiffView({
  lines,
  className,
  fromAiChat = false,
}: ComponentContentDiffViewProps) {
  const pathname = usePathname()

  if (lines.length === 0) {
    return <div className={cn("px-3 py-2 text-xs text-muted-foreground break-words", className)}>No changes</div>
  }

  return (
    <div
      className={cn(
        "space-y-0.5 px-3 py-2 font-mono text-xs leading-relaxed max-w-full min-w-0 overflow-x-hidden break-words [overflow-wrap:anywhere]",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {lines.map((line, index) => {
        if (line.type === "unchanged") {
          return (
            <div
              key={`${index}-${line.type}-${line.text}`}
              className="whitespace-pre-wrap break-words text-foreground [overflow-wrap:anywhere]"
            >
              <ComponentOutputLinkText text={line.text || "\u00a0"} pathname={pathname} fromAiChat={fromAiChat} />
            </div>
          )
        }
        const prefix = line.type === "added" ? "+" : "–"
        return (
          <div
            key={`${index}-${line.type}-${line.text}`}
            className={cn(
              "whitespace-pre-wrap break-words rounded px-1 [overflow-wrap:anywhere]",
              line.type === "added" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900",
            )}
          >
            <span className="mr-1 select-none opacity-70">{prefix}</span>
            <ComponentOutputLinkText text={line.text || "\u00a0"} pathname={pathname} fromAiChat={fromAiChat} />
          </div>
        )
      })}
    </div>
  )
}
