"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "../../app/lib/utils"
import { normalizeComponentOutputToHtml } from "../../app/lib/rich-text-normalization"
import {
  extractArtifactBlocks,
  type ArtifactBlock,
  type ArtifactContentJson,
  type TaskArtifact,
} from "../../app/lib/artifacts/artifact-types"
import { ArtifactDocumentRenderer } from "./artifact-document-renderer"
import { ComponentOutputEditableBody } from "../tasks/components/ComponentOutputEditableBody"
import { uploadArtifactInlineAttachment } from "./upload-artifact-inline-attachment"
import { AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS } from "../tasks/components/component-output-body-shared"
import {
  buildHtmlEmailContentJson,
  isHtmlEmailArtifact,
} from "./artifact-html-document"
import { ArtifactHtmlDocumentFromArtifact } from "./artifact-html-document-view"

function htmlToPlainText(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }
  const host = document.createElement("div")
  host.innerHTML = html
  return (host.innerText || host.textContent || "").replace(/\u00a0/g, " ").trim()
}

function updateBlockText(block: ArtifactBlock, text: string): ArtifactBlock {
  const next = { ...block, text }
  if (typeof block.html === "string") {
    next.html = text
      .split(/\n+/)
      .map((line) => `<p>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
      .join("")
  }
  return next
}

function EditableTextBlock({
  block,
  onChange,
}: {
  block: ArtifactBlock
  onChange: (next: ArtifactBlock) => void
}) {
  const isHeading = block.type === "heading"
  const level = Math.min(Math.max(Number(block.level) || 2, 1), 4)
  const className = isHeading
    ? level === 1
      ? "text-xl font-semibold text-gray-900"
      : level === 2
        ? "text-lg font-semibold text-gray-900"
        : level === 3
          ? "text-base font-semibold text-gray-900"
          : "text-sm font-semibold text-gray-900"
    : "whitespace-pre-wrap text-sm text-gray-800"

  return (
    <div
      data-block-id={block.id ?? undefined}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={isHeading ? "Editable heading" : "Editable paragraph"}
      className={cn(
        "rounded-sm outline-none",
        className,
      )}
      onBlur={(event) => {
        const text = event.currentTarget.innerText.replace(/\u00a0/g, " ")
        onChange(updateBlockText(block, text))
      }}
    >
      {typeof block.text === "string"
        ? block.text
        : typeof block.html === "string"
          ? block.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          : ""}
    </div>
  )
}

function EditableListBlock({
  block,
  onChange,
}: {
  block: ArtifactBlock
  onChange: (next: ArtifactBlock) => void
}) {
  const items = Array.isArray(block.items) ? block.items : []
  const ordered = block.listStyle === "ordered"
  const Tag = ordered ? "ol" : "ul"
  return (
    <Tag
      data-block-id={block.id ?? undefined}
      className={cn("text-sm text-gray-800", ordered ? "list-decimal pl-5" : "list-disc pl-5")}
    >
      {items.map((item, index) => {
        const text = typeof item === "string" ? item : item?.text ?? ""
        return (
          <li key={index} className="my-0.5">
            <span
              contentEditable
              suppressContentEditableWarning
              className="outline-none"
              onBlur={(event) => {
                const nextText = event.currentTarget.innerText.replace(/\u00a0/g, " ")
                const nextItems = items.map((entry, entryIndex) => {
                  if (entryIndex !== index) return entry
                  if (typeof entry === "string") return nextText
                  return { ...entry, text: nextText }
                })
                onChange({ ...block, items: nextItems })
              }}
            >
              {text}
            </span>
          </li>
        )
      })}
    </Tag>
  )
}

function EditableTableBlock({
  block,
  onChange,
}: {
  block: ArtifactBlock
  onChange: (next: ArtifactBlock) => void
}) {
  const rows = Array.isArray(block.rows) ? block.rows : []
  if (rows.length === 0) return null
  return (
    <div data-block-id={block.id ?? undefined} className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-gray-100">
              {(row ?? []).map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-1.5 align-top text-gray-800">
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    className="block min-w-[2rem] outline-none"
                    onBlur={(event) => {
                      const nextText = event.currentTarget.innerText.replace(/\u00a0/g, " ")
                      const nextRows = rows.map((entry, rIndex) => {
                        if (rIndex !== rowIndex) return entry
                        return (entry ?? []).map((value, cIndex) =>
                          cIndex === cellIndex ? nextText : value,
                        )
                      })
                      onChange({ ...block, rows: nextRows })
                    }}
                  >
                    {cell ?? ""}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function blocksHaveMedia(blocks: ArtifactBlock[]): boolean {
  return blocks.some((block) => {
    const type = String(block.type ?? "")
    return (
      type === "image"
      || type === "image_gallery"
      || type === "gallery"
      || type === "carousel"
      || type === "video"
      || type === "audio"
      || type === "file"
      || type === "attachment"
    )
  })
}

function tableBlockToHtml(block: ArtifactBlock): string {
  const headers = Array.isArray(block.headers)
    ? block.headers.map((cell) => String(cell ?? ""))
    : []
  const rows = Array.isArray(block.rows) ? block.rows : []
  if (headers.length === 0 && rows.length === 0) return ""
  const colCount = Math.max(headers.length, ...rows.map((row) => (row ?? []).length), 0)
  const thead =
    headers.length > 0
      ? `<thead><tr>${Array.from({ length: colCount }, (_, index) =>
          `<th>${escapeHtml(headers[index] ?? "")}</th>`,
        ).join("")}</tr></thead>`
      : ""
  const tbody = `<tbody>${rows
    .map(
      (row) =>
        `<tr>${Array.from({ length: colCount }, (_, index) =>
          `<td>${escapeHtml(String((row ?? [])[index] ?? ""))}</td>`,
        ).join("")}</tr>`,
    )
    .join("")}</tbody>`
  return `<table class="rte-table">${thead}${tbody}</table>`
}

function blocksToCombinedHtml(blocks: ArtifactBlock[]): string {
  const parts = blocks
    .map((block) => {
      const type = String(block.type ?? "")
      if (type === "heading") {
        const level = Math.min(Math.max(Number(block.level) || 2, 1), 4)
        const text = typeof block.text === "string"
          ? block.text
          : typeof block.html === "string"
            ? htmlToPlainText(block.html)
            : ""
        return `<h${level}>${escapeHtml(text)}</h${level}>`
      }
      if (typeof block.html === "string" && block.html.trim()) return block.html
      if (type === "table") return tableBlockToHtml(block)
      if (type === "list" && Array.isArray(block.items)) {
        const ordered = block.listStyle === "ordered"
        const tag = ordered ? "ol" : "ul"
        const items = block.items
          .map((item) => {
            const text = typeof item === "string" ? item : item?.text ?? ""
            return `<li>${escapeHtml(text)}</li>`
          })
          .join("")
        return `<${tag}>${items}</${tag}>`
      }
      if (typeof block.text === "string" && block.text.trim()) {
        return block.text
          .split(/\n+/)
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join("")
      }
      return ""
    })
    .filter(Boolean)
  return parts.join("") || "<p></p>"
}

function singleRichTextHtml(blocks: ArtifactBlock[]): string | null {
  if (blocks.length !== 1) return null
  const block = blocks[0]
  if (!block || (block.type !== "rich_text" && block.type !== "paragraph")) return null
  if (typeof block.html === "string" && block.html.trim()) return block.html
  return null
}

export type ArtifactDocumentEditorProps = {
  artifact: TaskArtifact
  className?: string
  readOnly?: boolean
  /**
   * External TipTap sync key (server/live content or find-replace).
   * Must NOT change on every keystroke — derive from authoritative snapshot, not draft.
   */
  forceContentKey?: string | number | null
  onContentJsonChange?: (contentJson: ArtifactContentJson) => void
  onContentTextChange?: (contentText: string) => void
  onSelectImagePoint?: (args: { attachmentId: string; x: number; y: number }) => void
  onSelectImageRect?: (args: {
    attachmentId: string
    x: number
    y: number
    width: number
    height: number
  }) => void
  onSelectVideoTime?: (args: {
    attachmentId: string
    timeStart: number
    timeEnd?: number | null
  }) => void
  onSelectAsset?: (attachmentId: string) => void
  onOpenFullscreen?: () => void
  /** Hide Preview/Code chrome on HTML email documents (template-style pane). */
  hideHtmlToolbar?: boolean
}

/**
 * Editable artifact body. Prefers `content_json.blocks`; falls back to rich-text
 * editing of markdown/HTML `content_text` with the standard TipTap toolbar.
 */
export function ArtifactDocumentEditor({
  artifact,
  className,
  readOnly = false,
  forceContentKey = null,
  onContentJsonChange,
  onContentTextChange,
  onSelectImagePoint,
  onSelectImageRect,
  onSelectVideoTime,
  onSelectAsset,
  onOpenFullscreen,
  hideHtmlToolbar = false,
}: ArtifactDocumentEditorProps) {
  const initialBlocks = useMemo(
    () => extractArtifactBlocks(artifact.content_json),
    [artifact.content_json],
  )

  const derivedRichHtml = useMemo(() => {
    const fromBlock = singleRichTextHtml(initialBlocks)
    if (fromBlock) return fromBlock
    if (initialBlocks.length > 0 && !blocksHaveMedia(initialBlocks)) {
      return blocksToCombinedHtml(initialBlocks)
    }
    return normalizeComponentOutputToHtml(artifact.content_text ?? "", artifact.title) || "<p></p>"
  }, [artifact.content_text, artifact.title, initialBlocks])

  const resolvedForceKey =
    forceContentKey != null && forceContentKey !== ""
      ? String(forceContentKey)
      : artifact.id

  const [blocks, setBlocks] = useState<ArtifactBlock[]>(initialBlocks)
  const [plainText, setPlainText] = useState(artifact.content_text ?? "")
  const [richHtml, setRichHtml] = useState(derivedRichHtml)
  const lastForceKeyRef = useRef(resolvedForceKey)

  // When the parent force-syncs (AI save / version / find-replace), apply derived
  // HTML in this same render so TipTap receives the new value with the new key.
  const forceKeyChanged = resolvedForceKey !== lastForceKeyRef.current
  if (forceKeyChanged) {
    lastForceKeyRef.current = resolvedForceKey
    if (richHtml !== derivedRichHtml) setRichHtml(derivedRichHtml)
    if (plainText !== (artifact.content_text ?? "")) setPlainText(artifact.content_text ?? "")
    setBlocks(initialBlocks)
  }
  const htmlForEditor = forceKeyChanged ? derivedRichHtml : richHtml

  // Do not mirror parent draft props back into local editor state on every keystroke.
  // Authoritative server/AI/version changes are applied through forceContentKey above.

  const selectableProps = {
    "data-ai-selectable": "artifact",
    "data-artifact-id": artifact.id,
    "data-artifact-version": String(artifact.current_version ?? 0),
    "data-artifact-title": artifact.title?.trim() || "Artifact",
  } as const

  const rendererSelectProps = {
    onSelectImagePoint,
    onSelectImageRect,
    onSelectVideoTime,
    onSelectAsset,
    onOpenFullscreen,
  }

  // Full HTML email / code documents bypass TipTap so nested layout tables survive.
  if (isHtmlEmailArtifact(artifact)) {
    return (
      <div className={cn("min-w-0", className)} {...selectableProps}>
        <ArtifactHtmlDocumentFromArtifact
          artifact={artifact}
          readOnly={readOnly}
          hideToolbar={hideHtmlToolbar}
          onChange={(nextHtml) => {
            const contentJson = buildHtmlEmailContentJson(nextHtml, artifact.content_json)
            const plain = typeof contentJson.blocks?.[0]?.text === "string"
              ? contentJson.blocks[0].text
              : ""
            setRichHtml(nextHtml)
            setPlainText(plain)
            setBlocks(contentJson.blocks ?? [])
            onContentJsonChange?.(contentJson)
            onContentTextChange?.(plain)
          }}
        />
      </div>
    )
  }

  // Keep TipTap mounted while read-only (e.g. AI generating) so rich text does not
  // flash away when swapping to the block renderer. Media-heavy docs still use renderer.
  const preferReadonlyTipTap =
    readOnly
    && (
      initialBlocks.length === 0
      || !blocksHaveMedia(initialBlocks)
      || Boolean(singleRichTextHtml(initialBlocks))
    )

  if (readOnly && !preferReadonlyTipTap) {
    return (
      <div className={cn("min-w-0", className)} {...selectableProps}>
        <ArtifactDocumentRenderer
          artifact={artifact}
          {...rendererSelectProps}
        />
      </div>
    )
  }

  const commitBlocks = (nextBlocks: ArtifactBlock[]) => {
    setBlocks(nextBlocks)
    const contentJson: ArtifactContentJson = {
      ...(artifact.content_json ?? {}),
      version: (artifact.content_json as { version?: number } | null)?.version ?? 1,
      blocks: nextBlocks,
    }
    onContentJsonChange?.(contentJson)
    const textFallback = nextBlocks
      .map((block) => {
        if (typeof block.html === "string" && block.html.trim()) return htmlToPlainText(block.html)
        if (typeof block.text === "string") return block.text
        if (String(block.type ?? "") === "table") {
          return htmlToPlainText(tableBlockToHtml(block))
        }
        if (Array.isArray(block.items)) {
          return block.items
            .map((item) => (typeof item === "string" ? item : item?.text ?? ""))
            .join("\n")
        }
        return ""
      })
      .filter(Boolean)
      .join("\n\n")
    onContentTextChange?.(textFallback)
  }

  const commitRichHtml = (nextHtml: string) => {
    setRichHtml(nextHtml)
    const plain = htmlToPlainText(nextHtml)
    setPlainText(plain)
    const nextBlocks: ArtifactBlock[] = [
      {
        id: "body",
        type: "rich_text",
        html: nextHtml,
        text: plain,
      },
    ]
    setBlocks(nextBlocks)
    onContentJsonChange?.({
      ...(artifact.content_json ?? {}),
      version: (artifact.content_json as { version?: number } | null)?.version ?? 1,
      blocks: nextBlocks,
    })
    onContentTextChange?.(plain)
  }

  const useRichTextSurface =
    blocks.length === 0
    || !blocksHaveMedia(blocks)
    || Boolean(singleRichTextHtml(blocks))
    || Boolean(plainText.trim())

  if (useRichTextSurface && (blocks.length === 0 || !blocksHaveMedia(blocks))) {
    return (
      <div className={cn("min-w-0", className)} {...selectableProps}>
        <ComponentOutputEditableBody
          html={htmlForEditor || "<p></p>"}
          onChange={commitRichHtml}
          toolbarId={`artifact-editor-${artifact.id}`}
          placeholder="Write artifact content…"
          className={AI_CHAT_PREVIEW_BODY_WRAPPER_CLASS}
          disableInlineMediaControls={false}
          readOnly={readOnly}
          forceContentKey={resolvedForceKey}
          onInsertAttachment={async (file) =>
            uploadArtifactInlineAttachment(artifact.id, file)
          }
        />
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)} {...selectableProps}>
      {blocks.map((block, index) => {
        const key = (typeof block.id === "string" && block.id) || `block-${index}`
        const replace = (next: ArtifactBlock) => {
          const nextBlocks = blocks.map((entry, entryIndex) =>
            entryIndex === index ? next : entry,
          )
          commitBlocks(nextBlocks)
        }
        switch (block.type) {
          case "heading":
          case "paragraph":
          case "rich_text":
            return <EditableTextBlock key={key} block={block} onChange={replace} />
          case "list":
            return <EditableListBlock key={key} block={block} onChange={replace} />
          case "table":
            return <EditableTableBlock key={key} block={block} onChange={replace} />
          default:
            return (
              <ArtifactDocumentRenderer
                key={key}
                artifact={{
                  ...artifact,
                  content_json: { blocks: [block] },
                  content_text: null,
                  asset_data:
                    block.type === "image_gallery" ||
                    block.type === "gallery" ||
                    block.type === "carousel"
                      ? artifact.asset_data
                      : null,
                }}
                showAssetGallery={
                  block.type === "image_gallery" ||
                  block.type === "gallery" ||
                  block.type === "carousel"
                }
                {...rendererSelectProps}
              />
            )
        }
      })}
    </div>
  )
}
