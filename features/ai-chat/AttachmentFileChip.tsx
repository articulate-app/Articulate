"use client"

import React from "react"
import { FileText, Image as ImageIcon, X } from "lucide-react"
import { cn } from "../../app/lib/utils"
import {
  getAttachmentFileKind,
  getAttachmentTypeLabel,
  truncateAttachmentFileName,
  type AttachmentFileKind,
} from "./attachment-file-meta"

type AttachmentFileChipProps = {
  fileName: string
  mimeType?: string | null
  href?: string | null
  onRemove?: () => void
  className?: string
  /** When true, chip is display-only (message bubble). */
  readOnly?: boolean
}

function WordGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="2" width="18" height="20" rx="3" fill="#2B579A" />
      <path
        d="M7.2 16.5 9.05 7.5h1.85l1.2 5.45L13.4 7.5h1.8l1.85 9h-1.75l-.95-5.2-1.3 5.2h-1.55l-1.25-5.2-.95 5.2H7.2Z"
        fill="white"
      />
    </svg>
  )
}

function PdfGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="2" width="18" height="20" rx="3" fill="#E11D48" />
      <path
        d="M7.2 15.8V8.2h2.35c1.55 0 2.45.85 2.45 2.05 0 1.2-.95 2.05-2.45 2.05H8.7v3.5H7.2Zm1.5-4.85h.75c.7 0 1.1-.35 1.1-.9s-.4-.9-1.1-.9h-.75v1.8ZM13.1 15.8V8.2h2.2c2.15 0 3.45 1.35 3.45 3.8 0 2.45-1.3 3.8-3.45 3.8h-2.2Zm1.5-1.35h.65c1.2 0 1.9-.8 1.9-2.45s-.7-2.45-1.9-2.45h-.65v4.9Z"
        fill="white"
      />
    </svg>
  )
}

function FileKindIcon({ kind }: { kind: AttachmentFileKind }) {
  if (kind === "word") return <WordGlyph className="h-8 w-8 shrink-0" />
  if (kind === "pdf") return <PdfGlyph className="h-8 w-8 shrink-0" />
  if (kind === "image") {
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        <ImageIcon className="h-4 w-4" aria-hidden />
      </span>
    )
  }
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
      <FileText className="h-4 w-4" aria-hidden />
    </span>
  )
}

export function AttachmentFileChip({
  fileName,
  mimeType,
  href,
  onRemove,
  className,
  readOnly = false,
}: AttachmentFileChipProps) {
  const kind = getAttachmentFileKind({ fileName, mimeType })
  const typeLabel = getAttachmentTypeLabel(kind)
  const displayName = truncateAttachmentFileName(fileName)

  const body = (
    <>
      <FileKindIcon kind={kind} />
      <span className="min-w-0 flex-1 py-0.5">
        <span className="block truncate text-[13px] font-medium leading-tight text-gray-900" title={fileName}>
          {displayName}
        </span>
        <span className="mt-0.5 block truncate text-[12px] leading-tight text-gray-500">
          {typeLabel}
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
          aria-label={`Remove ${fileName}`}
          title={`Remove ${fileName}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  )

  const chipClassName = cn(
    "group relative inline-flex max-w-[260px] items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-2.5 py-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
    href && "transition-colors hover:border-gray-300 hover:bg-gray-50",
    !readOnly && "pr-2",
    className,
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={chipClassName}
        title={fileName}
      >
        {body}
      </a>
    )
  }

  return (
    <div className={chipClassName} title={fileName}>
      {body}
    </div>
  )
}
