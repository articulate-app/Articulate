"use client"

import React from "react"
import { FileText, X } from "lucide-react"
import { cn } from "../../app/lib/utils"
import { truncateAttachmentFileName } from "./attachment-file-meta"

export function ArtifactDocumentGlyph({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700",
        className,
      )}
      aria-hidden
    >
      <FileText className="h-4 w-4" />
    </span>
  )
}

type ArtifactContextChipProps = {
  title: string
  subtitle?: string
  href?: string | null
  onRemove?: () => void
  onClick?: () => void
  className?: string
  /** When true, chip is display-only (message bubble). */
  readOnly?: boolean
}

export function ArtifactContextChip({
  title,
  subtitle = "Artifact",
  href,
  onRemove,
  onClick,
  className,
  readOnly = false,
}: ArtifactContextChipProps) {
  const displayName = truncateAttachmentFileName(title || "Artifact", 36)

  const body = (
    <>
      <ArtifactDocumentGlyph />
      <span className="min-w-0 flex-1 py-0.5">
        <span
          className="block truncate text-[13px] font-medium leading-tight text-gray-900"
          title={title}
        >
          {displayName}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-tight text-gray-500">
          {subtitle}
        </span>
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove()
          }}
          className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label={`Remove ${title}`}
          title={`Remove ${title}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  )

  const chipClassName = cn(
    "group relative inline-flex max-w-[260px] items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
    (href || onClick) && "cursor-pointer transition-colors hover:border-gray-300 hover:bg-gray-50",
    !readOnly && onRemove && "pr-2",
    className,
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={chipClassName}
        title={title}
        onClick={onClick}
      >
        {body}
      </a>
    )
  }

  if (onClick) {
    return (
      <button type="button" className={chipClassName} title={title} onClick={onClick}>
        {body}
      </button>
    )
  }

  return (
    <div className={chipClassName} title={title}>
      {body}
    </div>
  )
}
