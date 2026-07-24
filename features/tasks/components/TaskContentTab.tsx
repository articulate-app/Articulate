"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSearchParams, usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { bumpAndInvalidateHomeSidebarRecent } from "../../../app/lib/home-sidebar-recents-cache"
import { cn } from "../../../app/lib/utils"
import { Textarea } from "../../../app/components/ui/textarea"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { invokeEdgeFunctionFetch } from "../../../app/lib/edge-functions"
import { Button } from "../../../app/components/ui/button"
import { Badge } from "../../../app/components/ui/badge"
import { Input } from "../../../app/components/ui/input"
import { Label } from "../../../app/components/ui/label"
import { Checkbox } from "../../../app/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "../../../app/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../app/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../app/components/ui/alert-dialog"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "../../../app/components/ui/select"
import { toast } from "../../../app/components/ui/use-toast"
import { useAiBuildContent } from "../../ai-chat/hooks"
import { buildBuildComponentUserMessageDisplay } from "../../ai-chat/build-component-display-message"
import { isRealTaskComponentOutputId } from "../../ai-chat/build-ai-chat-tagged-refs"
import {
  computeFullContentHash,
  computeRangeTextParts,
  useAiChatTextSelectionStore,
  type AiSelectedTextContext,
} from "../../ai-chat/ai-chat-text-selection"
import { dispatchAiChatOptimisticUserMessage } from "../../ai-chat/dispatch-ai-chat-optimistic-user"
import { persistUserMessageMentionMetadata } from "../../ai-chat/persist-user-message-mention-metadata"
import {
  buildComponentOutputActiveFieldContext,
  type AiActiveFieldContext,
} from "../../ai-chat/active-field-context"
import { useComponentEditStreamStore, componentEditStreamKey } from "../../../app/store/component-edit-stream"
import { useAiBuildComponentPreviewStore } from "../../../app/store/ai-build-component-preview-store"
import { streamTextToPreviewBlocks, buildEditStreamOptimisticOutputBlocks, buildEditStreamMergedPlainText, isLiveComponentEditStream } from "../../ai-chat/component-edit-stream-utils"
import {
  buildStreamingPreviewBlocks,
  isStreamingComponentOutputPreviewHtml,
} from "../utils/component-output-preview-render"
import {
  cleanDetectedUrl,
  extractUrlsFromComponentOutputSources,
  isMediaOrStorageUrl,
} from "../lib/link-summary-url-extraction"
import { sortTaskChannelComponentsByPosition } from "../utils/task-channel-component-order"
import { 
  Plus, 
  X, 
  Loader2,
  Check,
  MoreVertical,
  MoreHorizontal,
  Save,
  FileMinus,
  Download,
  ClipboardCopy,
  CopyPlus,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Minimize2,
  GripVertical,
  Trash2,
  History,
  Zap,
  Pencil,
  AlertTriangle,
  MessageCircle,
  RefreshCw,
  Clock,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "../../../app/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../../../app/components/ui/tooltip"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ensureBriefingTypeAssignedToChannel,
  mapProjectChannelBriefingTypeOptions,
  splitBriefingTypeOptions,
  type ProjectChannelBriefingTypeOption,
} from "../../../app/lib/channel-briefing-types"
import debounce from 'lodash.debounce'
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { AddComponentButton, AddComponentEmptyState } from "../../../app/components/task/AddComponentButton"
import { CompactToolbar } from "../../../app/components/editor/CompactToolbar"
import type { Editor as TiptapEditor } from "@tiptap/react"
import { SEOPanel } from '../SEOPanel'
import { CTTVariantSEO } from '../hooks/use-ctt-variant-seo'
import { calculateKeywordDensity, getDensityColor, extractPlainText } from '../utils/keyword-density'
import { StructureReviewPanel, ReviewedComponent } from './StructureReviewPanel'
import { submitTaskReview } from "../../../app/components/tasks/review-submit"
import {
  useTaskComponentOutputsRealtime,
  type TaskComponentOutputRow,
  type TaskComponentOutputChangeEvent,
} from "../../../app/hooks/use-task-component-outputs-realtime"
import {
  consumeTextStream,
  type AiChatAssetEvent,
  type AiChatComponentOutputEvent,
} from "../../../app/lib/ai/chat"
import { preserveTaskDetailsFocusWhenOpeningAi } from "../../../app/components/tasks/ai-pane-focus-url"
import { shallowReplaceSearchParams } from "../../../app/lib/tasks-shallow-nav"
import { normalizeMixedRichText, normalizeComponentOutputToHtml } from "../../../app/lib/rich-text-normalization"
import {
  normalizeTaskComponentOutputAttachments,
  type TaskComponentOutputAttachment,
} from "../../../app/lib/types/task-component-output"
import { useCurrentUserStore } from "../../../app/store/current-user"
import { ThreadParticipantsInline } from "../../../app/components/comments-section/thread-participants-inline"
import { ThreadedRealtimeChat } from "../../../app/components/threaded-realtime-chat"
import { AddCommentInput } from "../../../app/components/comments-section/add-comment-input"
import { getImageUrl } from "../../../app/lib/public-media"
import {
  useOutputCommentThreadsBatch,
  groupThreadsByOutputId,
  useCreateOutputCommentThread,
  useResolveOutputCommentThread,
  useReopenOutputCommentThread,
  type OutputCommentThread,
} from "../../../app/hooks/use-output-comment-threads"
import { useThreadMentionsBatch } from "../../../app/hooks/use-thread-mentions-batch"
import { resolveTaskChannelInitMode } from "../../../app/lib/task-channel-init"
import { useTaskWatchers } from "../../../app/hooks/use-task-watchers"
import type {
  TaskChannelBootstrapAvailableRow,
  TaskChannelBootstrapComponentRow,
  TaskChannelBootstrapResponse,
} from "../../../app/lib/types/task-channel-bootstrap"
import { fetchTaskChannelBootstrap } from "../../../app/lib/services/task-channel-bootstrap"
import { useTaskChannelBootstrap, taskChannelBootstrapQueryKey } from "../../../app/hooks/use-task-channel-bootstrap"
import {
  useTaskChannelContent,
  taskChannelContentQueryKey,
} from "../../../app/hooks/use-task-channel-content"
import type { TaskChannelContentComponentRow } from "../../../app/lib/types/task-channel-content"
import { TASK_CHANNELS_INVALIDATED_EVENT } from "../../ai-chat/invalidate-task-channel-content"
import { ComponentOutputVersionHistoryDialog } from "./ComponentOutputVersionHistoryDialog"
import { TaskChannelContentHistoryDialog } from "./TaskChannelContentHistoryDialog"
import { saveChannelSnapshotBeforeAiEdit } from "../../ai-chat/save-channel-snapshot-before-ai-edit"
import {
  ensureManualComponentEditChannelSnapshot,
  ensureTaskChannelSnapshotOnce,
  resetTaskChannelEditSession,
} from "../utils/task-channel-edit-session-snapshot"
import type { RolledBackTaskComponentOutput } from "@/lib/types/content-version-history"
import {
  buildNormalizedExportFromLiveOutput,
  buildTaskDocxExportModel,
  copyComponentsToClipboard,
  fetchChannelKeywordMetricsForExport,
  formatExportMetricValue,
  logTaskDocxExportDebug,
  renderComponentToDocxHtml,
  type NormalizedComponentExport,
  type TaskDocxExportLiveOverrides,
  type TaskDocxExportSeo,
} from "../utils/task-docx-export-model"
import {
  buildDocxLogoParagraph,
  buildExportDocxNumberingConfig,
  htmlToDocxElements,
} from "../utils/task-content-docx-render"
import { ProjectChannelsManager } from "../../../app/components/projects/OverviewConfigDropdowns"

/** Set to true to show alignment debug outlines and title anchor guide. Set false before ship. */
const DEBUG_ALIGN = false

/** Left inset (px) for body content. Slightly left of 50 for label/value alignment. */
const CONTENT_LEFT_INSET_PX = 32

/** Fixed width for checkbox column when multi-select is ON. Use same Tailwind class everywhere so selected/unselected/add row align. */
const MULTI_SELECT_GUTTER_CLASS = 'w-10'
const COMPONENT_CARD_HEIGHT_CLASS = 'min-h-[86px]'
const FOCUSED_TOPBAR_COMPACT_BUTTON_CLASS = 'inline-flex h-7 min-w-[3.4rem] items-center justify-center rounded px-2 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700'
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function formatRelativeTime(value?: string | null): string {
  if (!value) return 'just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'just now'
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const absSec = Math.abs(diffSec)
  if (absSec < 45) return 'just now'
  if (absSec < 3600) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSec / 60), 'minute')
  if (absSec < 86400) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSec / 3600), 'hour')
  if (absSec < 2592000) return RELATIVE_TIME_FORMATTER.format(Math.round(diffSec / 86400), 'day')
  return RELATIVE_TIME_FORMATTER.format(Math.round(diffSec / 2592000), 'month')
}

/** Compact header timestamp for component cards: "2 mins", "1 h", "2 d". */
function formatCompactRelativeTime(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSec < 45) return 'now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'}`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} h`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 30) return `${diffDay} d`
  const diffMonth = Math.floor(diffDay / 30)
  return `${diffMonth} mo`
}

function sanitizeOutputAttachmentPathSegment(input: string): string {
  const collapsed = input.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "")
  return collapsed || "file"
}

function toMediaTypeFromMime(mimeType: string): "image" | "video" | null {
  const lower = mimeType.toLowerCase()
  if (lower.startsWith("image/")) return "image"
  if (lower.startsWith("video/")) return "video"
  return null
}

function formatSeconds(value: number | null | undefined): string {
  if (!Number.isFinite(value) || value == null) return "0:00"
  const safe = Math.max(0, Math.floor(value))
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${mins}:${String(secs).padStart(2, "0")}`
}

function normalizeAttachmentMap(
  value: unknown
): Record<string, TaskComponentOutputAttachment> | null {
  if (!value || typeof value !== "object") return null
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return null
  const map: Record<string, TaskComponentOutputAttachment> = {}
  for (const [key, raw] of entries) {
    const normalized = normalizeTaskComponentOutputAttachments([raw])[0]
    if (!normalized) continue
    map[key] = normalized
  }
  return Object.keys(map).length > 0 ? map : null
}

function normalizeOutputContentJson(value: unknown): OutputContentBlock[] | null {
  if (!Array.isArray(value)) return null
  const blocks: OutputContentBlock[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    if (row.type === "paragraph") {
      blocks.push({ type: "paragraph", text: typeof row.text === "string" ? row.text : "" })
      continue
    }
    if (row.type === "attachment") {
      const attachmentId = typeof row.attachment_id === "string" ? row.attachment_id : ""
      if (attachmentId) {
        const widthPctRaw = Number(row.width_pct)
        const width_pct = Number.isFinite(widthPctRaw) ? Math.max(20, Math.min(100, widthPctRaw)) : undefined
        blocks.push({
          type: "attachment",
          attachment_id: attachmentId,
          width_pct,
          attachment: normalizeTaskComponentOutputAttachments([row.attachment])[0] ?? null,
          missing_attachment: Boolean(row.missing_attachment),
          inserted_by_bootstrap: Boolean(row.inserted_by_bootstrap),
          signed_url: typeof row.signed_url === "string" ? row.signed_url : null,
          public_url: typeof row.public_url === "string" ? row.public_url : null,
          file_path: typeof row.file_path === "string" ? row.file_path : null,
          mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
          media_type: typeof row.media_type === "string" ? row.media_type : null,
          alt_text: typeof row.alt_text === "string" ? row.alt_text : null,
          caption: typeof row.caption === "string" ? row.caption : null,
        })
      }
    }
  }
  return blocks
}

function normalizeAiAssetRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  return row
}

function hydrateBlocksFromAssets(
  blocks: OutputContentBlock[],
  assets: unknown,
  cachedAssets?: Iterable<Record<string, unknown>>
): OutputContentBlock[] {
  const index = new Map<string, Record<string, unknown>>()
  const combinedAssets: unknown[] = []
  if (Array.isArray(assets)) combinedAssets.push(...assets)
  if (cachedAssets) combinedAssets.push(...Array.from(cachedAssets))
  if (combinedAssets.length > 0) {
    for (const raw of combinedAssets) {
      const row = normalizeAiAssetRecord(raw)
      if (!row) continue
      const directId = typeof row.attachment_id === "string" ? row.attachment_id : null
      const idField = typeof row.id === "string" ? row.id : null
      const nestedId =
        row.attachment && typeof row.attachment === "object" && typeof (row.attachment as Record<string, unknown>).id === "string"
          ? ((row.attachment as Record<string, unknown>).id as string)
          : null
      for (const id of [directId, idField, nestedId]) {
        if (id) index.set(id, row)
      }
    }
  }

  return blocks.map((block) => {
    if (block.type !== "attachment") return block
    const asset = index.get(block.attachment_id)
    if (!asset) return block
    const normalizedAttachment = normalizeTaskComponentOutputAttachments([asset.attachment])[0] ?? block.attachment ?? null
    const nextMediaType =
      typeof asset.media_type === "string"
        ? asset.media_type
        : typeof asset.mime_type === "string"
          ? (toMediaTypeFromMime(asset.mime_type) ?? block.media_type ?? null)
          : block.media_type ?? null
    return {
      ...block,
      signed_url: typeof asset.signed_url === "string" ? asset.signed_url : block.signed_url ?? null,
      file_path:
        typeof asset.file_path === "string"
          ? asset.file_path
          : typeof normalizedAttachment?.file_path === "string"
            ? normalizedAttachment.file_path
            : block.file_path ?? null,
      mime_type: typeof asset.mime_type === "string" ? asset.mime_type : block.mime_type ?? null,
      media_type: nextMediaType,
      alt_text: typeof asset.alt_text === "string" ? asset.alt_text : block.alt_text ?? null,
      caption: typeof asset.caption === "string" ? asset.caption : block.caption ?? null,
      attachment: normalizedAttachment,
      missing_attachment: false,
    }
  })
}

function isIsoNewerOrEqual(candidate: string | null | undefined, baseline: string | null | undefined): boolean {
  const candidateTs = candidate ? Date.parse(candidate) : Number.NaN
  const baselineTs = baseline ? Date.parse(baseline) : Number.NaN
  if (!Number.isFinite(candidateTs) || !Number.isFinite(baselineTs)) return false
  return candidateTs >= baselineTs
}

function extractOutputContentBlocksFromHtml(html: string): OutputContentBlock[] {
  if (typeof window === "undefined") return [{ type: "paragraph", text: html }]
  const parser = new DOMParser()
  const doc = parser.parseFromString(html || "", "text/html")
  const blocks: OutputContentBlock[] = []
  const children = Array.from(doc.body.children)
  for (const node of children) {
    if (!(node instanceof HTMLElement)) continue
    const attachmentId = node.getAttribute("data-attachment-id")
    if (attachmentId) {
      const styleWidth = (node as HTMLElement).style?.width ?? ""
      const widthMatch = styleWidth.match(/^(\d+(?:\.\d+)?)%$/)
      const widthValue = widthMatch ? Number(widthMatch[1]) : Number.NaN
      const width_pct = Number.isFinite(widthValue) ? Math.max(20, Math.min(100, widthValue)) : undefined
      blocks.push({
        type: "attachment",
        attachment_id: attachmentId,
        ...(width_pct != null ? { width_pct } : {}),
      })
      continue
    }
    const htmlValue = (node as HTMLElement).outerHTML ?? ""
    if (htmlValue || node.tagName.toLowerCase() === "p") {
      blocks.push({ type: "paragraph", text: htmlValue })
    }
  }
  if (blocks.length === 0) {
    const fallback = doc.body.innerHTML.trim()
    if (fallback) blocks.push({ type: "paragraph", text: fallback })
  }
  return blocks
}

function appendTextToOutputBlocks(blocks: OutputContentBlock[], chunk: string): OutputContentBlock[] {
  if (!chunk) return blocks
  if (blocks.length === 0) return [{ type: "paragraph", text: chunk }]
  const next = [...blocks]
  const last = next[next.length - 1]
  if (last.type === "paragraph") {
    next[next.length - 1] = { ...last, text: `${last.text ?? ""}${chunk}` }
    return next
  }
  next.push({ type: "paragraph", text: chunk })
  return next
}

/** Strip Markdown (`###`) and raw/escaped HTML heading markers from plain-text previews so the
 * collapsed teaser shows readable text instead of literal `<h3>`/`###`. */
function stripHeadingMarkersForPreview(text: string): string {
  return (text ?? "")
    .replace(/<\/?h[1-6][^>]*>/gi, " ")
    .replace(/(^|\n)\s*#{1,6}\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

function contentBlocksToPlainText(blocks: OutputContentBlock[]): string {
  const toPlain = (value: string): string => {
    if (typeof window === "undefined") return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const parser = new DOMParser()
    const doc = parser.parseFromString(value, "text/html")
    return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim()
  }
  return blocks
    .filter((block): block is { type: "paragraph"; text: string } => block.type === "paragraph")
    .map((block) => toPlain(block.text))
    .filter((text) => text.trim().length > 0)
    .join("\n")
}

function sanitizeBlocksForSave(blocks: OutputContentBlock[]): Array<
  { type: "paragraph"; text: string } | { type: "attachment"; attachment_id: string; width_pct?: number }
> {
  return blocks.map((block) => {
    if (block.type === "attachment") {
      const widthPctRaw = Number(block.width_pct)
      const width_pct = Number.isFinite(widthPctRaw) ? Math.max(20, Math.min(100, widthPctRaw)) : undefined
      return {
        type: "attachment",
        attachment_id: block.attachment_id,
        ...(width_pct != null ? { width_pct } : {}),
      }
    }
    return {
      type: "paragraph",
      text: block.text ?? "",
    }
  })
}

function resolveAttachmentForBlock(
  block: OutputContentBlock,
  output: {
    attachment_map?: Record<string, TaskComponentOutputAttachment> | null
    attachments?: TaskComponentOutputAttachment[]
  }
): TaskComponentOutputAttachment | null {
  if (block.type !== "attachment") return null
  const fromBlock =
    typeof block.file_path === "string" || typeof block.signed_url === "string"
      ? ({
          id: block.attachment_id,
          file_name:
            (block.file_path && block.file_path.split("/").at(-1))
            || (typeof block.attachment?.file_name === "string" ? block.attachment.file_name : "attachment"),
          file_path: block.file_path ?? (typeof block.attachment?.file_path === "string" ? block.attachment.file_path : ""),
          mime_type: block.mime_type ?? (typeof block.attachment?.mime_type === "string" ? block.attachment.mime_type : null),
          size: typeof block.attachment?.size === "number" ? block.attachment.size : null,
          media_type:
            block.media_type
            ?? (typeof block.attachment?.media_type === "string" ? block.attachment.media_type : null)
            ?? ((block.mime_type ?? "").startsWith("image/") ? "image" : null),
          width: typeof block.attachment?.width === "number" ? block.attachment.width : null,
          height: typeof block.attachment?.height === "number" ? block.attachment.height : null,
          duration_seconds: typeof block.attachment?.duration_seconds === "number" ? block.attachment.duration_seconds : null,
          caption: block.caption ?? (typeof block.attachment?.caption === "string" ? block.attachment.caption : null),
          alt_text: block.alt_text ?? (typeof block.attachment?.alt_text === "string" ? block.attachment.alt_text : null),
          sort_order: typeof block.attachment?.sort_order === "number" ? block.attachment.sort_order : null,
          uploaded_by: typeof block.attachment?.uploaded_by === "number" ? block.attachment.uploaded_by : null,
          uploaded_at: typeof block.attachment?.uploaded_at === "string" ? block.attachment.uploaded_at : null,
          metadata:
            block.attachment?.metadata
            ?? {
              signed_url: block.signed_url ?? null,
              public_url: block.public_url ?? null,
            },
          signed_url: block.signed_url ?? null,
          public_url: block.public_url ?? null,
        } as TaskComponentOutputAttachment)
      : null
  return (
    output.attachment_map?.[block.attachment_id]
    ?? output.attachments?.find((attachment) => attachment.id === block.attachment_id)
    ?? block.attachment
    ?? fromBlock
    ?? null
  )
}

function contentJsonLooksDegraded(blocks: OutputContentBlock[]): boolean {
  if (blocks.length === 0) return false
  return blocks.some(
    (block) =>
      block.type === "paragraph"
      && typeof block.text === "string"
      && (block.text.includes("&lt;") || /<p>\s*#{1,6}\s/m.test(block.text))
  )
}

function hydrateOutputBlocksFromContentText(
  contentText: string,
  componentTitle?: string | null
): OutputContentBlock[] {
  const html = normalizeComponentOutputToHtml(contentText, componentTitle)
  if (!html.trim()) return []
  const parsed = extractOutputContentBlocksFromHtml(html)
  return parsed.length > 0 ? parsed : [{ type: "paragraph", text: html }]
}

function resolveCanonicalOutputBlocks(
  output: {
    content?: OutputContentBlock[] | null
    resolved_content_json?: OutputContentBlock[] | null
    content_json?: OutputContentBlock[] | null
    content_text?: string | null
    attachment_map?: Record<string, TaskComponentOutputAttachment> | null
    attachments?: TaskComponentOutputAttachment[]
  } | null | undefined,
  componentTitle?: string | null
): OutputContentBlock[] {
  const blocks = getOutputBlocks(output)
  const hasAttachment = blocks.some((block) => block.type === "attachment")
  const contentText = output?.content_text ?? ""
  if (!hasAttachment && contentText.trim() && contentJsonLooksDegraded(blocks)) {
    return hydrateOutputBlocksFromContentText(contentText, componentTitle)
  }
  return blocks
}

function getOutputBlocks(
  output: {
    content?: OutputContentBlock[] | null
    resolved_content_json?: OutputContentBlock[] | null
    content_json?: OutputContentBlock[] | null
    content_text?: string | null
    attachment_map?: Record<string, TaskComponentOutputAttachment> | null
    attachments?: TaskComponentOutputAttachment[]
  } | null | undefined
): OutputContentBlock[] {
  if (!output) return []
  const canonical = output.content
  if (Array.isArray(canonical) && canonical.length > 0) {
    return canonical.map((block) => {
      if (block.type !== "attachment") return block
      const attachment = resolveAttachmentForBlock(block, output)
      return { ...block, attachment, missing_attachment: !attachment }
    })
  }
  const resolved = output.resolved_content_json
  if (Array.isArray(resolved) && resolved.length > 0) {
    return resolved.map((block) => {
      if (block.type !== "attachment") return block
      const attachment = resolveAttachmentForBlock(block, output)
      return { ...block, attachment, missing_attachment: !attachment }
    })
  }
  const content = output.content_json
  if (Array.isArray(content) && content.length > 0) {
    return content.map((block) => {
      if (block.type !== "attachment") return block
      const attachment = resolveAttachmentForBlock(block, output)
      return { ...block, attachment, missing_attachment: !attachment }
    })
  }
  if (output.content_text) {
    const parsedFromHtml = extractOutputContentBlocksFromHtml(output.content_text)
    if (parsedFromHtml.length > 0) {
      return parsedFromHtml.map((block) => {
        if (block.type !== "attachment") return block
        const attachment = resolveAttachmentForBlock(block, output)
        return { ...block, attachment, missing_attachment: !attachment }
      })
    }
    return [{ type: "paragraph", text: output.content_text }]
  }
  return []
}

function collectOutputAttachments(output: {
  attachments?: TaskComponentOutputAttachment[]
  attachment_map?: Record<string, TaskComponentOutputAttachment> | null
  content?: OutputContentBlock[] | null
  resolved_content_json?: OutputContentBlock[] | null
  content_json?: OutputContentBlock[] | null
}): TaskComponentOutputAttachment[] {
  const map = new Map<string, TaskComponentOutputAttachment>()
  for (const attachment of output.attachments ?? []) {
    map.set(attachment.id, attachment)
  }
  for (const attachment of Object.values(output.attachment_map ?? {})) {
    map.set(attachment.id, attachment)
  }
  const maybeBlocks = [...(output.content ?? []), ...(output.resolved_content_json ?? []), ...(output.content_json ?? [])]
  for (const block of maybeBlocks) {
    if (block.type !== "attachment" || !block.attachment) continue
    map.set(block.attachment.id, block.attachment)
  }
  return Array.from(map.values())
}

function getReferencedAttachmentsInOrder(
  blocks: OutputContentBlock[],
  output: {
    attachment_map?: Record<string, TaskComponentOutputAttachment> | null
    attachments?: TaskComponentOutputAttachment[]
  }
): TaskComponentOutputAttachment[] {
  const seen = new Set<string>()
  const ordered: TaskComponentOutputAttachment[] = []
  for (const block of blocks) {
    if (block.type !== "attachment") continue
    const attachment = resolveAttachmentForBlock(block, output)
    if (!attachment || seen.has(attachment.id)) continue
    seen.add(attachment.id)
    ordered.push(attachment)
  }
  return ordered
}

function outputContentBlocksToHtml(
  blocks: OutputContentBlock[] | null | undefined,
  output: {
    attachment_map?: Record<string, TaskComponentOutputAttachment> | null
    attachments?: TaskComponentOutputAttachment[]
  },
  commentCountByAttachmentId?: Map<string, number>,
  imagePointThreadsByAttachmentId?: Map<string, Array<{ threadId: number; anchorX: number; anchorY: number }>>,
  options?: {
    outputId?: string | null
    activeThreadId?: number | null
    editable?: boolean
    mode?: "display" | "edit" | "focus"
    selectedAttachmentId?: string | null
    pendingPin?: { attachmentId: string; anchorX: number; anchorY: number } | null
    debugOutputImageOverlays?: boolean
    attachmentDisplayUrlById?: Record<string, string>
  }
): string {
  if (!blocks || blocks.length === 0) return ""
  const htmlParts: string[] = []
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const paragraph = (block.text ?? "").trim()
      if (!paragraph) {
        htmlParts.push("<p></p>")
      } else if (paragraph.startsWith("<")) {
        htmlParts.push(paragraph)
      } else {
        const safe = paragraph
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>")
        htmlParts.push(`<p>${safe}</p>`)
      }
      continue
    }
    const attachment = resolveAttachmentForBlock(block, output)
    if (!attachment) {
      htmlParts.push(`<div data-attachment-id="${block.attachment_id}" contenteditable="false" style="margin:8px 0;font-size:12px;color:#6b7280;">Missing attachment</div>`)
      continue
    }
    const commentCount = commentCountByAttachmentId?.get(attachment.id) ?? 0
    const badge = commentCount > 0
      ? `<span data-output-comment-badge="true" style="position:absolute;top:8px;right:8px;background:#2563eb;color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;line-height:1;">${commentCount}</span>`
      : ""
    const savedPins = imagePointThreadsByAttachmentId?.get(attachment.id) ?? []
    const debugOverlays = !!options?.debugOutputImageOverlays
    if (debugOverlays && attachment.media_type === "image") {
      const allCommentThreadsCount = Array.from(imagePointThreadsByAttachmentId?.values() ?? []).reduce(
        (sum, rows) => sum + rows.length,
        0
      )
      console.log("[image overlay] render image", {
        outputId: options?.outputId ?? null,
        attachmentId: attachment.id,
        allCommentThreadsCount,
        matchingPins: savedPins,
      })
    }
    const pendingPin =
      options?.pendingPin
      && options.pendingPin.attachmentId === attachment.id
      ? `${Math.max(0, Math.min(1, options.pendingPin.anchorX))},${Math.max(0, Math.min(1, options.pendingPin.anchorY))}`
      : ""
    const widthPct = Number.isFinite(Number(block.width_pct))
      ? Math.max(20, Math.min(100, Number(block.width_pct)))
      : 100
    const commentPinsPayload = savedPins.map((thread) => ({
      threadId: thread.threadId,
      anchorX: Math.max(0, Math.min(1, thread.anchorX)),
      anchorY: Math.max(0, Math.min(1, thread.anchorY)),
    }))
    const commentPinsAttr = encodeURIComponent(JSON.stringify(commentPinsPayload))
    const activeThreadIdAttr = options?.activeThreadId != null ? String(options.activeThreadId) : ""
    const isEditableSelected = !!(options?.editable && options?.selectedAttachmentId === attachment.id)
    const outputMode = options?.mode ?? "display"
    const outputIdAttr = options?.outputId ? String(options.outputId) : ""
    const debugAttr = debugOverlays ? "true" : "false"
    const attachmentSignedUrl =
      typeof (attachment as { signed_url?: unknown }).signed_url === "string"
        ? ((attachment as { signed_url?: string }).signed_url as string)
        : null
    const attachmentPublicUrl =
      typeof (attachment as { public_url?: unknown }).public_url === "string"
        ? ((attachment as { public_url?: string }).public_url as string)
        : null
    const mediaSrc =
      block.signed_url
      ?? attachmentSignedUrl
      ?? attachmentPublicUrl
      ?? options?.attachmentDisplayUrlById?.[attachment.id]
      ?? attachment.file_path
    if (attachment.media_type === "video") {
      htmlParts.push(
        `<figure data-attachment-id="${attachment.id}" data-media-type="video" data-width-pct="${widthPct}" data-comment-count="${commentCount}" data-comment-pins="${commentPinsAttr}" data-active-thread-id="${activeThreadIdAttr}" data-pending-pin="${pendingPin}" data-editable-selected="${isEditableSelected ? "true" : "false"}" data-output-mode="${outputMode}" data-output-id="${outputIdAttr}" data-debug-output-image-overlays="${debugAttr}" contenteditable="false" style="margin:12px 0;position:relative;display:inline-block;overflow:visible;width:${widthPct}%;max-width:100%;"><video src="${mediaSrc}" controls style="width:100%;max-height:360px;border-radius:8px;"></video>${badge}</figure>`
      )
      continue
    }
    htmlParts.push(
      `<figure data-attachment-id="${attachment.id}" data-media-type="image" data-width-pct="${widthPct}" data-comment-count="${commentCount}" data-comment-pins="${commentPinsAttr}" data-active-thread-id="${activeThreadIdAttr}" data-pending-pin="${pendingPin}" data-editable-selected="${isEditableSelected ? "true" : "false"}" data-output-mode="${outputMode}" data-output-id="${outputIdAttr}" data-debug-output-image-overlays="${debugAttr}" contenteditable="false" style="margin:12px 0;position:relative;display:inline-block;overflow:visible;width:${widthPct}%;max-width:100%;"><img src="${mediaSrc}" alt="${attachment.alt_text ?? attachment.file_name}" style="display:block;height:auto;width:100%;max-height:360px;object-fit:contain;border-radius:8px;" />${badge}</figure>`
    )
  }
  return htmlParts.join("")
}

function blockTextLength(block: OutputContentBlock): number {
  if (block.type === "paragraph") return block.text.length + 1
  return 1
}

function insertAttachmentBlockAtPosition(
  blocks: OutputContentBlock[],
  attachmentId: string,
  position?: number
): OutputContentBlock[] {
  const normalizedBlocks: OutputContentBlock[] = blocks.length > 0
    ? blocks
    : [{ type: "paragraph", text: "" }]
  if (!Number.isFinite(position)) {
    return [...normalizedBlocks, { type: "attachment", attachment_id: attachmentId }, { type: "paragraph", text: "" }]
  }
  const target = Math.max(0, Number(position))
  let consumed = 0
  let insertionIndex = normalizedBlocks.length
  for (let i = 0; i < normalizedBlocks.length; i += 1) {
    const next = consumed + blockTextLength(normalizedBlocks[i])
    if (target <= next) {
      insertionIndex = i + 1
      break
    }
    consumed = next
  }
  const before = normalizedBlocks.slice(0, insertionIndex)
  const after = normalizedBlocks.slice(insertionIndex)
  const needsTrailingParagraph = after.length === 0 || after[0].type !== "paragraph"
  const trailingParagraph: OutputContentBlock = { type: "paragraph", text: "" }
  return [
    ...before,
    { type: "attachment", attachment_id: attachmentId },
    ...(needsTrailingParagraph ? [trailingParagraph] : []),
    ...after,
  ]
}

function mergeTextChangesIntoExistingBlocks(
  previousBlocks: OutputContentBlock[] | null | undefined,
  nextHtml: string
): OutputContentBlock[] {
  const nextBlocks = extractOutputContentBlocksFromHtml(nextHtml)
  const prev = previousBlocks ?? []
  const hasPrevAttachment = prev.some((block) => block.type === "attachment")
  const hasNextAttachment = nextBlocks.some((block) => block.type === "attachment")
  if (!hasPrevAttachment || hasNextAttachment) return nextBlocks

  const nextParagraphs = nextBlocks.filter((block): block is { type: "paragraph"; text: string } => block.type === "paragraph")
  const merged: OutputContentBlock[] = []
  let paragraphIdx = 0
  for (const block of prev) {
    if (block.type === "attachment") {
      merged.push(block)
      continue
    }
    const replacement = nextParagraphs[paragraphIdx]
    paragraphIdx += 1
    merged.push({
      type: "paragraph",
      text: replacement?.text ?? block.text ?? "",
    })
  }
  for (; paragraphIdx < nextParagraphs.length; paragraphIdx += 1) {
    merged.push(nextParagraphs[paragraphIdx])
  }
  if (!merged.some((block) => block.type === "paragraph")) {
    merged.push({ type: "paragraph", text: "" })
  }
  return merged
}

function paragraphBlocksToEditorHtml(blocks: OutputContentBlock[]): string {
  const paragraphText = blocks
    .filter((block): block is { type: "paragraph"; text: string } => block.type === "paragraph")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim()
  if (!paragraphText) return "<p></p>"
  if (isStreamingComponentOutputPreviewHtml(paragraphText)) {
    return paragraphText
  }
  return normalizeMixedRichText(paragraphText) || "<p></p>"
}

function wouldDropAttachments(
  previousBlocks: OutputContentBlock[],
  nextBlocks: OutputContentBlock[]
): boolean {
  const prevAttachmentIds = new Set(
    previousBlocks
      .filter((block): block is { type: "attachment"; attachment_id: string } => block.type === "attachment")
      .map((block) => block.attachment_id)
      .filter(Boolean)
  )
  if (prevAttachmentIds.size === 0) return false
  const nextAttachmentIds = new Set(
    nextBlocks
      .filter((block): block is { type: "attachment"; attachment_id: string } => block.type === "attachment")
      .map((block) => block.attachment_id)
      .filter(Boolean)
  )
  for (const attachmentId of Array.from(prevAttachmentIds)) {
    if (!nextAttachmentIds.has(attachmentId)) return true
  }
  return false
}

async function saveTaskComponentOutputContentWithGuard(params: {
  supabase: any
  outputId: string
  outputKey?: string
  previousBlocks: OutputContentBlock[]
  nextBlocks: OutputContentBlock[]
  contentText: string
  traceLabel?: string
  traceMeta?: Record<string, unknown>
}): Promise<boolean> {
  const {
    supabase,
    outputId,
    outputKey,
    previousBlocks,
    nextBlocks,
    contentText,
    traceLabel,
    traceMeta,
  } = params
  if (wouldDropAttachments(previousBlocks, nextBlocks)) {
    console.error("Blocked save because it would drop attachment blocks", {
      previousBlocks,
      attemptedBlocks: nextBlocks,
      outputId,
      outputKey,
    })
    return false
  }
  if (traceLabel) {
    console.trace(traceLabel, {
      outputId,
      previousBlocks,
      nextBlocks,
      hasAttachmentBlocks: nextBlocks.some((block) => block.type === "attachment"),
      ...traceMeta,
    })
  }
  const sanitizedBlocks = sanitizeBlocksForSave(nextBlocks)
  console.trace("save_task_component_output_content called", {
    outputId,
    contentJson: sanitizedBlocks,
    hasAttachmentBlocks: sanitizedBlocks.some((block) => block.type === "attachment"),
  })
  const { error } = await supabase.rpc("save_task_component_output_content", {
    p_output_id: outputId,
    p_content_text: contentText,
    p_content_json: sanitizedBlocks,
  })
  if (error) {
    console.error("[saveOutputBlocks] RPC error", {
      outputId,
      error,
      traceLabel,
      traceMeta,
    })
    throw error
  }
  console.log("[saveOutputBlocks] saved result", {
    outputId,
    error: null,
    data: { ok: true },
    traceLabel,
    traceMeta,
  })
  return true
}

interface TaskContentTabProps {
  taskId: number
  projectId?: number
  contentTypeId?: number
  languageId?: number
  taskTitle?: string
  contentTypeTitle?: string
  taskMetaTitle?: string
  taskMetaDescription?: string
  taskKeyword?: string
  taskSlug?: string
  projectLogoUrl?: string | null
  taskSourceUrls?: string[] | string | null
  canLoad?: boolean
  onChannelChange?: (channelId: number | null) => void
  onActiveFieldChange?: (context: AiActiveFieldContext) => void
  taskBuildInstructions?: string
  isSectionExpanded?: boolean
  onToggleSectionExpand?: () => void
  /** When true, initial task-channel rows come from `bootstrapTaskChannels` (task-details-bootstrap), not from a `task_channels` query. */
  skipInitialTaskChannelsFetch?: boolean
  /** Raw `task_channels` payload from task-details-bootstrap (joined with `channels`). */
  bootstrapTaskChannels?: unknown
  /** Required for `task-channel-bootstrap` edge function. */
  accessToken?: string | null
  /** When set, prefer this channel on init if it exists in the task's channel list. */
  preferredChannelId?: number | null
}

interface TaskChannel {
  channel_id: number
  name: string
}

interface TaskChannelBriefing {
  briefing_type_id: number | null
}

type ComponentScope = 'task' | 'project' | 'channel'

type ComponentOrigin = 'global' | 'project' | 'task'

function normalizeComponentOrigin(origin: unknown): ComponentOrigin | null {
  if (typeof origin !== 'string') return null
  const v = origin.trim().toLowerCase()
  if (!v) return null

  // Handle expanded backend variants (examples seen in RPC output):
  // - task_global -> Global
  // - task_project -> Project
  // - task_ad_hoc -> Task
  if (v === 'global' || v.endsWith('_global') || v.includes('global')) return 'global'
  if (v === 'project' || v.endsWith('_project') || v.includes('project')) return 'project'
  if (v === 'task' || v.startsWith('task') || v.includes('ad_hoc')) return 'task'

  return null
}

function normalizeBootstrapOutputContent(params: {
  row: any
  attachments: TaskComponentOutputAttachment[]
}) {
  const { row, attachments } = params
  const contentJsonBlocks = normalizeOutputContentJson(row?.content_json)
  const resolvedBlocks = normalizeOutputContentJson(row?.resolved_content_json)
  const contentBlocks = normalizeOutputContentJson(row?.content)

  const hasCanonicalContent = Array.isArray(contentJsonBlocks) && contentJsonBlocks.length > 0
  const referencedAttachmentIds = new Set(
    (contentJsonBlocks ?? [])
      .filter((block): block is Extract<OutputContentBlock, { type: "attachment" }> => block.type === "attachment")
      .map((block) => block.attachment_id)
      .filter(Boolean)
  )

  const unreferencedAttachmentIds = attachments
    .filter((attachment) => !referencedAttachmentIds.has(attachment.id))
    .map((attachment) => attachment.id)

  console.log("[bootstrap output content]", {
    outputId: typeof row?.task_component_output_id === "string" ? row.task_component_output_id : null,
    hasCanonicalContent,
    contentJsonBlockCount: contentJsonBlocks?.length ?? 0,
    attachmentCount: attachments.length,
    referencedAttachmentIds: Array.from(referencedAttachmentIds),
    unreferencedAttachmentIds,
    appendingLegacyAttachments: !hasCanonicalContent,
  })

  if (hasCanonicalContent) {
    return {
      content: contentJsonBlocks,
      resolved_content_json: contentJsonBlocks,
      content_json: contentJsonBlocks,
    }
  }

  return {
    content: contentBlocks,
    resolved_content_json: contentBlocks ?? resolvedBlocks,
    content_json: contentJsonBlocks ?? contentBlocks,
  }
}

function getComponentOrigin(component: Pick<TaskChannelComponent, 'origin' | 'task_component_id' | 'briefing_component_id' | 'project_component_id'>): ComponentOrigin {
  const normalized = normalizeComponentOrigin(component.origin)
  if (normalized) return normalized

  // Fallback heuristic (legacy behavior) for older RPC payloads
  if (component.task_component_id && !component.briefing_component_id && !component.project_component_id) return 'task'
  if (component.project_component_id) return 'project'
  if (component.briefing_component_id) return 'global'
  return 'task'
}

/** Parse numeric id from component_key e.g. "g:18" -> 18, "p:5" -> 5. Returns null if prefix doesn't match or id not a number. */
function parseIdFromComponentKey(key: string, prefix: 'g' | 'p'): number | null {
  if (!key || !key.startsWith(`${prefix}:`)) return null
  const num = parseInt(key.slice(prefix.length + 1), 10)
  return Number.isNaN(num) ? null : num
}

/** For pcctbc_remove: get p_component_id and p_is_project_component from component_key only. "p:" => true, "g:" => false. */
function getChannelRemoveParamsFromKey(componentKey: string): { p_component_id: number; p_is_project_component: boolean } | null {
  if (!componentKey) return null
  if (componentKey.startsWith('p:')) {
    const id = parseIdFromComponentKey(componentKey, 'p')
    return id != null ? { p_component_id: id, p_is_project_component: true } : null
  }
  if (componentKey.startsWith('g:')) {
    const id = parseIdFromComponentKey(componentKey, 'g')
    return id != null ? { p_component_id: id, p_is_project_component: false } : null
  }
  return null
}

export type ParsedComponentKey =
  | { kind: 'project'; projectComponentId: number }
  | { kind: 'global'; briefingComponentId: number }
  | { kind: 'task_ad_hoc'; taskComponentId: string }
  | { kind: 'ai_suggestion'; suggestionId: string }
  | { kind: 'unknown' }

/** Parse component_key (g:/p:/t:) for delete/visibility. Use this for both selected and available cards. */
function parseComponentKey(key?: string): ParsedComponentKey {
  if (!key || typeof key !== 'string') return { kind: 'unknown' }
  const trimmed = key.trim()
  if (trimmed.startsWith('p:')) {
    const id = parseIdFromComponentKey(trimmed, 'p')
    return id != null ? { kind: 'project', projectComponentId: id } : { kind: 'unknown' }
  }
  if (trimmed.startsWith('g:')) {
    const id = parseIdFromComponentKey(trimmed, 'g')
    return id != null ? { kind: 'global', briefingComponentId: id } : { kind: 'unknown' }
  }
  if (trimmed.startsWith('t:')) {
    const uuid = trimmed.slice(2).trim()
    return uuid ? { kind: 'task_ad_hoc', taskComponentId: uuid } : { kind: 'unknown' }
  }
  if (trimmed.startsWith('ai:')) {
    const suggestionId = trimmed.slice(3).trim()
    return suggestionId ? { kind: 'ai_suggestion', suggestionId } : { kind: 'unknown' }
  }
  return { kind: 'unknown' }
}

function parseAiSuggestionIdFromKey(key?: string): string | null {
  if (!key || typeof key !== 'string') return null
  const trimmed = key.trim()
  if (!trimmed.startsWith('ai:')) return null
  const suggestionId = trimmed.slice(3).trim()
  return suggestionId || null
}

function isMeaningfullyEmptyHtml(html?: string | null): boolean {
  if (!html) return true

  const normalized = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/p>\s*<p>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/gi, " ")
    .replace(/<[^>]*>/g, "")
    .trim()

  return normalized.length === 0
}

interface TaskChannelComponent {
  // From tc_components_for_task_channel RPC
  task_component_id: string | null // UUID if component is added to this task, null if just available from template
  briefing_component_id: number | null // Legacy/global id; do not assume table based on field name alone
  project_component_id: number | null // ID from project_components table, or null
  /** From RPC: g:<id> | p:<id> | t:<uuid>. Use this for all identity actions (add to all channels, apply to template); never reconstruct. */
  component_key?: string
  /** From RPC: global | project | task_ad_hoc */
  kind?: 'global' | 'project' | 'task_ad_hoc'
  /** From RPC: true when component is in the current briefing type template (for "Remove from template" visibility). Do not infer from tag. */
  in_current_template?: boolean
  /** From RPC: task_channel | task_project | task_global = in template; task_only | task_ad_hoc = not in template. Use for selected-pile Remove from template visibility. */
  template_layer?: string
  /**
   * New backend field. Use this for UI labeling instead of legacy `source`.
   * - global: global (system) component
   * - project: project component
   * - task: task ad-hoc component
   */
  origin?: string
  /**
   * New backend field.
   * True when a global component is overridden (customized) at project/channel level.
   * Only meaningful when origin === 'global'.
   */
  global_overridden?: boolean
  title: string
  description: string | null
  selected: boolean // True = top area, False = bottom area (explicitly deselected)
  position: number | null
  custom_title: string | null
  custom_description: string | null
  /** From RPC: project template title (v_project_briefing_types_components_resolved join); used for dirty indicator. */
  project_template_title?: string | null
  /** From RPC: project template description (same source); used for dirty indicator. */
  project_template_description?: string | null
  purpose: string | null
  guidance: string | null
  suggested_word_count: number | null
  subheads: any[] | null
  is_ad_hoc?: boolean // True for ad-hoc components
  component_scope?: ComponentScope
  generationStatus?: GenerationStatus
}

type AvailableComponentTag =
  | 'Removed from task'
  | 'Recommended'
  | 'Removed'
  | 'System'
  | 'System (other briefings)'
  | 'Custom'
  | 'AI suggestions'

interface TaskChannelAvailableComponent {
  /** Stable key from RPC: g:<id> | p:<id> | t:<uuid> */
  component_key: string
  /** Legacy; prefer component_key */
  key: string
  tag: AvailableComponentTag | string
  title: string
  description: string | null
  /** global | project | task_ad_hoc */
  kind: 'global' | 'project' | 'task_ad_hoc' | 'ai_suggestion'
  /** For global = briefing_component_id, for project = project_component_id; use for insert */
  component_id: number | null
  is_project_component: boolean
  briefing_component_id: number | null
  project_component_id: number | null
  custom_title: string | null
  custom_description: string | null
  /** Row id in task_channel_components; non-null only for tag "Removed from task" */
  task_component_id: string | null
  /** From BE: true when component is in the current briefing type template (for "Remove from template" visibility) */
  in_current_template?: boolean
}

function mapContentComponentRowsToActive(
  rows: Array<TaskChannelBootstrapComponentRow | TaskChannelContentComponentRow>,
): TaskChannelComponent[] {
  const mapped: TaskChannelComponent[] = (rows || []).map((row) => {
    const component_key =
      (row.component_key && String(row.component_key)) ||
      (row.briefing_component_id != null
        ? `g:${row.briefing_component_id}`
        : row.task_component_id
          ? `t:${row.task_component_id}`
          : '')
    const parsed = parseComponentKey(component_key)
    let project_component_id: number | null = null
    let briefing_component_id = row.briefing_component_id ?? null
    if (parsed.kind === 'project') project_component_id = parsed.projectComponentId
    if (parsed.kind === 'global') briefing_component_id = parsed.briefingComponentId
    if (parsed.kind === 'task_ad_hoc') briefing_component_id = row.briefing_component_id ?? null

    const stub: Pick<TaskChannelComponent, 'origin' | 'task_component_id' | 'briefing_component_id' | 'project_component_id'> = {
      origin: row.origin ?? undefined,
      task_component_id: row.task_component_id ?? null,
      briefing_component_id,
      project_component_id,
    }
    const originNorm = getComponentOrigin(stub)
    const kind: TaskChannelComponent['kind'] =
      originNorm === 'project' ? 'project' : originNorm === 'global' ? 'global' : 'task_ad_hoc'

    return {
      task_component_id: row.task_component_id ?? null,
      briefing_component_id,
      project_component_id,
      component_key: component_key || undefined,
      kind,
      in_current_template: true,
      template_layer: row.template_layer ?? undefined,
      origin: row.origin ?? undefined,
      global_overridden: !!row.global_overridden,
      title: row.title || '',
      description: row.description ?? null,
      selected: !!row.selected,
      position: row.position ?? null,
      custom_title: null,
      custom_description: null,
      project_template_title: row.project_template_title ?? null,
      project_template_description: row.project_template_description ?? null,
      purpose: null,
      guidance: null,
      suggested_word_count: null,
      subheads: null,
      is_ad_hoc: !!row.is_ad_hoc,
    }
  })
  // Active concrete components only — never filter/group by briefing type.
  // Order: position ASC NULLS LAST, then stable task_component_id.
  return sortTaskChannelComponentsByPosition(
    mapped.filter((r) => r.selected && !!r.task_component_id),
  )
}

/** @deprecated Prefer mapContentComponentRowsToActive — kept for bootstrap SEO/available helpers. */
function mapBootstrapComponentRowsToActive(rows: TaskChannelBootstrapComponentRow[]): TaskChannelComponent[] {
  return mapContentComponentRowsToActive(rows)
}

function mapBootstrapAvailableRows(rows: TaskChannelBootstrapAvailableRow[]): TaskChannelAvailableComponent[] {
  return (rows || []).map((row) => {
    const component_key = row.component_key || row.key
    const parsed = parseComponentKey(component_key)
    let briefing_component_id: number | null = null
    let project_component_id: number | null = null
    if (parsed.kind === 'global') briefing_component_id = parsed.briefingComponentId
    if (parsed.kind === 'project') project_component_id = parsed.projectComponentId

    const kindRaw = (row.kind ?? '').toLowerCase()
    const kind: TaskChannelAvailableComponent['kind'] = kindRaw.includes('ai')
      ? 'ai_suggestion'
      : kindRaw.includes('project')
        ? 'project'
        : kindRaw.includes('global')
          ? 'global'
          : 'task_ad_hoc'

    return {
      component_key,
      key: component_key,
      tag: row.tag as TaskChannelAvailableComponent['tag'],
      title: row.title,
      description: row.description ?? null,
      kind,
      component_id: row.component_id ?? null,
      is_project_component: row.is_project_component,
      briefing_component_id,
      project_component_id,
      custom_title: row.custom_title ?? null,
      custom_description: row.custom_description ?? null,
      task_component_id: row.task_component_id ?? null,
      in_current_template: row.in_current_template === true,
    }
  })
}

function categoryForAvailableComponent(component: TaskChannelAvailableComponent): string {
  const rawTag = typeof component.tag === 'string' ? component.tag.trim() : ''
  if (rawTag.length > 0) return rawTag
  if (component.kind === 'ai_suggestion') return 'AI suggestions'
  if (component.kind === 'project') return 'Custom'
  return 'System'
}

function categoryForSelectedComponent(component: TaskChannelComponent): string {
  const origin = getComponentOrigin(component)
  if (origin === 'project' || origin === 'task' || component.global_overridden) return 'Custom'
  return 'System'
}

function sanitizeSuggestionTitle(title: string | null | undefined): string | null {
  const value = (title ?? '').trim()
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized === 'write exciting title' || normalized === 'write an exciting title') return null
  return value
}

function availableTagBadgeClass(tag: string): string {
  const normalized = tag.toLowerCase()
  if (normalized === 'recommended') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized === 'removed' || normalized === 'removed from task') return 'border-gray-200 bg-gray-50 text-gray-600'
  if (normalized === 'system' || normalized === 'system (other briefings)') return 'border-gray-200 bg-gray-50 text-gray-700'
  if (normalized === 'custom') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (normalized === 'ai suggestions') return 'border-violet-200 bg-violet-50 text-violet-700'
  return 'border-gray-200 bg-gray-50 text-gray-700'
}

function getUserInitials(name: string | null | undefined): string {
  const value = (name ?? "").trim()
  if (!value) return "?"
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function CommentUserAvatar({
  name,
  photo,
}: {
  name: string | null | undefined
  photo?: string | null
}) {
  const photoUrl = getImageUrl(photo || undefined)
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || "User"}
        className="h-7 w-7 rounded-full border border-gray-300 object-cover"
      />
    )
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-gray-100 text-[11px] font-semibold text-gray-700">
      {getUserInitials(name)}
    </div>
  )
}

function OutputCommentComposerPopover({
  isOpen,
  selectionDraft,
  currentUserName,
  currentUserPhoto,
  currentUserId,
  projectId,
  allProjectUsers,
  commentText,
  pendingParticipants,
  removedParticipants,
  defaultParticipants,
  isSubmitting,
  onCommentTextChange,
  onPendingParticipantsChange,
  onRemovedParticipantsChange,
  onCancel,
  onSubmit,
}: {
  isOpen: boolean
  selectionDraft: OutputSelectionDraft | null
  currentUserName?: string | null
  currentUserPhoto?: string | null
  currentUserId?: number | null
  projectId?: number
  allProjectUsers: OutputCommentUserOption[]
  commentText: string
  pendingParticipants: any[]
  removedParticipants: any[]
  defaultParticipants: any[]
  isSubmitting: boolean
  onCommentTextChange: (value: string) => void
  onPendingParticipantsChange: (next: any[]) => void
  onRemovedParticipantsChange: (next: any[]) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const hasDraft = commentText.trim().length > 0
  const requestDismiss = useCallback(() => {
    if (!hasDraft) {
      onCancel()
      return
    }
    setShowDiscardConfirm(true)
  }, [hasDraft, onCancel])
  useEffect(() => {
    if (!isOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if ((target as Element).closest?.("[data-comment-watcher-picker='true'], [data-comment-watcher-picker-trigger='true'], [data-radix-popper-content-wrapper]")) {
        return
      }
      if (containerRef.current?.contains(target)) return
      requestDismiss()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      requestDismiss()
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [isOpen, requestDismiss])
  if (!isOpen || !selectionDraft) return null
  const fixedTop = Math.max(84, selectionDraft.anchorTop)
  const fixedLeft = Math.max(16, selectionDraft.anchorLeft)
  return (
    <>
      <div
        ref={containerRef}
        className="fixed z-[80] w-[min(92vw,28rem)]"
        style={{
          left: `${fixedLeft}px`,
          top: `${fixedTop}px`,
          transform: "translate(-12%, 0)",
        }}
      >
        <div className="rounded-md border border-gray-200 bg-white p-2 shadow-lg">
        <div className="mb-2 flex items-start gap-2">
          <CommentUserAvatar name={currentUserName} photo={currentUserPhoto} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-gray-700">{currentUserName || "You"}</div>
            <div className="text-[11px] text-gray-400">{new Date().toLocaleString()}</div>
          </div>
        </div>
        <Textarea
          value={commentText}
          onChange={(event) => onCommentTextChange(event.target.value)}
          placeholder="Write comment..."
          className="mt-2 min-h-[92px]"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="origin-left scale-[0.9]">
            <ThreadParticipantsInline
              pendingMode
              pendingParticipants={pendingParticipants}
              setPendingParticipants={onPendingParticipantsChange}
              removedParticipants={removedParticipants}
              setRemovedParticipants={onRemovedParticipantsChange}
              participants={defaultParticipants}
              allProjectUsers={allProjectUsers}
              currentUserId={currentUserId ?? null}
              projectId={projectId ?? 0}
            />
          </div>
          <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={requestDismiss}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!commentText.trim() || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? "Creating..." : "Comment"}
          </Button>
          </div>
        </div>
      </div>
      </div>
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard comment draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved comment. Discard it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDiscardConfirm(false)
                onCancel()
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function OutputCommentThreadCard({
  thread,
  currentUserId,
  currentUserName,
  onResolveToggle,
  onReplyAdded,
  taskId,
  showReplyInput = true,
  isExpanded = true,
  initialMessages,
  isSelected = false,
  onSelect,
}: {
  thread: OutputCommentThread
  currentUserId?: number | null
  currentUserName?: string | null
  onResolveToggle: () => void
  onReplyAdded: () => void
  taskId: number
  showReplyInput?: boolean
  isExpanded?: boolean
  initialMessages?: any[]
  isSelected?: boolean
  onSelect?: () => void
}) {
  const [replyTo, setReplyTo] = useState<{ id: number; author?: string; preview: string } | null>(null)
  const preview = thread.previewComment ?? thread.latestComment ?? thread.firstComment ?? null
  const previewAuthor = preview?.users?.full_name ?? preview?.users?.email ?? "Unknown user"
  const previewText = preview?.comment ?? ""
  const previewDate = preview?.created_at
  const participantAvatars = thread.watchers.slice(0, 5)
  const effectiveReplyCount = Number.isFinite(Number(thread.replyCount))
    ? Math.max(0, Number(thread.replyCount))
    : Math.max(0, thread.mentions.length - 1)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.()}
      onKeyDown={(event) => {
        if (!onSelect) return
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        onSelect()
      }}
      className={`rounded-md border bg-white ${isSelected ? "border-blue-300" : "border-gray-200"}`}
    >
      <div className="space-y-2 border-b p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-gray-700">{previewAuthor}</div>
            <div className="text-[11px] text-gray-500">
              {previewDate ? new Date(previewDate).toLocaleString() : ""}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => {
                      if (!preview?.id) return
                      setReplyTo({
                        id: preview.id,
                        author: previewAuthor,
                        preview: (previewText || "Comment").slice(0, 120),
                      })
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Reply</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    onClick={onResolveToggle}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{thread.resolvedAt ? "Reopen" : "Resolve"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="text-xs text-gray-700">{previewText || "Comment"}</div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center -space-x-1">
            {participantAvatars.map((watcher) => {
              const photoUrl = getImageUrl(watcher.photo || undefined)
              const fallback = (watcher.full_name || watcher.email || `U${watcher.id}`)
                .split(/\s+/)
                .filter(Boolean)
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()
              return photoUrl ? (
                <img
                  key={watcher.id}
                  src={photoUrl}
                  alt={watcher.full_name || watcher.email || `User #${watcher.id}`}
                  className="h-5 w-5 rounded-full object-cover"
                  title={watcher.full_name || watcher.email || `User #${watcher.id}`}
                />
              ) : (
                <div
                  key={watcher.id}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-700"
                  title={watcher.full_name || watcher.email || `User #${watcher.id}`}
                >
                  {fallback || "?"}
                </div>
              )
            })}
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500">
              +
            </span>
          </div>
          {effectiveReplyCount > 0 ? (
            <span className="text-[11px] text-gray-500">
              {effectiveReplyCount} repl{effectiveReplyCount === 1 ? "y" : "ies"}
            </span>
          ) : null}
        </div>
      </div>
      {isExpanded ? (
        <div className="max-h-[18rem] overflow-auto p-2">
          <ThreadedRealtimeChat
            threadId={thread.threadId}
            currentUserId={currentUserId ?? 0}
            currentPublicUserId={currentUserId ?? undefined}
            currentUserName={currentUserName || "You"}
            hideInput
            initialMessages={initialMessages}
            onReplySelected={(payload) => {
              setReplyTo(payload)
            }}
          />
        </div>
      ) : null}
      {showReplyInput ? (
        <div className="border-t">
          <AddCommentInput
            taskId={taskId}
            threadId={thread.threadId}
            onCommentAdded={onReplyAdded}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
          />
        </div>
      ) : null}
    </div>
  )
}

interface TaskComponentOutput {
  content: OutputContentBlock[] | null
  content_text: string | null
  resolved_content_json: OutputContentBlock[] | null
  content_json: OutputContentBlock[] | null
  attachment_map: Record<string, TaskComponentOutputAttachment> | null
  updated_at: string | null
  task_component_output_id: string | null
  attachments: TaskComponentOutputAttachment[]
  comment_thread_count: number
  open_comment_thread_count: number
}

type OutputContentBlock =
  | { type: "paragraph"; text: string }
  | {
      type: "attachment"
      attachment_id: string
      width_pct?: number
      attachment?: TaskComponentOutputAttachment | null
      missing_attachment?: boolean
      inserted_by_bootstrap?: boolean
      signed_url?: string | null
      public_url?: string | null
      file_path?: string | null
      mime_type?: string | null
      media_type?: string | null
      alt_text?: string | null
      caption?: string | null
    }

interface OutputCommentUserOption {
  id: number
  full_name: string
  email: string
  auth_user_id: string
  photo?: string | null
}

interface OutputSelectionDraft {
  start: number
  end: number
  text: string
  anchorLeft: number
  anchorTop: number
  anchorType?: "text_range" | "image_point"
  attachmentId?: string | null
  anchorX?: number | null
  anchorY?: number | null
}

interface CommentNavigationTarget {
  taskId: number
  threadId: number | null
  outputId: string | null
  attachmentId: string | null
  anchorType: string | null
  anchorStart: number | null
  anchorEnd: number | null
  anchorX: number | null
  anchorY: number | null
  anchorQuote: string | null
  token: number
}

interface InFlightComponentGeneration {
  taskComponentId: string
  status: "generating" | "complete" | "failed"
  previewText: string
  previewBlocks?: OutputContentBlock[] | null
  updatedAt: string
}

interface FinalComponentOutputPreview {
  taskComponentId: string
  taskComponentOutputId: string | null
  blocks: OutputContentBlock[]
  updatedAt: string
  source: "final-component-output-event"
}

type ComponentRemovalRollback = {
  components: TaskChannelComponent[]
  removedComponents: TaskChannelComponent[]
  componentOutputs: Map<string, TaskComponentOutput>
  outputValues: Array<[string, string]>
  outputJsonValues: Array<[string, OutputContentBlock[]]>
  inFlightComponentGenerations: Map<string, InFlightComponentGeneration>
  generatingComponentKeys: Set<string>
  finalComponentOutputPreviews: Map<string, FinalComponentOutputPreview>
  bootstrapSnapshot: TaskChannelBootstrapResponse | undefined
}

type GenerationStatus = "queued" | "generating" | "completed" | "error"

type InteractiveGenerationStreamOptions = {
  message?: string | null
  displayMessage?: string | null
  componentLabel?: string | null
  autoRun?: boolean
}

function normalizeInteractiveGenerationStreamOptions(
  value: string | InteractiveGenerationStreamOptions | null | undefined,
): InteractiveGenerationStreamOptions {
  if (typeof value === "string") return { message: value }
  return value ?? {}
}

interface GenerationPlanRow {
  task_component_id: string
  title: string | null
  description: string | null
  generation_prompt: string | null
  briefing_component_id: number | null
  project_component_id: number | null
  component_key: string | null
  kind: string | null
  position: number | null
}

interface EffectiveSEO {
  seo_required: boolean | null
  seo_source: string | null
  primary_keyword: string | null
  secondary_keywords: string[] | null
}

// Special "Main" component ID for channels without a structured briefing
const MAIN_BRIEFING_COMPONENT_ID = 80
const FOCUSED_ALL_SELECTED_OUTPUTS_KEY = "__focused_all_selected_outputs__"
const FOCUS_OUTPUTS_URL_PARAM = "focusOutputs"
const DEBUG_OUTPUT_IMAGE_OVERLAYS = true

function getDebugOutputImageOverlaysEnabled(): boolean {
  if (typeof window === "undefined") return false
  if (DEBUG_OUTPUT_IMAGE_OVERLAYS) return true
  try {
    return window.localStorage.getItem("debugOutputImageOverlays") === "1"
  } catch {
    return false
  }
}

function getDebugImageCommentPositionEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem("debugImageCommentPosition") === "1"
  } catch {
    return false
  }
}

function isSignedOrPublicUrl(value?: string | null): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value)
}

const attachmentDisplayUrlCache = new Map<string, string>()

async function getAttachmentDisplayUrl(params: {
  supabase: any
  attachment: TaskComponentOutputAttachment & Record<string, any>
  outputId?: string | null
  reason?: string
}): Promise<string> {
  const { supabase, attachment, outputId = null, reason = "unknown" } = params
  const existingUrl =
    attachment.signedUrl
    ?? attachment.signed_url
    ?? attachment.url
    ?? attachment.preview_url
    ?? null

  console.log("[media url] resolving", {
    attachmentId: attachment.id,
    file_path: attachment.file_path,
    hasSignedUrl: Boolean(existingUrl),
  })

  if (existingUrl && isSignedOrPublicUrl(existingUrl)) {
    return existingUrl
  }

  const filePath = attachment.file_path
  if (!filePath) {
    throw new Error("Attachment missing file_path")
  }

  const cached = attachmentDisplayUrlCache.get(filePath)
  console.log("[media url] request display url", {
    outputId,
    attachmentId: attachment.id,
    filePath,
    cacheHit: Boolean(cached),
    reason,
  })
  if (cached) return cached

  if (isSignedOrPublicUrl(filePath)) {
    console.warn("[media url] attachment.file_path is already a URL; using it directly and not signing again", {
      attachmentId: attachment.id,
      file_path: filePath,
    })
    return filePath
  }

  console.log("[media url] signing raw path", {
    outputId,
    attachmentId: attachment.id,
    file_path: filePath,
    reason,
  })
  console.count(`[media url] sign ${attachment.id}`)
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(filePath, 3600)
  if (error) throw error
  const signed = data?.signedUrl ?? filePath
  attachmentDisplayUrlCache.set(filePath, signed)
  console.log("[media url] signed", {
    outputId,
    attachmentId: attachment.id,
    filePath,
    reason,
  })
  return signed
}

function getOutputMapKeyFromTaskComponentId(taskComponentId: string): string {
  return `task:${taskComponentId}`
}

function getGeneratingKeyFromTaskComponentId(taskComponentId: string): string {
  return `t:${taskComponentId}`
}

function getOutputMapKeyFromBriefingId(briefingComponentId: number): string {
  return `briefing:${briefingComponentId}`
}

function getOutputMapKeysForRow(params: {
  taskComponentId?: string | null
  briefingComponentId?: number | null
}): string[] {
  const keys: string[] = []
  if (typeof params.briefingComponentId === 'number') {
    keys.push(getOutputMapKeyFromBriefingId(params.briefingComponentId))
  }
  if (typeof params.taskComponentId === 'string' && params.taskComponentId.length > 0) {
    keys.push(getOutputMapKeyFromTaskComponentId(params.taskComponentId))
  }
  return keys
}

function getOutputMapKeyFromComponent(component: Pick<TaskChannelComponent, 'task_component_id' | 'briefing_component_id'>): string | null {
  if (component.task_component_id) return getOutputMapKeyFromTaskComponentId(component.task_component_id)
  if (typeof component.briefing_component_id === 'number') return getOutputMapKeyFromBriefingId(component.briefing_component_id)
  return null
}

function getOutputForComponent(
  outputs: Map<string, TaskComponentOutput>,
  component: Pick<TaskChannelComponent, 'task_component_id' | 'briefing_component_id'>
): TaskComponentOutput | null {
  if (component.task_component_id) {
    const byTaskId = outputs.get(getOutputMapKeyFromTaskComponentId(component.task_component_id))
    if (byTaskId) return byTaskId
  }
  if (typeof component.briefing_component_id === 'number') {
    const byBriefingId = outputs.get(getOutputMapKeyFromBriefingId(component.briefing_component_id))
    if (byBriefingId) return byBriefingId
  }
  return null
}

function buildOutputRecord(
  base: Partial<TaskComponentOutput> | null | undefined,
  overrides: Partial<TaskComponentOutput>
): TaskComponentOutput {
  const nextContent =
    overrides.content
    ?? overrides.resolved_content_json
    ?? overrides.content_json
    ?? base?.content
    ?? null
  return {
    content: nextContent,
    content_text: overrides.content_text ?? base?.content_text ?? null,
    resolved_content_json: overrides.resolved_content_json ?? base?.resolved_content_json ?? null,
    content_json: overrides.content_json ?? base?.content_json ?? null,
    attachment_map: overrides.attachment_map ?? base?.attachment_map ?? null,
    updated_at: overrides.updated_at ?? base?.updated_at ?? null,
    task_component_output_id: overrides.task_component_output_id ?? base?.task_component_output_id ?? null,
    attachments: overrides.attachments ?? base?.attachments ?? [],
    comment_thread_count: overrides.comment_thread_count ?? base?.comment_thread_count ?? 0,
    open_comment_thread_count: overrides.open_comment_thread_count ?? base?.open_comment_thread_count ?? 0,
  }
}

/**
 * Build a non-colliding "copy" title for a duplicated component.
 * "Vantagens" -> "Vantagens copy" -> "Vantagens copy 2" -> "Vantagens copy 3" ...
 */
function computeDuplicateComponentTitle(baseTitle: string, existing: TaskChannelComponent[]): string {
  const base = (baseTitle || 'Component').trim() || 'Component'
  const existingTitles = new Set(
    existing
      .map((c) => (c.custom_title || c.title || '').trim().toLowerCase())
      .filter((t) => t.length > 0)
  )
  const firstCandidate = `${base} copy`
  if (!existingTitles.has(firstCandidate.toLowerCase())) return firstCandidate
  let suffix = 2
  while (existingTitles.has(`${base} copy ${suffix}`.toLowerCase())) suffix += 1
  return `${base} copy ${suffix}`
}

function tryExtractTaskComponentId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (Array.isArray(value) && value.length > 0) return tryExtractTaskComponentId(value[0])
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  const candidates = [obj.out_id, obj.task_component_id, obj.id, obj.taskComponentId, obj.task_component]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }
  return null
}

function normalizeRpcRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
  }
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).rows)) {
    return ((value as Record<string, unknown>).rows as unknown[]).filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
  }
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).data)) {
    return ((value as Record<string, unknown>).data as unknown[]).filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
  }
  return []
}

function normalizeGenerationPlanRows(value: unknown): GenerationPlanRow[] {
  return normalizeRpcRows(value)
    .map((row) => {
      const taskComponentId = tryExtractTaskComponentId(row)
      if (!taskComponentId) return null
      const title = typeof row.title === "string" ? row.title : null
      const description = typeof row.description === "string" ? row.description : null
      const generationPrompt = typeof row.generation_prompt === "string"
        ? row.generation_prompt
        : typeof row.generationPrompt === "string"
          ? row.generationPrompt
          : description
      return {
        task_component_id: taskComponentId,
        title,
        description,
        generation_prompt: generationPrompt ?? null,
        briefing_component_id:
          typeof (row.out_briefing_component_id ?? row.briefing_component_id) === "number"
            ? (row.out_briefing_component_id ?? row.briefing_component_id) as number
            : null,
        project_component_id:
          typeof (row.out_project_component_id ?? row.project_component_id) === "number"
            ? (row.out_project_component_id ?? row.project_component_id) as number
            : null,
        component_key: typeof row.component_key === "string" ? row.component_key : null,
        kind: typeof row.kind === "string" ? row.kind : null,
        position:
          typeof (row.out_component_position ?? row.component_position ?? row.position) === "number"
            ? (row.out_component_position ?? row.component_position ?? row.position) as number
            : null,
      } satisfies GenerationPlanRow
    })
    .filter((row): row is GenerationPlanRow => !!row)
}

function extractBulkInsertedTaskComponentIds(value: unknown): string[] {
  const directFromRows = normalizeRpcRows(value)
    .map((row) => {
      const outId = typeof row.out_id === "string" ? row.out_id : null
      return outId ?? tryExtractTaskComponentId(row)
    })
    .filter((id): id is string => typeof id === "string" && id.length > 0)
  if (directFromRows.length > 0) return Array.from(new Set(directFromRows))

  if (Array.isArray(value)) {
    const asStrings = value
      .map((entry) => (typeof entry === "string" ? entry : null))
      .filter((id): id is string => !!id && id.length > 0)
    if (asStrings.length > 0) return Array.from(new Set(asStrings))
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const nestedCandidates = [obj.ids, obj.inserted_ids, obj.task_component_ids]
    for (const candidate of nestedCandidates) {
      if (!Array.isArray(candidate)) continue
      const ids = candidate
        .map((entry) => (typeof entry === "string" ? entry : null))
        .filter((id): id is string => !!id && id.length > 0)
      if (ids.length > 0) return Array.from(new Set(ids))
    }
  }

  return []
}

const KEYWORD_HIGHLIGHT_PALETTE = ['#fef3c7', '#dbeafe', '#fee2e2', '#dcfce7', '#ede9fe', '#fed7aa'] as const

function dedupeKeywordsCaseInsensitive(keywords: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const keyword of keywords) {
    const trimmed = keyword.trim()
    if (!trimmed) continue
    const normalized = trimmed.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(trimmed)
  }
  return deduped
}

function parseKeywordTokensFromRaw(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function buildTaskChannelKeywordList(
  variantSEO: CTTVariantSEO | null | undefined,
  persisted: { primaryKeyword: string; secondaryKeywords: string[] } | null,
): string[] {
  const primary = (variantSEO?.primary_keyword ?? '').trim()
  const secRaw = variantSEO?.secondary_keywords
  const secondary = Array.isArray(secRaw)
    ? secRaw.map((keyword) => String(keyword).trim()).filter(Boolean)
    : typeof secRaw === 'string'
      ? parseKeywordTokensFromRaw(secRaw)
      : []
  const fromVariant = dedupeKeywordsCaseInsensitive(primary ? [primary, ...secondary] : secondary)
  if (fromVariant.length > 0) return fromVariant

  if (!persisted) return []
  const persistedPrimary = persisted.primaryKeyword.trim()
  return dedupeKeywordsCaseInsensitive(
    persistedPrimary ? [persistedPrimary, ...persisted.secondaryKeywords] : persisted.secondaryKeywords,
  )
}

function getComponentOutputDisplayTitle(
  component: Pick<TaskChannelComponent, "custom_title" | "title" | "project_template_title">,
  composedOutputTitle?: string | null,
): string {
  return (
    component.custom_title?.trim()
    || component.title?.trim()
    || composedOutputTitle?.trim()
    || component.project_template_title?.trim()
    || "Component output"
  )
}

function taskChannelComponentToExportRow(component: TaskChannelComponent) {
  return {
    task_component_id: component.task_component_id,
    briefing_component_id: component.briefing_component_id,
    project_component_id: component.project_component_id,
    title: component.title,
    custom_title: component.custom_title,
    selected: component.selected,
    position: component.position,
    kind: component.kind ?? null,
  }
}

function countKeywordOccurrences(text: string, keyword: string): number {
  const term = keyword.trim()
  if (!term) return 0
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'gi')
  let count = 0
  let match = regex.exec(text)
  while (match) {
    count += 1
    if (regex.lastIndex === match.index) regex.lastIndex += 1
    match = regex.exec(text)
  }
  return count
}

function replaceFirstInsensitive(source: string, term: string, replacement: string): { value: string; changed: boolean } {
  const trimmed = term.trim()
  if (!trimmed) return { value: source, changed: false }
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(escaped, 'i')
  if (!matcher.test(source)) return { value: source, changed: false }
  return { value: source.replace(matcher, replacement), changed: true }
}

function replaceAllInsensitive(source: string, term: string, replacement: string): { value: string; changed: boolean } {
  const trimmed = term.trim()
  if (!trimmed) return { value: source, changed: false }
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(escaped, 'gi')
  if (!matcher.test(source)) return { value: source, changed: false }
  return { value: source.replace(matcher, replacement), changed: true }
}

function replaceUrlTargetsInStructuredValue(
  value: unknown,
  targetNormalizedUrl: string,
  replacementUrl: string
): { value: unknown; replacements: number } {
  let replacements = 0

  const maybeReplaceUrl = (candidate: unknown): unknown => {
    if (typeof candidate !== 'string') return candidate
    const normalized = normalizeUrl(candidate).normalizedUrl
    if (!normalized || normalized !== targetNormalizedUrl) return candidate
    replacements += 1
    return replacementUrl
  }

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => walk(item))
    }
    if (!node || typeof node !== 'object') return node

    const obj = node as Record<string, unknown>
    const next: Record<string, unknown> = {}

    for (const [key, raw] of Object.entries(obj)) {
      if (key === 'href' || key === 'url' || key === 'link') {
        next[key] = maybeReplaceUrl(raw)
        continue
      }
      if (key === 'attrs' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const attrs = raw as Record<string, unknown>
        const nextAttrs: Record<string, unknown> = { ...attrs }
        if (typeof attrs.href === 'string') nextAttrs.href = maybeReplaceUrl(attrs.href)
        if (typeof attrs.url === 'string') nextAttrs.url = maybeReplaceUrl(attrs.url)
        next[key] = nextAttrs
        continue
      }
      if (key === 'marks' && Array.isArray(raw)) {
        next[key] = raw.map((mark) => {
          if (!mark || typeof mark !== 'object') return mark
          const markObj = mark as Record<string, unknown>
          const markType = typeof markObj.type === 'string' ? markObj.type : ''
          if (markType !== 'link') return walk(mark)
          const markAttrs = markObj.attrs && typeof markObj.attrs === 'object'
            ? (markObj.attrs as Record<string, unknown>)
            : null
          if (!markAttrs) return walk(mark)
          return {
            ...markObj,
            attrs: {
              ...markAttrs,
              href: typeof markAttrs.href === 'string' ? maybeReplaceUrl(markAttrs.href) : markAttrs.href,
            },
          }
        })
        continue
      }
      next[key] = walk(raw)
    }

    return next
  }

  return { value: walk(value), replacements }
}

function replaceUrlTargetsInText(
  text: string,
  targetNormalizedUrl: string,
  replacementUrl: string
): { value: string; replacements: number } {
  let replacements = 0
  let next = text

  const replaceCandidate = (candidate: string): string => {
    const normalized = normalizeUrl(candidate).normalizedUrl
    if (!normalized || normalized !== targetNormalizedUrl) return candidate
    replacements += 1
    return replacementUrl
  }

  next = next.replace(
    /(<a\b[^>]*?\bhref\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_match, prefix, href1, href2, href3) => {
      const href = String(href1 ?? href2 ?? href3 ?? '')
      const updated = replaceCandidate(href)
      return `${prefix}"${updated}"`
    }
  )

  next = next.replace(
    /\[([^\]]+)\]\(([^)\s]+(?:\([^)]+\)[^)\s]*)?)\)/g,
    (match, anchor, url) => {
      const href = String(url ?? '')
      const updated = replaceCandidate(href)
      if (updated === href) return match
      return `[${String(anchor ?? '')}](${updated})`
    }
  )

  next = next.replace(/<\s*(https?:\/\/[^>\s]+)\s*>/gi, (match, url) => {
    const href = String(url ?? '')
    const updated = replaceCandidate(href)
    if (updated === href) return match
    return `<${updated}>`
  })

  next = next.replace(/\bhttps?:\/\/[^\s<>"'`]+/gi, (url) => replaceCandidate(url))

  return { value: next, replacements }
}

function replaceUrlTargetsInOutput(
  output: string,
  targetNormalizedUrl: string,
  replacementUrl: string
): { value: string; replacements: number } {
  const raw = output ?? ''
  const trimmed = raw.trim()
  if (!trimmed) return { value: raw, replacements: 0 }

  try {
    const parsed = JSON.parse(trimmed)
    const structuredResult = replaceUrlTargetsInStructuredValue(parsed, targetNormalizedUrl, replacementUrl)
    if (structuredResult.replacements > 0) {
      return {
        value: JSON.stringify(structuredResult.value),
        replacements: structuredResult.replacements,
      }
    }
  } catch {
    // Not JSON, continue with text replacements.
  }

  return replaceUrlTargetsInText(raw, targetNormalizedUrl, replacementUrl)
}

type ExtractedUrl = {
  url: string
  anchorText?: string | null
}

type NormalizedUrl = {
  normalizedUrl: string
  displayUrl: string
  isValid: boolean
}

type LinkStatusResult =
  | { kind: 'checking' }
  | { kind: 'invalid' }
  | { kind: 'timeout' }
  | { kind: 'unreachable' }
  | { kind: 'unknown' }
  | { kind: 'http'; statusCode: number }

type LinkSummaryItem = {
  normalizedUrl: string
  url: string
  displayUrl: string
  isValid: boolean
  occurrences: number
  anchorSamples: string[]
  components: Array<{
    cardKey: string
    title: string
    count: number
  }>
}

type OutputSaveTarget =
  | {
      mode: 'task'
      outputKey: string
      taskComponentId: string
    }
  | {
      mode: 'briefing'
      outputKey: string
      briefingComponentId: number
    }

function isRealGlobalComponent(
  component: Pick<TaskChannelComponent, 'origin' | 'kind' | 'task_component_id' | 'briefing_component_id' | 'project_component_id'>
): boolean {
  const origin = getComponentOrigin(component)
  if (origin === 'project' || origin === 'task') return false
  if (component.kind === 'project' || component.kind === 'task_ad_hoc') return false
  return origin === 'global' || component.kind === 'global'
}

function getLegacyBriefingOutputTarget(briefingComponentId: number): OutputSaveTarget {
  return {
    mode: 'briefing',
    briefingComponentId,
    outputKey: getOutputMapKeyFromBriefingId(briefingComponentId),
  }
}

function getOutputSaveTargetForComponent(
  component: Pick<TaskChannelComponent, 'origin' | 'kind' | 'task_component_id' | 'briefing_component_id' | 'project_component_id'>
): OutputSaveTarget | null {
  if (typeof component.task_component_id === 'string' && component.task_component_id.length > 0) {
    return {
      mode: 'task',
      taskComponentId: component.task_component_id,
      outputKey: getOutputMapKeyFromTaskComponentId(component.task_component_id),
    }
  }
  if (typeof component.briefing_component_id === 'number' && isRealGlobalComponent(component)) {
    return getLegacyBriefingOutputTarget(component.briefing_component_id)
  }
  return null
}

function resolveComponentTitleForSaveTarget(
  target: OutputSaveTarget,
  componentRows: TaskChannelComponent[],
): string {
  if (target.mode === "task") {
    const row = componentRows.find((component) => component.task_component_id === target.taskComponentId)
    return row ? getComponentOutputDisplayTitle(row) : "Component output"
  }
  if (target.briefingComponentId === MAIN_BRIEFING_COMPONENT_ID) return "Main content"
  const row = componentRows.find((component) => component.briefing_component_id === target.briefingComponentId)
  return row ? getComponentOutputDisplayTitle(row) : "Component output"
}

type CheckLinksFunctionResult = {
  input: string
  normalizedUrl: string | null
  valid: boolean
  status: number | null
  ok: boolean
  redirected: boolean
  finalUrl: string | null
  error: string | null
}

function normalizeUrl(rawUrl: string): NormalizedUrl {
  const cleaned = cleanDetectedUrl(rawUrl)
  if (!cleaned) return { normalizedUrl: '', displayUrl: '', isValid: false }

  try {
    const parsed = new URL(cleaned)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { normalizedUrl: cleaned.toLowerCase(), displayUrl: cleaned, isValid: false }
    }

    const protocol = parsed.protocol.toLowerCase()
    const hostname = parsed.hostname.toLowerCase()
    const port = parsed.port
    const isDefaultPort = (protocol === 'https:' && port === '443') || (protocol === 'http:' && port === '80')
    const portSegment = port && !isDefaultPort ? `:${port}` : ''

    let pathname = parsed.pathname || ''
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1)
    }
    if (pathname === '/') pathname = ''

    const normalizedUrl = `${protocol}//${hostname}${portSegment}${pathname}${parsed.search}${parsed.hash}`
    return {
      normalizedUrl,
      displayUrl: normalizedUrl || `${protocol}//${hostname}${portSegment}`,
      isValid: true,
    }
  } catch {
    return { normalizedUrl: cleaned.toLowerCase(), displayUrl: cleaned, isValid: false }
  }
}

function extractUrlsFromComponentOutput(
  output: TaskComponentOutput | null | undefined,
): ExtractedUrl[] {
  return extractUrlsFromComponentOutputSources({
    output,
    blocks: getOutputBlocks(output),
  })
}

function getComponentOutputTextForLinkOperations(
  output: TaskComponentOutput | null | undefined,
): string {
  if (!output) return ''
  if (output.content_text?.trim()) return output.content_text
  return getOutputBlocks(output)
    .filter((block): block is { type: 'paragraph'; text: string } => block.type === 'paragraph')
    .map((block) => block.text)
    .filter((text) => text.trim().length > 0)
    .join('\n')
}

function getLinkStatusSortBucket(status: LinkStatusResult): number {
  if (status.kind === 'invalid') return 1
  if (status.kind === 'http') {
    if (status.statusCode >= 400) return 1
    if (status.statusCode >= 300) return 3
    if (status.statusCode >= 200) return 4
    return 2
  }
  if (
    status.kind === 'timeout'
    || status.kind === 'unreachable'
    || status.kind === 'unknown'
    || status.kind === 'checking'
  ) return 2
  return 2
}

function getLinkStatusLabel(status: LinkStatusResult): string {
  if (status.kind === 'http') return String(status.statusCode)
  if (status.kind === 'invalid') return 'Invalid'
  if (status.kind === 'timeout') return 'Timeout'
  if (status.kind === 'unreachable') return 'Unreachable'
  if (status.kind === 'unknown') return 'Unknown'
  return 'Checking...'
}

function getLinkStatusColor(status: LinkStatusResult): string {
  if (status.kind === 'invalid') return 'text-red-600'
  if (
    status.kind === 'checking'
    || status.kind === 'unknown'
    || status.kind === 'timeout'
    || status.kind === 'unreachable'
  ) return 'text-gray-500'
  if (status.kind === 'http') {
    if (status.statusCode >= 500) return 'text-red-600'
    if (status.statusCode >= 400) return 'text-orange-600'
    if (status.statusCode >= 300) return 'text-amber-600'
    if (status.statusCode >= 200) return 'text-green-600'
  }
  return 'text-gray-500'
}

function mapCheckLinksResultToStatus(result: CheckLinksFunctionResult): LinkStatusResult {
  if (result.error === 'invalid_url' || result.valid === false) return { kind: 'invalid' }
  if (result.error === 'timeout') return { kind: 'timeout' }
  if (result.error === 'request_failed') return { kind: 'unreachable' }
  if (typeof result.status === 'number') return { kind: 'http', statusCode: result.status }
  return { kind: 'unknown' }
}

function extractCheckLinksResults(data: unknown): CheckLinksFunctionResult[] {
  if (Array.isArray(data)) return data as CheckLinksFunctionResult[]
  if (!data || typeof data !== 'object') return []

  const obj = data as Record<string, unknown>
  if (Array.isArray(obj.results)) return obj.results as CheckLinksFunctionResult[]
  if (Array.isArray(obj.items)) return obj.items as CheckLinksFunctionResult[]
  return []
}

// Resizable Rich Text Editor Component
function ResizableEditor({
  componentId,
  value,
  onChange,
  toolbarId,
  placeholder = 'Add output...',
  editorWrapperClassName,
  heightOverride,
  footerLeft,
  showResizeHandle = true,
  showFooter = true,
  autoGrow = true,
  onAiActionClick,
  onFocus,
  onBlur,
  highlightTerms,
  commentHighlights,
  showCommentHighlights,
  onCommentHighlightClick,
  onCommentAction,
  toolbarVariant = "compact",
  toolbarVisibility = "focus",
  showBubbleToolbar = false,
  onEditorFocus,
  onInsertAttachment,
  onInlineAttachmentClick,
  onInlineAttachmentAction,
  onInlineAttachmentResize,
  disableInlineMediaControls = false,
  skipValueNormalization = false,
  selectionIdentity,
  onAskAiSelection,
}: {
  componentId: number
  value: string
  onChange: (text: string) => void
  toolbarId: string
  placeholder?: string
  /** e.g. !border-0 when parent shows border on hover only */
  editorWrapperClassName?: string
  heightOverride?: number | string
  footerLeft?: React.ReactNode
  showResizeHandle?: boolean
  showFooter?: boolean
  autoGrow?: boolean
  onAiActionClick?: () => void
  onFocus?: () => void
  onBlur?: () => void
  highlightTerms?: Array<{ term: string; color: string }>
  commentHighlights?: Array<{
    id: number | string
    start: number
    end: number
    color?: string
    preview?: { authorName?: string | null; authorPhoto?: string | null; createdAt?: string | null; text?: string | null }
  }>
  showCommentHighlights?: boolean
  onCommentHighlightClick?: (id: number | string) => void
  onCommentAction?: (selection: { start: number; end: number; text: string; anchorLeft: number; anchorTop: number }) => void
  toolbarVariant?: "full" | "compact"
  toolbarVisibility?: "always" | "focus" | "hidden"
  showBubbleToolbar?: boolean
  onEditorFocus?: (editor: TiptapEditor) => void
  onInsertAttachment?: (
    file: File
  ) => Promise<{ attachmentId: string; url: string; mediaType: "image" | "video"; fileName: string } | null>
  onInlineAttachmentClick?: (
    attachmentId: string,
    context?: { clientX: number; clientY: number; anchorX: number | null; anchorY: number | null }
  ) => void
  onInlineAttachmentAction?: (
    attachmentId: string,
    action: "remove" | "shrink" | "grow"
  ) => void
  onInlineAttachmentResize?: (attachmentId: string, widthPct: number) => void
  disableInlineMediaControls?: boolean
  /** When true, pass editor HTML through without normalizeMixedRichText (avoids caret reset while typing). */
  skipValueNormalization?: boolean
  /** Identity for "Ask/Edit selected text with AI" — enables the floating selection menu over this output. */
  selectionIdentity?: {
    taskId: number
    channelId: number
    componentId: string
    taskComponentOutputId: string | null
    componentTitle: string
    taskTitle: string | null
    channelName: string | null
  } | null
  /** Attach the current editor selection to the AI chat composer (fixed toolbar button). */
  onAskAiSelection?: () => void
}) {
  const [height, setHeight] = useState(200)
  const resizeRef = useRef<HTMLDivElement>(null)
  const isResizing = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)
  const normalizedEditorValue = useMemo(() => {
    const raw = value ?? ""
    if (skipValueNormalization || raw.includes("data-attachment-id=")) return raw
    return normalizeMixedRichText(raw)
  }, [value, skipValueNormalization])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (typeof heightOverride !== 'undefined') return
    e.preventDefault()
    isResizing.current = true
    startY.current = e.clientY
    startHeight.current = height
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      const deltaY = e.clientY - startY.current
      const newHeight = Math.max(150, Math.min(800, startHeight.current + deltaY))
      setHeight(newHeight)
    }
    
    const handleMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const resolvedHeight: number | string = typeof heightOverride !== 'undefined' ? heightOverride : height
  return (
    <div
      data-output-content-body="true"
      data-ai-selectable={selectionIdentity ? "component-output" : undefined}
      data-selection-task-id={selectionIdentity ? String(selectionIdentity.taskId) : undefined}
      data-selection-channel-id={selectionIdentity ? String(selectionIdentity.channelId) : undefined}
      data-selection-component-id={selectionIdentity?.componentId ?? undefined}
      data-selection-output-id={selectionIdentity?.taskComponentOutputId ?? undefined}
      data-selection-component-title={selectionIdentity?.componentTitle ?? undefined}
      data-selection-task-title={selectionIdentity?.taskTitle ?? undefined}
      data-selection-channel-name={selectionIdentity?.channelName ?? undefined}
      className={`relative flex flex-col ${autoGrow ? 'min-h-0' : 'min-h-[150px]'}`}
      ref={resizeRef}
      style={autoGrow ? undefined : { height: typeof resolvedHeight === 'number' ? `${resolvedHeight}px` : resolvedHeight }}
    >
      <RichTextEditor
        value={normalizedEditorValue}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        readOnly={false}
        toolbarId={toolbarId}
        toolbarMode="floating"
        inputFormat="auto"
        fontSize={COMPONENT_OUTPUT_FONT_SIZE_PX}
        height={autoGrow ? 'auto' : '100%'}
        placeholder={placeholder}
        editorWrapperClassName={editorWrapperClassName}
        autoGrow={autoGrow}
        onAiActionClick={onAiActionClick}
        onAskAi={onAskAiSelection}
        highlightTerms={highlightTerms}
        commentHighlights={commentHighlights}
        showCommentHighlights={showCommentHighlights}
        onCommentHighlightClick={onCommentHighlightClick}
        onCommentAction={onCommentAction}
        toolbarVariant={toolbarVariant}
        toolbarVisibility={toolbarVisibility}
        reserveToolbarSpace
        showBubbleToolbar={showBubbleToolbar}
        onEditorFocus={onEditorFocus}
        onInsertAttachment={onInsertAttachment}
        onInlineAttachmentClick={onInlineAttachmentClick}
        onInlineAttachmentAction={onInlineAttachmentAction}
        onInlineAttachmentResize={onInlineAttachmentResize}
        disableInlineMediaControls={disableInlineMediaControls}
        flatSurface
      />
      {showFooter ? (
        <div className="flex min-h-7 items-center justify-between px-2 pb-1.5 pt-1">
          <div className="min-w-0 text-xs text-gray-400">
            {footerLeft ?? null}
          </div>
          {showResizeHandle ? (
            <button
              type="button"
              onMouseDown={handleMouseDown}
              className="output-resize-handle inline-flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100"
              style={{ cursor: 'nwse-resize' }}
              title="Drag to resize"
              aria-label="Resize output editor"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-gray-400" aria-hidden>
                <path d="M0 12 L12 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M4 12 L12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <span aria-hidden className="h-5 w-5" />
          )}
        </div>
      ) : null}
    </div>
  )
}

/** Shared content-column left padding for collapsed/expanded body. */
const CONTENT_COLUMN_PADDING_LEFT_MULTISELECT_OFF = 16
const CONTENT_COLUMN_PADDING_LEFT_MULTISELECT_ON = 16 + 40 + 2

/** Shared row layout. Table-like rows with horizontal separators only. */
function ComponentCardRow({
  leftSlot,
  titleSlot,
  headerMetaSlot,
  rightSlotBeforeChevron,
  isExpanded,
  onExpandClick,
  expandedContent,
  collapsedContent,
  showCollapsedContentWhenExpanded = false,
  expandedContentPaddingLeft,
  collapsedContentPaddingLeft,
  wrapperClassName = '',
  wrapperStyle,
  wrapperRef,
  wrapperProps,
  dragAttributes,
  dragListeners,
  dragHandleSlot,
  contentDisabled,
  showChevron = true,
}: {
  leftSlot: React.ReactNode | null
  titleSlot: React.ReactNode
  headerMetaSlot?: React.ReactNode
  rightSlotBeforeChevron: React.ReactNode
  isExpanded: boolean
  onExpandClick: () => void
  expandedContent: React.ReactNode
  collapsedContent?: React.ReactNode
  showCollapsedContentWhenExpanded?: boolean
  expandedContentPaddingLeft?: number
  collapsedContentPaddingLeft?: number
  wrapperClassName?: string
  wrapperStyle?: React.CSSProperties
  wrapperRef?: (node: HTMLDivElement | null) => void
  wrapperProps?: object
  dragAttributes?: object
  dragListeners?: object
  /** When set, only this slot initiates drag; wrapper does not get drag listeners. */
  dragHandleSlot?: React.ReactNode
  /** When true, non-handle content (and expanded body) gets pointer-events-none so only the drag handle is interactive. */
  contentDisabled?: boolean
  showChevron?: boolean
}) {
  const isCardElevated = isExpanded
  const chevronSlot = showChevron ? (
    <button
      type="button"
      onClick={onExpandClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-accent"
      aria-label={isExpanded ? 'Collapse' : 'Expand'}
      data-no-dnd
    >
      <ChevronDown
        className="h-4 w-4 text-muted-foreground transition-transform duration-150"
        style={{ transform: `rotate(${isExpanded ? 0 : -90}deg)` }}
      />
    </button>
  ) : null
  const actionSlot = (
    <div className={`shrink-0 flex items-center gap-0.5 ${contentDisabled ? 'pointer-events-none opacity-70' : ''}`}>
      {rightSlotBeforeChevron}
    </div>
  )
  return (
    <div
      ref={wrapperRef}
      style={wrapperStyle}
      className={`group card-row relative rounded-md border border-border/80 bg-background ${!isExpanded ? 'card-row-collapsed' : ''} ${isCardElevated ? 'border-border ring-1 ring-border/30' : ''} ${wrapperClassName}`.trim()}
      {...(wrapperProps ?? {})}
      {...(!dragHandleSlot ? (dragAttributes ?? {}) : {})}
      {...(!dragHandleSlot ? (dragListeners ?? {}) : {})}
    >
      {dragHandleSlot ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-5 items-center justify-center">
          <div className="pointer-events-auto">{dragHandleSlot}</div>
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-0.5 px-3 py-2 sm:px-4 sm:py-2.5" style={DEBUG_ALIGN ? { outline: '3px solid red' } : undefined}>
        <div className="flex-1 min-w-0 flex items-center gap-0.5" data-no-dnd>
          <div className={leftSlot != null ? `${MULTI_SELECT_GUTTER_CLASS} shrink-0 flex h-full items-center justify-center` : 'w-0 shrink-0 overflow-hidden'}>
            {leftSlot}
          </div>
          <div
            className={`flex-1 min-w-0 overflow-hidden ${contentDisabled ? 'pointer-events-none opacity-70' : ''}`}
            style={DEBUG_ALIGN ? { outline: '3px solid blue', position: 'relative' as const } : undefined}
          >
            {DEBUG_ALIGN && (
              <span className="absolute left-0 top-0 w-px bg-black pointer-events-none z-10" style={{ top: -8, height: 280 }} aria-hidden />
            )}
            <div className="flex min-w-0 w-full flex-nowrap items-center gap-x-2 overflow-hidden">
              {chevronSlot}
              <div className="min-w-0 flex-1 overflow-hidden">{titleSlot}</div>
              {headerMetaSlot ? (
                <div className="min-w-0 shrink-0 self-center">
                  {headerMetaSlot}
                </div>
              ) : null}
            </div>
            {DEBUG_ALIGN && <span className="text-[10px] text-gray-400 ml-1 shrink-0">TITLE-ANCHOR</span>}
          </div>
          {actionSlot}
        </div>
      </div>
      {collapsedContent && (!isExpanded || showCollapsedContentWhenExpanded) ? (
        <div
          className={`w-full border-t border-border/70 pt-1.5 pb-3 ${contentDisabled ? 'pointer-events-none opacity-70' : ''}`}
          data-no-dnd
          style={{
            paddingLeft: collapsedContentPaddingLeft ?? expandedContentPaddingLeft ?? CONTENT_LEFT_INSET_PX,
            paddingRight: 16,
          }}
        >
          {collapsedContent}
        </div>
      ) : null}
      {isExpanded && expandedContent ? (
        <div
          className={`mt-0 w-full space-y-2.5 border-t border-border/70 pb-3 pt-2 ${contentDisabled ? 'pointer-events-none opacity-70' : ''}`}
          data-no-dnd
          style={{
            ...(DEBUG_ALIGN ? { outline: '3px solid green' } : {}),
            paddingLeft: expandedContentPaddingLeft ?? CONTENT_LEFT_INSET_PX,
            paddingRight: 16,
          }}
        >
          {DEBUG_ALIGN && (
            <div className="text-[10px] text-gray-500 mb-1">BODY-WRAPPER</div>
          )}
          {expandedContent}
        </div>
      ) : null}
    </div>
  )
}

// Shared card-field interaction model used by selected + available cards (display/hover/edit).
const COMPONENT_TEXTAREA_CLASS = 'min-h-[2.5rem] resize-none border-transparent hover:resize-y hover:border-gray-200 focus:resize-y focus:border-gray-200'
const COMPONENT_FIELD_BASE_CLASS = 'card-field-hover-border rounded-md border border-transparent bg-background transition-colors'
const COMPONENT_FIELD_DISPLAY_WRAPPER_CLASS = `${COMPONENT_FIELD_BASE_CLASS} hover:border-gray-200`
// Canonical active/edit ring (black, thick) used by every editable card field.
const COMPONENT_FIELD_ACTIVE_RING_CLASS = 'component-card-focus-ring relative focus-within:z-[2] focus-within:border-transparent focus-within:outline-none focus-within:ring-2 focus-within:ring-inset focus-within:ring-black focus-within:ring-offset-0'
const COMPONENT_OUTPUT_FOCUS_WRAPPER_CLASS = `${COMPONENT_FIELD_BASE_CLASS} component-card-focus-ring relative rounded-md focus-within:z-[2] focus-within:border-transparent focus-within:outline-none focus-within:ring-2 focus-within:ring-black focus-within:ring-offset-0`
const COMPONENT_OUTPUT_FIELD_ACTIVE_CLASS = "component-output-field-active"
const COMPONENT_FIELD_EDIT_WRAPPER_CLASS = `${COMPONENT_FIELD_BASE_CLASS} ${COMPONENT_FIELD_ACTIVE_RING_CLASS} border-gray-200`
const COMPONENT_FIELD_TEXTAREA_CLASS = `${COMPONENT_TEXTAREA_CLASS} w-full border-0 bg-transparent rounded-md px-3 py-2 text-sm leading-5 focus-visible:outline-none focus-visible:ring-0`
const COMPONENT_OUTPUT_EDITOR_CLASS = 'w-full border-0 bg-transparent resize-none border-transparent'
const COMPONENT_COLLAPSED_FIELD_WRAPPER_CLASS = 'w-full'
const COMPONENT_TITLE_EDIT_INPUT_CLASS = 'h-full min-h-0 w-full min-w-0 max-w-full border-0 bg-transparent px-0 py-0 text-sm font-normal leading-5 shadow-none focus-visible:ring-0 focus-visible:outline-none'
const COMPONENT_OUTPUT_FONT_SIZE_PX = 16

function getTitleShellWidthStyle(): React.CSSProperties {
  return { width: 'fit-content', maxWidth: '100%' }
}

function ComponentSourceTags({
  tags,
  keyPrefix,
}: {
  tags: string[]
  keyPrefix: string
}) {
  if (tags.length === 0) return null
  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <span
          key={`${keyPrefix}-${tag}`}
          className={`inline-block max-w-[11rem] truncate align-middle text-[10px] px-2 py-0.5 rounded-full border ${availableTagBadgeClass(tag)}`}
          title={tag}
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

/** Textarea that grows/shrinks with content (min height preserved). */
function AutoResizeTextarea({
  value,
  onChange,
  className,
  ...rest
}: React.ComponentProps<typeof Textarea>) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const adjustHeight = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 40)}px`
  }, [])
  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])
  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={onChange}
      className={className}
      onInput={adjustHeight}
      {...rest}
    />
  )
}

// Add Component Row - reuses ComponentCardRow; creates task ad-hoc only; output editable before save and persisted after
function AddComponentRow({
  taskId,
  channelId,
  onComponentAdded,
  isMultiSelectMode = false,
  defaultExpanded = false,
  scrollRef,
  userInitiatedRef,
  onUserInitiated,
  onActiveFieldChange,
}: {
  projectId?: number
  taskId: number
  channelId: number
  briefingTypeId: number | null
  contentTypeId?: number
  /** Called after add succeeds; optional task row id so parent can show generating state until realtime delivers output. */
  onComponentAdded: (newTaskComponentId?: string, generationPrompt?: string | null) => void
  isMultiSelectMode?: boolean
  defaultExpanded?: boolean
  scrollRef?: React.RefObject<HTMLDivElement | null>
  /** Scroll/focus only when this ref is true (set by onUserInitiated when user expands or focuses create card). */
  userInitiatedRef?: React.MutableRefObject<boolean>
  /** Call when user explicitly expands the card or focuses the title input (so we allow scroll after). */
  onUserInitiated?: () => void
  onActiveFieldChange?: (context: AiActiveFieldContext) => void
}) {
  const supabase = createClientComponentClient()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [output, setOutput] = useState('')
  const [isEditingDescriptionInline, setIsEditingDescriptionInline] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Scroll into view only after explicit user action (expand or focus); never on initial load or query refresh
  useEffect(() => {
    if (!isExpanded) return
    if (userInitiatedRef && !userInitiatedRef.current) return
    const el = scrollRef?.current ?? rowRef.current
    if (el) {
      const id = requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
      return () => cancelAnimationFrame(id)
    }
  }, [isExpanded, scrollRef, userInitiatedRef])

  const handleSave = async () => {
    if (!title.trim()) return
    setIsSubmitting(true)
    try {
      const generationPrompt = description.trim() || null
      const { data: newTaskComponentData, error: addErr } = await supabase.rpc('tcc_add_ad_hoc_component', {
        p_task_id: taskId,
        p_channel_id: channelId,
        p_title: title.trim(),
        p_description: generationPrompt,
        p_position: null,
        p_generation_source: 'interactive_stream',
      })
      if (addErr) throw addErr
      let taskComponentId = tryExtractTaskComponentId(newTaskComponentData)
      const briefingComponentId = typeof newTaskComponentData === 'number' ? newTaskComponentData : null
      if (!taskComponentId && briefingComponentId != null) {
        const { data: createdTaskRow } = await supabase
          .from('task_channel_components')
          .select('id')
          .eq('task_id', taskId)
          .eq('channel_id', channelId)
          .eq('briefing_component_id', briefingComponentId)
          .order('position', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        taskComponentId = createdTaskRow?.id ?? null
      }
      if (taskComponentId && !isMeaningfullyEmptyHtml(output ?? '')) {
        const { error: outputErr } = await supabase
          .from('task_component_outputs')
          .upsert({
            task_id: taskId,
            channel_id: channelId,
            task_component_id: taskComponentId,
            content_text: output,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'task_component_id' })
        if (outputErr) console.warn('Failed to save component output:', outputErr)
      } else if (briefingComponentId != null && !isMeaningfullyEmptyHtml(output ?? '')) {
        // Legacy fallback: only if RPC did not return/resolve a task_component_id.
        const { error: outputErr } = await supabase
          .from('task_component_outputs')
          .upsert({
            task_id: taskId,
            channel_id: channelId,
            briefing_component_id: briefingComponentId,
            content_text: output,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'task_id,channel_id,briefing_component_id' })
        if (outputErr) console.warn('Failed to save component output (legacy fallback):', outputErr)
      }
      setTitle('')
      setDescription('')
      setOutput('')
      setIsEditingDescriptionInline(false)
      setIsExpanded(false)
      onComponentAdded(taskComponentId ?? undefined, generationPrompt)
      toast({ title: 'Component added', description: 'Ad-hoc component added to this task.' })
    } catch (err: any) {
      console.error('Failed to add component:', err)
      toast({
        title: 'Failed to add component',
        description: err?.message ?? 'An error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // When multi-select ON: reserve same gutter as selected/unselected cards. When OFF: no gutter.
  const leftSlot = isMultiSelectMode ? <span aria-hidden /> : null
  const rightSlotBeforeChevron = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={(e) => { e.stopPropagation(); void handleSave() }}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={isSubmitting || !title.trim()}
      className="h-7 text-xs"
      title="Add to task"
      aria-label="Add to task"
      data-no-dnd
    >
      {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
    </Button>
  )
  const titleSlot = (
    <div className={`${COMPONENT_FIELD_EDIT_WRAPPER_CLASS} h-8 min-w-0 w-full px-1.5`} onPointerDown={(e) => e.stopPropagation()}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add component"
        className={COMPONENT_TITLE_EDIT_INPUT_CLASS}
        onFocus={() => {
          onUserInitiated?.()
          onActiveFieldChange?.({
            fieldType: "component_title",
            label: "Component Title",
            instructions: description || null,
          })
          setIsExpanded(true)
        }}
      />
    </div>
  )
  const collapsedDescriptionContent = (
    <div
      className={COMPONENT_COLLAPSED_FIELD_WRAPPER_CLASS}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isEditingDescriptionInline ? (
        <div className={COMPONENT_FIELD_EDIT_WRAPPER_CLASS}>
          <AutoResizeTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add instructions..."
            className={COMPONENT_FIELD_TEXTAREA_CLASS}
            onFocus={() =>
              onActiveFieldChange?.({
                fieldType: "component_instructions",
                label: "Component Instructions",
                instructions: description || null,
              })
            }
            onBlur={() => setIsEditingDescriptionInline(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsEditingDescriptionInline(false)
            }}
            autoFocus
          />
        </div>
      ) : (
        <p
          className={`${COMPONENT_FIELD_DISPLAY_WRAPPER_CLASS} line-clamp-2 break-words px-1.5 py-1 text-sm leading-5 text-gray-500 cursor-text hover:text-gray-700 w-full overflow-hidden`}
          onClick={() => {
            onActiveFieldChange?.({
              fieldType: "component_instructions",
              label: "Component Instructions",
              instructions: description || null,
            })
            setIsEditingDescriptionInline(true)
          }}
          title="Click to edit description"
        >
          {(description || '').trim() || 'Add instructions...'}
        </p>
      )}
    </div>
  )
  const expandedContent = (
    <>
      <div className="space-y-2 w-full">
        <Textarea
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          placeholder="Add output..."
          className={`card-field-hover-border ${COMPONENT_TEXTAREA_CLASS} min-h-[4rem] w-full border-0 ${!isExpanded ? 'group-hover/card:border group-hover/card:border-gray-200' : ''} focus-visible:!ring-gray-800`}
          onPointerDown={(e) => e.stopPropagation()}
          onFocus={() =>
            onActiveFieldChange?.({
              fieldType: "component_output",
              label: "Component Output",
              instructions: description || null,
            })
          }
        />
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { setIsExpanded(false); setTitle(''); setDescription(''); setOutput(''); setIsEditingDescriptionInline(false) }}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </>
  )

  const setWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node
      if (scrollRef) (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [scrollRef]
  )

  const contentColumnPaddingLeft = isMultiSelectMode ? CONTENT_COLUMN_PADDING_LEFT_MULTISELECT_ON : CONTENT_COLUMN_PADDING_LEFT_MULTISELECT_OFF

  return (
    <ComponentCardRow
      leftSlot={leftSlot}
      titleSlot={titleSlot}
      headerMetaSlot={null}
      rightSlotBeforeChevron={rightSlotBeforeChevron}
      isExpanded={isExpanded}
      onExpandClick={() => {
        onUserInitiated?.()
        setIsExpanded((prev) => !prev)
      }}
      expandedContent={expandedContent}
      collapsedContent={collapsedDescriptionContent}
      showCollapsedContentWhenExpanded={isExpanded}
      collapsedContentPaddingLeft={contentColumnPaddingLeft}
      expandedContentPaddingLeft={contentColumnPaddingLeft}
      wrapperClassName={`group/card transition-colors ${!isExpanded ? COMPONENT_CARD_HEIGHT_CLASS : ''}`.trim()}
      wrapperRef={setWrapperRef}
    />
  )
}

// Sortable Component Item
function SortableComponentItem({
  component,
  isSelected,
  sourceTags = [],
  cardDomId,
  onToggle,
  onEditCustom,
  onReorder,
  isEditing,
  onStartEdit,
  onCancelEdit,
  isEditingDescription,
  onStartEditDescription,
  onCancelEditDescription,
  output,
  onOutputChange,
  onSaveOutput,
  onPatchOutput,
  onRequestOutputRefresh,
  onCancelPendingOutputAutosave,
  onSetIsInsertingMedia,
  isLoadingOutput,
  isGeneratingOutput = false,
  onLoadOutput,
  projectId,
  contentTypeId,
  channelId,
  briefingTypeId,
  effectiveBriefingTypeId,
  onEditInTemplate,
  onRemoveFromTemplate,
  onSaveToProjectAllChannels,
  onSaveToProjectChannel,
  onDeleteSelectedComponent,
  onBuildWithAI,
  onAskAiFromSelection,
  onOpenVersionHistory,
  onActiveFieldChange,
  onActivateComponentForExport,
  onCopyContent,
  canCopyContent = false,
  onQuickFiveStar,
  onRequestFocusOutputPane,
  onExitFocusOutputPane,
  isOutputFocusedPane = false,
  isAnyFocusedOutputMode = false,
  onFocusPrevOutput,
  onFocusNextOutput,
  focusedOutputPositionLabel,
  autoExpandComponentId,
  autoExpandTaskComponentId,
  autoExpandTaskComponentIds,
  autoExpandOnlyAfterMountRef,
  onAutoExpandConsumed,
  expandedTaskComponentIds,
  onExpandedTaskComponentChange,
  onDuplicateComponent,
  componentKey,
  onApplyToProjectTemplate,
  onAddToAllChannelsInTask,
  onResetToTemplate,
  onRequestRemoveFromTemplate,
  onRequestDelete,
  isOutputSaving = false,
  taskId,
  taskTitle,
  channelName,
  allUsersForOutputComments = [],
  defaultOutputCommentParticipants = [],
  currentPublicUserId = null,
  currentUserName = "",
  outputCommentThreads = [],
  commentNavigationTarget = null,
  isLoadingOutputCommentThreads = false,
  onEnsureOutputCommentThreads,
  onRefetchOutputCommentThreads,
  availableByKeyForTemplate,
  getComponentKeyForSelectedRow,
  isToggling,
  bulkSelectKey,
  isBulkSelected,
  onBulkSelectToggle,
  isMultiSelectMode = false,
  cardKey,
  isMenuOpen,
  onMenuOpenChange,
  isDirtyTemplate,
  isMutating = false,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
}: {
  component: TaskChannelComponent
  isSelected: boolean
  sourceTags?: string[]
  cardDomId?: string
  onToggle: () => void
  /** When true, show loading indicator on this row only (e.g. while toggle is in flight). */
  isToggling?: boolean
  /** When set, show checkbox for multi-select. */
  bulkSelectKey?: string
  isBulkSelected?: boolean
  onBulkSelectToggle?: () => void
  isMultiSelectMode?: boolean
  /** Same as key for the sortable item; used so parent can track which card's menu is open. */
  cardKey?: string
  isMenuOpen?: boolean
  onMenuOpenChange?: (id: string | null) => void
  /** True when task title/description differ from project template and user has not overwritten. */
  isDirtyTemplate?: boolean
  /** True while save (title/description) RPC is in flight for this component; only this card's controls are disabled. */
  isMutating?: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
  onEditCustom: (taskComponentId: string | null, briefingComponentId: number | null, projectComponentId: number | null, title: string, description: string, scope?: ComponentScope, position?: number | null, applyToProjectTemplate?: boolean) => void | Promise<boolean>
  onReorder: (componentId: number, newPosition: number) => void
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  isEditingDescription: boolean
  onStartEditDescription: () => void
  onCancelEditDescription: () => void
  output: TaskComponentOutput | null
  onOutputChange: (text: string) => void
  onSaveOutput: () => void
  onPatchOutput?: (patch: Partial<TaskComponentOutput>) => void
  onRequestOutputRefresh?: () => void
  onCancelPendingOutputAutosave?: () => void
  onSetIsInsertingMedia?: (value: boolean) => void
  isLoadingOutput: boolean
  /** When true, show "Generating content..." in the skeleton (AI writing output). */
  isGeneratingOutput?: boolean
  onLoadOutput?: () => void
  projectId?: number
  contentTypeId?: number
  channelId?: number
  briefingTypeId?: number | null
  /** Effective briefing type (selected ?? default) for template visibility. */
  effectiveBriefingTypeId?: number | null
  onEditInTemplate?: (componentBriefingId: number, title: string, description: string, scope: ComponentScope, projectComponentId?: number | null) => void
  onRemoveFromTemplate?: (componentBriefingId: number, scope: ComponentScope, projectComponentId?: number | null, keepInTask?: boolean) => void
  onSaveToProjectAllChannels?: (component: TaskChannelComponent) => void
  onSaveToProjectChannel?: (component: TaskChannelComponent) => void
  onDeleteSelectedComponent?: (component: TaskChannelComponent) => void
  onBuildWithAI?: (componentId: number | string) => void
  /** Attach the current output editor selection to the AI chat composer. */
  onAskAiFromSelection?: () => void
  onOpenVersionHistory?: () => void
  onActiveFieldChange?: (context: AiActiveFieldContext) => void
  onActivateComponentForExport?: () => void
  onCopyContent?: () => void
  canCopyContent?: boolean
  onQuickFiveStar?: () => void
  onRequestFocusOutputPane?: (cardKey: string, componentId: number | null) => void
  onExitFocusOutputPane?: () => void
  isOutputFocusedPane?: boolean
  isAnyFocusedOutputMode?: boolean
  onFocusPrevOutput?: () => void
  onFocusNextOutput?: () => void
  focusedOutputPositionLabel?: string
  autoExpandComponentId?: number | null
  autoExpandTaskComponentId?: string | null
  autoExpandTaskComponentIds?: Set<string>
  /** When set, auto-expand only runs when this ref is true (prevents expand on initial load). */
  autoExpandOnlyAfterMountRef?: React.MutableRefObject<boolean>
  /** Called once after a newly added component auto-expands, so the parent can clear the pending auto-expand flag and let the user collapse it freely. */
  onAutoExpandConsumed?: (taskComponentId: string) => void
  /** Parent-owned expanded set keyed by stable task_component_id (survives AI refetch). */
  expandedTaskComponentIds?: Set<string>
  onExpandedTaskComponentChange?: (taskComponentId: string, expanded: boolean) => void
  /** Duplicate this component (same task+channel, copied title/instructions, empty output, no AI). */
  onDuplicateComponent?: (component: TaskChannelComponent) => void
  componentKey?: string
  onApplyToProjectTemplate?: (component: TaskChannelComponent) => void
  onAddToAllChannelsInTask?: (component: TaskChannelComponent) => void
  onResetToTemplate?: (component: TaskChannelComponent) => void
  onRequestRemoveFromTemplate?: (component: TaskChannelComponent) => void
  onRequestDelete?: (component: TaskChannelComponent) => void
  isOutputSaving?: boolean
  taskId: number
  taskTitle?: string | null
  channelName?: string | null
  allUsersForOutputComments?: OutputCommentUserOption[]
  defaultOutputCommentParticipants?: OutputCommentUserOption[]
  currentPublicUserId?: number | null
  currentUserName?: string
  outputCommentThreads?: OutputCommentThread[]
  commentNavigationTarget?: CommentNavigationTarget | null
  isLoadingOutputCommentThreads?: boolean
  onEnsureOutputCommentThreads?: (outputId: string) => void
  onRefetchOutputCommentThreads?: () => void
  /** Lookup from tc_available_components_for_task_channel by component_key (for in_current_template when selected pile has no BE field). */
  availableByKeyForTemplate?: Map<string, { in_current_template?: boolean }>
  /** Derive component_key from selected-row (tc_components has no component_key). */
  getComponentKeyForSelectedRow?: (row: TaskChannelComponent) => string
}) {
  const queryClient = useQueryClient()
  const taskComponentIdForExpand = component.task_component_id?.trim() || null
  const isExpandedControlled =
    Boolean(taskComponentIdForExpand)
    && expandedTaskComponentIds != null
    && onExpandedTaskComponentChange != null
  const [localExpanded, setLocalExpanded] = useState(false) // Collapsed by default
  const isExpanded = isExpandedControlled
    ? expandedTaskComponentIds!.has(taskComponentIdForExpand!)
    : localExpanded
  const setIsExpanded = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? next(isExpanded) : next
      if (isExpandedControlled && taskComponentIdForExpand) {
        onExpandedTaskComponentChange!(taskComponentIdForExpand, resolved)
        return
      }
      setLocalExpanded(resolved)
    },
    [isExpanded, isExpandedControlled, onExpandedTaskComponentChange, taskComponentIdForExpand],
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  // Stable unique sortable id: task_component_id (UUID) first, then component_key, then fallback (no index-derived ids)
  const sortableId = component.task_component_id || component.component_key || `temp-${component.briefing_component_id ?? component.project_component_id ?? 'u'}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: sortableId,
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  
  const [isOutputEditorFocused, setIsOutputEditorFocused] = useState(false)
  const [customTitle, setCustomTitle] = useState(component.custom_title || component.title)
  const [customDescription, setCustomDescription] = useState(component.custom_description || component.description || '')
  const [applyToProjectTemplate, setApplyToProjectTemplate] = useState(false)
  const [selectionDraft, setSelectionDraft] = useState<OutputSelectionDraft | null>(null)
  const [isOutputCommentComposerOpen, setIsOutputCommentComposerOpen] = useState(false)
  const [activeOutputCommentThreadId, setActiveOutputCommentThreadId] = useState<number | null>(null)
  const [outputCommentText, setOutputCommentText] = useState("")
  const [pendingParticipants, setPendingParticipants] = useState<any[]>([])
  const [removedParticipants, setRemovedParticipants] = useState<any[]>([])
  const [selectedEditableAttachmentId, setSelectedEditableAttachmentId] = useState<string | null>(null)
  const [debugLastRemoveClick, setDebugLastRemoveClick] = useState<{
    attachmentId: string
    at: string
  } | null>(null)
  const [showCommentHighlights, setShowCommentHighlights] = useState(true)
  const [outputCommentsFilter, setOutputCommentsFilter] = useState<"open" | "resolved" | "all">("open")
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({})
  const [, setIsUploadingMedia] = useState(false)
  const [isOutputMediaDragActive, setIsOutputMediaDragActive] = useState(false)
  const [outputMediaDropIndex, setOutputMediaDropIndex] = useState<number | null>(null)
  const [pendingOutputMediaInsert, setPendingOutputMediaInsert] = useState<{ insertIndex: number; count: number } | null>(null)
  const [isCommentTargetPulseVisible, setIsCommentTargetPulseVisible] = useState(false)
  const [debugImageClickMarker, setDebugImageClickMarker] = useState<{
    attachmentId: string
    anchorX: number
    anchorY: number
  } | null>(null)
  const outputMediaDragDepthRef = useRef(0)
  const supabase = useMemo(() => createClientComponentClient(), [])
  const selectComponentForAiPane = useCallback((
    selectionSource: "explicit_click" | "component_action" = "explicit_click",
  ) => {
    const taskComponentId = component.task_component_id?.trim() || null
    if (!taskComponentId) return
    onActivateComponentForExport?.()
    onActiveFieldChange?.(
      buildComponentOutputActiveFieldContext({
        taskId,
        channelId,
        taskComponentId,
        taskComponentOutputId: output?.task_component_output_id ?? null,
        componentTitle: getComponentOutputDisplayTitle(component),
        entityId: component.briefing_component_id ?? component.project_component_id ?? null,
        instructions: (customDescription || component.description || "") || null,
        selectionSource,
        taskTitle: taskTitle?.trim() || `Task ${taskId}`,
        channelName:
          channelName?.trim()
          || (channelId != null ? `Channel ${channelId}` : null),
      }),
    )
  }, [
    channelId,
    channelName,
    component,
    customDescription,
    onActivateComponentForExport,
    onActiveFieldChange,
    output?.task_component_output_id,
    taskId,
    taskTitle,
  ])
  const notifyComponentOutputActiveField = useCallback((
    selectionSource: "explicit_click" | "component_action" = "explicit_click",
  ) => {
    selectComponentForAiPane(selectionSource)
  }, [selectComponentForAiPane])
  const handleOutputEditorFocus = useCallback(() => {
    setIsOutputEditorFocused(true)
    notifyComponentOutputActiveField()
  }, [notifyComponentOutputActiveField])
  const handleOutputEditorBlur = useCallback(() => {
    setIsOutputEditorFocused(false)
  }, [])
  const outputSelectionIdentity = useMemo(() => {
    const componentUuid = component.task_component_id?.trim() || null
    if (taskId == null || channelId == null || !componentUuid) return null
    return {
      taskId,
      channelId,
      componentId: componentUuid,
      taskComponentOutputId: output?.task_component_output_id ?? null,
      componentTitle: getComponentOutputDisplayTitle(component),
      taskTitle: taskTitle?.trim() || null,
      channelName: channelName?.trim() || (channelId != null ? `Channel ${channelId}` : null),
    }
  }, [component, channelId, output?.task_component_output_id, taskId, taskTitle, channelName])
  const hasInstructions = (customDescription || "").trim().length > 0
  const hasOutputContent = useMemo(() => {
    if (!output) return false
    if (!isMeaningfullyEmptyHtml(output.content_text)) return true
    return getOutputBlocks(output).length > 0
  }, [output])
  const [isInstructionsExpanded, setIsInstructionsExpanded] = useState(() => !hasOutputContent)
  useEffect(() => {
    setIsInstructionsExpanded(!hasOutputContent)
  }, [component.task_component_id, hasOutputContent])
  const applyToProjectTemplateRef = useRef(false)
  useEffect(() => {
    if (!isOutputCommentComposerOpen) return
    if ((pendingParticipants ?? []).length > 0) return
    if ((defaultOutputCommentParticipants ?? []).length === 0) return
    setPendingParticipants(defaultOutputCommentParticipants)
  }, [isOutputCommentComposerOpen, pendingParticipants, defaultOutputCommentParticipants])
  useEffect(() => {
    applyToProjectTemplateRef.current = applyToProjectTemplate
  }, [applyToProjectTemplate])
  const outputAttachments = useMemo(
    () =>
      collectOutputAttachments({
        attachments: output?.attachments ?? [],
        attachment_map: output?.attachment_map ?? null,
        content: output?.content ?? null,
        resolved_content_json: output?.resolved_content_json ?? null,
        content_json: output?.content_json ?? null,
      }),
    [output?.attachments, output?.attachment_map, output?.content, output?.resolved_content_json, output?.content_json]
  )
  const outputAttachmentIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const nextIds = new Set(outputAttachments.map((attachment) => attachment.id))
    const prevIds = outputAttachmentIdsRef.current

    for (const attachment of outputAttachments) {
      if (!prevIds.has(attachment.id)) {
        console.log("[media render] mount", {
          component: "InlineOutputAttachmentBlock",
          outputId: output?.task_component_output_id ?? null,
          attachmentId: attachment.id,
          filePath: attachment.file_path,
        })
      }
    }
    for (const previousId of Array.from(prevIds)) {
      if (!nextIds.has(previousId)) {
        console.log("[media render] unmount", {
          component: "InlineOutputAttachmentBlock",
          outputId: output?.task_component_output_id ?? null,
          attachmentId: previousId,
        })
      }
    }
    outputAttachmentIdsRef.current = nextIds
  }, [outputAttachments, output?.task_component_output_id])

  useEffect(() => {
    let cancelled = false
    const loadSignedUrls = async () => {
      if (outputAttachments.length === 0) {
        setAttachmentUrls({})
        return
      }
      const urlPairs = await Promise.all(
        outputAttachments.map(async (attachment) => {
          try {
            const displayUrl = await getAttachmentDisplayUrl({
              supabase,
              attachment,
              outputId: output?.task_component_output_id ?? null,
              reason: "selected-output-load",
            })
            return [attachment.id, displayUrl] as const
          } catch (error) {
            console.error("[media url] failed to resolve display URL", {
              attachmentId: attachment.id,
              file_path: attachment.file_path,
              error,
            })
            return [attachment.id, ""] as const
          }
        })
      )
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const [attachmentId, url] of urlPairs) {
        if (url) next[attachmentId] = url
      }
      setAttachmentUrls(next)
    }
    void loadSignedUrls()
    return () => {
      cancelled = true
    }
  }, [outputAttachments, output?.task_component_output_id, supabase])
  // --- Non-blocking, versioned autosave for title + instructions --------------------------------
  // Typing always updates the local draft immediately and is never blocked/greyed while a save is
  // in flight. Each save gets a monotonically increasing sequence number, so a slower/older
  // response can never overwrite newer text. `lastSaved*Ref` tracks the last value we persisted (or
  // adopted from the server) so background refreshes only sync genuinely external changes and never
  // clobber unsaved local edits.
  const lastSavedTitleRef = useRef(component.custom_title || component.title)
  const lastSavedDescriptionRef = useRef(component.custom_description || component.description || '')
  const customFieldSaveSeqRef = useRef(0)
  const [instructionsSaveState, setInstructionsSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const runCustomFieldSave = useCallback(
    async (title: string, desc: string, scope?: ComponentScope) => {
      const seq = ++customFieldSaveSeqRef.current
      setInstructionsSaveState('saving')
      let ok = false
      try {
        const result = await onEditCustom(
          component.task_component_id,
          component.briefing_component_id,
          component.project_component_id,
          title,
          desc,
          scope,
          component.position ?? null,
          applyToProjectTemplateRef.current
        )
        ok = result !== false
      } catch {
        ok = false
      }
      // A newer keystroke started a newer save; ignore this (superseded) result entirely.
      if (seq !== customFieldSaveSeqRef.current) return
      if (ok) {
        lastSavedTitleRef.current = title
        lastSavedDescriptionRef.current = desc
        setInstructionsSaveState('saved')
      } else {
        setInstructionsSaveState('error')
      }
    },
    [onEditCustom, component.task_component_id, component.briefing_component_id, component.project_component_id, component.position]
  )

  const debouncedSave = useMemo(
    () => debounce((title: string, desc: string, scope?: ComponentScope) => {
      void runCustomFieldSave(title, desc, scope)
    }, 700),
    [runCustomFieldSave]
  )

  // Auto-clear the transient "Saved" acknowledgement so it doesn't linger under the card.
  useEffect(() => {
    if (instructionsSaveState !== 'saved') return
    const timer = setTimeout(() => setInstructionsSaveState('idle'), 1500)
    return () => clearTimeout(timer)
  }, [instructionsSaveState])

  // Sync server values into the local draft WITHOUT clobbering newer local edits: only adopt an
  // incoming value when the field isn't being actively edited and the draft still matches the last
  // value we persisted/adopted (i.e. no pending unsaved edits).
  useEffect(() => {
    const incomingTitle = component.custom_title || component.title
    if (!isEditing && customTitle === lastSavedTitleRef.current) {
      if (incomingTitle !== customTitle) setCustomTitle(incomingTitle)
      lastSavedTitleRef.current = incomingTitle
    }
    const incomingDescription = component.custom_description || component.description || ''
    if (!isEditingDescription && customDescription === lastSavedDescriptionRef.current) {
      if (incomingDescription !== customDescription) setCustomDescription(incomingDescription)
      lastSavedDescriptionRef.current = incomingDescription
    }
  }, [component.task_component_id, component.briefing_component_id, component.project_component_id, component.custom_title, component.title, component.custom_description, component.description, isEditing, isEditingDescription, customTitle, customDescription])
  
  // Auto-expand only when explicitly set after mount (e.g. after user creates a component); never on initial load.
  // Supports both template ids and task_component_id so ad-hoc components can open immediately while streaming.
  // Each identity is auto-expanded at most once: after the first expansion we mark it consumed and ask the
  // parent to clear its pending flag so the user can collapse/expand the card immediately (no reload needed).
  const autoExpandConsumedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (autoExpandOnlyAfterMountRef && !autoExpandOnlyAfterMountRef.current) return
    const componentId = component.briefing_component_id || component.project_component_id
    const taskComponentId = component.task_component_id
    const consumedKey = taskComponentId || (componentId != null ? `tmpl:${componentId}` : null)
    if (consumedKey && autoExpandConsumedRef.current.has(consumedKey)) return
    const shouldExpandByTemplateId = !!(autoExpandComponentId && componentId === autoExpandComponentId)
    const shouldExpandByTaskComponentId = !!(autoExpandTaskComponentId && taskComponentId === autoExpandTaskComponentId)
    const shouldExpandByTaskComponentIdsSet = !!(
      taskComponentId
      && autoExpandTaskComponentIds
      && autoExpandTaskComponentIds.has(taskComponentId)
    )
    if ((shouldExpandByTemplateId || shouldExpandByTaskComponentId || shouldExpandByTaskComponentIdsSet) && isSelected) {
      if (consumedKey) autoExpandConsumedRef.current.add(consumedKey)
      setIsExpanded(true)
      if (!output && !isLoadingOutput && !isGeneratingOutput) {
        onLoadOutput?.()
      }
      if (taskComponentId) onAutoExpandConsumed?.(taskComponentId)
    }
  }, [autoExpandComponentId, autoExpandTaskComponentId, autoExpandTaskComponentIds, component.task_component_id, component.briefing_component_id, component.project_component_id, isSelected, output, isLoadingOutput, isGeneratingOutput, onLoadOutput, onAutoExpandConsumed])
  
  // Cleanup debounced save on unmount or when component changes
  useEffect(() => {
    return () => {
      debouncedSave.cancel()
    }
  }, [debouncedSave, component.task_component_id])
  
  const handleTitleChange = (value: string) => {
    setCustomTitle(value)
    debouncedSave(value, customDescription, component.component_scope)
  }
  
  const handleDescriptionChange = (value: string) => {
    setCustomDescription(value)
    debouncedSave(customTitle, value, component.component_scope)
  }
  
  // Determine if component is template-backed
  // If briefing_component_id or project_component_id exists, it's from a template
  const isTemplateBacked = !!(component.briefing_component_id || component.project_component_id)
  const componentScope: ComponentScope = component.component_scope || (component.project_component_id ? 'project' : component.briefing_component_id ? 'channel' : 'task')
  // Task ad-hoc: show "Save to Project briefing (all channels)" when component is task-only (no template backing)
  const hasTemplateId = !!(Number(component.briefing_component_id) || Number(component.project_component_id))
  const isTaskAdHoc =
    !!component.task_component_id &&
    (!hasTemplateId || component.origin === 'task' || component.is_ad_hoc === true)

  const isGlobalOrProject = component.kind === 'global' || component.kind === 'project' || isTemplateBacked
  // Use component_key from RPC first; fallback to derived key for legacy rows
  const componentKeyForTemplate =
    component.component_key ?? getComponentKeyForSelectedRow?.(component) ?? ''
  const inTemplateLayers = ['task_channel', 'task_project', 'task_global'] as const
  const inCurrentTemplate =
    component.template_layer != null && inTemplateLayers.includes(component.template_layer as any)
  const hasTemplateKey = componentKeyForTemplate.startsWith('g:') || componentKeyForTemplate.startsWith('p:')
  // Save to project template (all channels): show when not in current template (from available meta by component_key) for g:/p:/t:
  const inCurrentTemplateFromAvailable = availableByKeyForTemplate?.get(componentKeyForTemplate)?.in_current_template === true
  const showSaveToProjectAllChannels =
    projectId &&
    effectiveBriefingTypeId != null &&
    !inCurrentTemplateFromAvailable &&
    (componentKeyForTemplate.startsWith('g:') || componentKeyForTemplate.startsWith('p:') || componentKeyForTemplate.startsWith('t:')) &&
    onSaveToProjectAllChannels
  const showRemoveFromTemplate =
    projectId &&
    inCurrentTemplate === true &&
    hasTemplateKey &&
    component.is_ad_hoc !== true &&
    onRequestRemoveFromTemplate
  const showApplyToProjectTemplate = projectId && isGlobalOrProject && hasTemplateKey && onApplyToProjectTemplate
  
  const aiBuildTargetId: number | string | null =
    component.task_component_id || component.briefing_component_id || component.project_component_id || null

  const createOutputCommentThreadMutation = useCreateOutputCommentThread()
  const resolveOutputCommentThreadMutation = useResolveOutputCommentThread()
  const reopenOutputCommentThreadMutation = useReopenOutputCommentThread()
  const taskComponentOutputId = output?.task_component_output_id ?? null
  const isCommentNavigationActive =
    !!commentNavigationTarget
    && !!taskComponentOutputId
    && commentNavigationTarget.outputId === taskComponentOutputId
    && isCommentTargetPulseVisible
  const outputEditorWrapperClassName = cn(
    `${COMPONENT_OUTPUT_FOCUS_WRAPPER_CLASS} component-output-field w-full min-h-[5rem] overflow-visible`,
    (isOutputEditorFocused || isCommentNavigationActive) && COMPONENT_OUTPUT_FIELD_ACTIVE_CLASS,
    isCommentNavigationActive && "ring-2 ring-yellow-400/80 shadow-[0_0_0_3px_rgba(250,204,21,0.25)]",
  )
  useEffect(() => {
    if (!isCommentNavigationActive) return
    const pulseTimeout = window.setTimeout(() => {
      setIsCommentTargetPulseVisible(false)
    }, 3000)
    return () => window.clearTimeout(pulseTimeout)
  }, [isCommentNavigationActive, commentNavigationTarget?.token])
  useEffect(() => {
    if (!isCommentNavigationActive) return
    if (!isExpanded) setIsExpanded(true)
    setShowCommentHighlights(true)
    if (commentNavigationTarget?.threadId != null) {
      setActiveOutputCommentThreadId(commentNavigationTarget.threadId)
    }
    if (commentNavigationTarget?.attachmentId) {
      setSelectedEditableAttachmentId(commentNavigationTarget.attachmentId)
    }
    if (cardDomId) {
      const cardElement = document.getElementById(cardDomId)
      cardElement?.scrollIntoView({ behavior: "smooth", block: "center" })
    }
    if (commentNavigationTarget?.attachmentId) {
      const attachmentId = commentNavigationTarget.attachmentId
      window.setTimeout(() => {
        const attachmentElement = document.querySelector(`figure[data-attachment-id="${attachmentId}"]`)
        if (attachmentElement instanceof HTMLElement) {
          attachmentElement.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }, 140)
    }
  }, [
    isCommentNavigationActive,
    isExpanded,
    commentNavigationTarget?.threadId,
    commentNavigationTarget?.attachmentId,
    cardDomId,
  ])
  useEffect(() => {
    if (!commentNavigationTarget) return
    if (!taskComponentOutputId) return
    if (commentNavigationTarget.outputId !== taskComponentOutputId) return
    setIsCommentTargetPulseVisible(true)
  }, [commentNavigationTarget, taskComponentOutputId])
  const shouldLoadOutputCommentThreads =
    !!taskComponentOutputId
    && (
      isOutputFocusedPane
      || (
        isExpanded
        && (
          showCommentHighlights
          || isOutputCommentComposerOpen
          || activeOutputCommentThreadId != null
          || outputCommentThreads.length > 0
        )
      )
    )
  useEffect(() => {
    if (!shouldLoadOutputCommentThreads || !taskComponentOutputId) return
    onEnsureOutputCommentThreads?.(taskComponentOutputId)
  }, [shouldLoadOutputCommentThreads, taskComponentOutputId, onEnsureOutputCommentThreads])
  const visibleOutputCommentThreads = useMemo(() => {
    if (outputCommentsFilter === "all") return outputCommentThreads
    if (outputCommentsFilter === "resolved") return outputCommentThreads.filter((thread) => !!thread.resolvedAt)
    return outputCommentThreads.filter((thread) => !thread.resolvedAt)
  }, [outputCommentThreads, outputCommentsFilter])
  const activeOutputCommentThread =
    visibleOutputCommentThreads.find((thread) => thread.threadId === activeOutputCommentThreadId) ?? null
  const currentCommentUser = useMemo(
    () => allUsersForOutputComments.find((user) => user.id === currentPublicUserId) ?? null,
    [allUsersForOutputComments, currentPublicUserId]
  )
  const openTaskLevelCommentsPanel = useCallback((params?: {
    threadId?: number | null
    mode?: "compose" | "view"
    focusComposer?: boolean
    anchor?: {
      type: "image_point"
      task_component_output_id: string
      attachment_id: string | null
      anchor_x: number
      anchor_y: number
      anchor_data?: unknown
    } | null
  }) => {
    if (typeof window === "undefined") return
    const taskIdNum = Number(taskId)
    const threadId = params?.threadId ?? null
    window.dispatchEvent(
      new CustomEvent("task-details:open-comments", {
        detail: {
          taskId: Number.isFinite(taskIdNum) ? taskIdNum : null,
          taskComponentOutputId,
          threadId,
          mode: params?.mode ?? "view",
          focusComposer: Boolean(params?.focusComposer),
          anchor: params?.anchor ?? null,
        },
      })
    )
  }, [taskId, taskComponentOutputId])


  // Per-component keyword density when SEO is active (same logic as main table; no new calls)
  const attachmentCommentCountById = useMemo(() => {
    const counts = new Map<string, number>()
    for (const thread of outputCommentThreads) {
      if (thread.target.anchorType !== "asset" || !thread.target.attachmentId) continue
      counts.set(thread.target.attachmentId, (counts.get(thread.target.attachmentId) ?? 0) + 1)
    }
    return counts
  }, [outputCommentThreads])
  const imagePointThreadsByAttachmentId = useMemo(() => {
    const byAttachment = new Map<string, Array<{ threadId: number; anchorX: number; anchorY: number }>>()
    for (const thread of outputCommentThreads) {
      if (thread.target.anchorType !== "image_point") continue
      if (!thread.target.attachmentId) continue
      const anchorX = Number(thread.target.anchorX)
      const anchorY = Number(thread.target.anchorY)
      if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) continue
      const clampedX = Math.max(0, Math.min(1, anchorX))
      const clampedY = Math.max(0, Math.min(1, anchorY))
      const next = byAttachment.get(thread.target.attachmentId) ?? []
      next.push({ threadId: thread.threadId, anchorX: clampedX, anchorY: clampedY })
      byAttachment.set(thread.target.attachmentId, next)
    }
    return byAttachment
  }, [outputCommentThreads])
  const pendingImagePointPin = useMemo(() => {
    if (!isOutputCommentComposerOpen) return null
    if (!selectionDraft || selectionDraft.anchorType !== "image_point" || !selectionDraft.attachmentId) return null
    const x = Number(selectionDraft.anchorX)
    const y = Number(selectionDraft.anchorY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return {
      attachmentId: selectionDraft.attachmentId,
      anchorX: Math.max(0, Math.min(1, x)),
      anchorY: Math.max(0, Math.min(1, y)),
    }
  }, [isOutputCommentComposerOpen, selectionDraft])
  const debugOutputImageOverlays = useMemo(
    () => getDebugOutputImageOverlaysEnabled(),
    []
  )
  const debugImageCommentPosition = useMemo(
    () => getDebugImageCommentPositionEnabled(),
    []
  )
  const outputAttachmentsResolved = useMemo(
    () => outputAttachments,
    [outputAttachments]
  )
  const outputAttachmentMapResolved = useMemo(() => {
    return output?.attachment_map ?? null
  }, [output?.attachment_map])
  const canonicalOutputBlocks = useMemo(
    () =>
      resolveCanonicalOutputBlocks(
        {
          content: output?.content ?? null,
          resolved_content_json: output?.resolved_content_json ?? null,
          content_json: output?.content_json ?? null,
          content_text: output?.content_text ?? null,
          attachment_map: outputAttachmentMapResolved,
          attachments: outputAttachmentsResolved,
        },
        component.custom_title || component.title
      ),
    [output?.content, output?.resolved_content_json, output?.content_json, output?.content_text, outputAttachmentMapResolved, outputAttachmentsResolved, component.custom_title, component.title]
  )
  const canonicalOutputBlocksRef = useRef<OutputContentBlock[]>(canonicalOutputBlocks)
  useEffect(() => {
    canonicalOutputBlocksRef.current = canonicalOutputBlocks
  }, [canonicalOutputBlocks])
  useEffect(() => {
    console.log("[component renderer] received content blocks", {
      outputId: output?.task_component_output_id ?? null,
      content: output?.content ?? null,
      contentText: output?.content_text ?? null,
      canonicalBlockCount: canonicalOutputBlocks.length,
      canonicalBlockTypes: canonicalOutputBlocks.map((block) => block.type),
    })
  }, [canonicalOutputBlocks, output?.task_component_output_id, output?.content, output?.content_text])
  const editorOutputValue = useMemo(
    () => paragraphBlocksToEditorHtml(canonicalOutputBlocks),
    [canonicalOutputBlocks]
  )
  const highlightTerms = useMemo(() => {
    const terms: Array<{ term: string; color: string }> = []
    if (isOutputCommentComposerOpen && selectionDraft?.text?.trim()) {
      terms.push({ term: selectionDraft.text.trim(), color: "rgba(250, 204, 21, 0.35)" })
    }
    const quote = activeOutputCommentThread?.target?.anchorQuote
    if (quote && quote.trim()) {
      terms.push({ term: quote.trim(), color: "rgba(59, 130, 246, 0.2)" })
    }
    return Array.from(new Map(terms.map((item) => [item.term, item])).values())
  }, [isOutputCommentComposerOpen, selectionDraft?.text, activeOutputCommentThread?.target?.anchorQuote])
  const commentHighlights = useMemo(() => {
    return outputCommentThreads
      .map((thread) => {
        const start = thread.target.anchorStart
        const end = thread.target.anchorEnd
        if (start == null || end == null || end <= start) return null
        const latest = thread.previewComment ?? thread.latestComment ?? thread.firstComment ?? null
        return {
          id: thread.threadId,
          start,
          end,
          color: thread.resolvedAt ? "rgba(156, 163, 175, 0.22)" : "rgba(251, 191, 36, 0.24)",
          preview: {
            authorName: latest?.users?.full_name ?? latest?.users?.email ?? (thread.createdBy != null ? `User #${thread.createdBy}` : null),
            authorPhoto: latest?.users?.photo ?? null,
            createdAt: latest?.created_at ?? thread.createdAt ?? null,
            text: latest?.comment ?? thread.target.anchorQuote ?? null,
          },
        }
      })
      .filter(Boolean) as Array<{
      id: number | string
      start: number
      end: number
      color?: string
      preview?: { authorName?: string | null; authorPhoto?: string | null; createdAt?: string | null; text?: string | null }
    }>
  }, [outputCommentThreads])

  const handleSubmitOutputComment = useCallback(async () => {
    const trimmedComment = outputCommentText.trim()
    if (!trimmedComment || !currentPublicUserId || !selectionDraft || !taskComponentOutputId) return
    const selectedParticipants =
      (pendingParticipants ?? []).length > 0
        ? pendingParticipants
        : defaultOutputCommentParticipants
    const watcherIds = Array.from(
      new Set(
        [
          ...selectedParticipants,
          currentPublicUserId != null ? { id: currentPublicUserId } : null,
        ]
          .filter(Boolean)
          .map((participant: any) => Number(participant?.id))
          .filter((id: number) => Number.isFinite(id))
      )
    )
    const createdThreadId = await createOutputCommentThreadMutation.mutateAsync({
      taskId,
      projectId: projectId ?? null,
      channelId: channelId ?? null,
      taskComponentOutputId,
      comment: trimmedComment,
      anchorType: selectionDraft.anchorType === "image_point" ? "image_point" : "text_range",
      anchorStart: selectionDraft.anchorType === "image_point" ? null : (selectionDraft?.start ?? null),
      anchorEnd: selectionDraft.anchorType === "image_point" ? null : (selectionDraft?.end ?? null),
      anchorQuote: selectionDraft.anchorType === "image_point" ? null : (selectionDraft?.text ?? null),
      attachmentId: selectionDraft.attachmentId ?? null,
      anchorX: selectionDraft.anchorType === "image_point" ? (selectionDraft.anchorX ?? null) : null,
      anchorY: selectionDraft.anchorType === "image_point" ? (selectionDraft.anchorY ?? null) : null,
      watcherIds,
      createdBy: currentPublicUserId,
    })
    setOutputCommentText("")
    setPendingParticipants([])
    setRemovedParticipants([])
    setSelectionDraft(null)
    setIsOutputCommentComposerOpen(false)
    setActiveOutputCommentThreadId(createdThreadId)
  }, [
    outputCommentText,
    currentPublicUserId,
    pendingParticipants,
    defaultOutputCommentParticipants,
    createOutputCommentThreadMutation,
    taskId,
    projectId,
    channelId,
    taskComponentOutputId,
    selectionDraft,
  ])

  const ensureTaskComponentOutputId = useCallback(async (): Promise<string | null> => {
    if (!taskId || !channelId) return null
    if (taskComponentOutputId) return taskComponentOutputId
    const saveTarget = getOutputSaveTargetForComponent(component)
    if (!saveTarget) return null
    const payload =
      saveTarget.mode === "task"
        ? {
            task_id: taskId,
            channel_id: channelId,
            task_component_id: saveTarget.taskComponentId,
            content_text: output?.content_text ?? "",
            content_json: output?.content_json ?? null,
            updated_at: new Date().toISOString(),
          }
        : {
            task_id: taskId,
            channel_id: channelId,
            briefing_component_id: saveTarget.briefingComponentId,
            content_text: output?.content_text ?? "",
            content_json: output?.content_json ?? null,
            updated_at: new Date().toISOString(),
          }
    const { data, error } = await supabase
      .from("task_component_outputs")
      .upsert(payload, {
        onConflict:
          saveTarget.mode === "task" ? "task_component_id" : "task_id,channel_id,briefing_component_id",
      })
      .select("id,content_text,content_json,updated_at")
      .single()
    if (error) throw error
    const nextOutputId = typeof data?.id === "string" ? data.id : null
    if (nextOutputId) {
      onPatchOutput?.({
        task_component_output_id: nextOutputId,
        content_text: typeof data?.content_text === "string" ? data.content_text : output?.content_text ?? "",
        content_json: normalizeOutputContentJson((data as any)?.content_json),
        updated_at: typeof data?.updated_at === "string" ? data.updated_at : new Date().toISOString(),
      })
    }
    return nextOutputId
  }, [taskId, channelId, taskComponentOutputId, component, output, supabase, onPatchOutput])

  const resolveImageDimensions = useCallback((file: File): Promise<{ width: number | null; height: number | null }> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        resolve({ width: null, height: null })
        return
      }
      const objectUrl = URL.createObjectURL(file)
      const image = new Image()
      image.onload = () => {
        const width = Number.isFinite(image.naturalWidth) ? image.naturalWidth : null
        const height = Number.isFinite(image.naturalHeight) ? image.naturalHeight : null
        URL.revokeObjectURL(objectUrl)
        resolve({ width, height })
      }
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        resolve({ width: null, height: null })
      }
      image.src = objectUrl
    })
  }, [])

  const resolveVideoDuration = useCallback((file: File): Promise<number | null> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("video/")) {
        resolve(null)
        return
      }
      const objectUrl = URL.createObjectURL(file)
      const video = document.createElement("video")
      video.preload = "metadata"
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : null
        URL.revokeObjectURL(objectUrl)
        resolve(duration)
      }
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(null)
      }
      video.src = objectUrl
    })
  }, [])

  const insertInlineAttachment = useCallback(async (
    file: File,
    context?: { position?: number; currentHtml?: string }
  ) => {
    onCancelPendingOutputAutosave?.()
    const resolvedOutputId = await ensureTaskComponentOutputId()
    if (!resolvedOutputId) return null
    const saveTarget = getOutputSaveTargetForComponent(component)
    const outputKey = saveTarget?.outputKey ?? getOutputMapKeyFromComponent(component)
    if (!outputKey) return null
    onSetIsInsertingMedia?.(true)
    setIsUploadingMedia(true)
    try {
      const mediaType = toMediaTypeFromMime(file.type || "")
      if (!mediaType) return null
      const attachmentSeed = crypto.randomUUID()
      const storagePath = `task-outputs/${taskId}/${resolvedOutputId}/${attachmentSeed}/${sanitizeOutputAttachmentPathSegment(file.name)}`
      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(storagePath, file, { upsert: false, contentType: file.type || undefined })
      if (uploadError) throw uploadError
      const imageSize = mediaType === "image" ? await resolveImageDimensions(file) : { width: null, height: null }
      const durationSeconds = mediaType === "video" ? await resolveVideoDuration(file) : null
      const { data: inserted, error: insertError } = await supabase
        .from("attachments")
        .insert({
          table_name: "task_component_outputs",
          record_id: resolvedOutputId,
          file_name: file.name,
          file_path: storagePath,
          uploaded_by: currentPublicUserId,
          mime_type: file.type || null,
          size: file.size,
          media_type: mediaType,
          width: imageSize.width,
          height: imageSize.height,
          duration_seconds: durationSeconds,
          sort_order: outputAttachments.length,
        })
        .select("*")
        .single()
      if (insertError) throw insertError
      const normalized = normalizeTaskComponentOutputAttachments([inserted])[0]
      if (!normalized) return null
      console.log("insertedAttachment.id", normalized.id)
      const signedUrl = await getAttachmentDisplayUrl({
        supabase,
        attachment: normalized,
        outputId: resolvedOutputId,
        reason: "insert-inline",
      })
      const merged = normalizeTaskComponentOutputAttachments([...outputAttachments, normalized])
      const previousBlocks = output?.content_json
        ?? canonicalOutputBlocks
        ?? extractOutputContentBlocksFromHtml(context?.currentHtml ?? output?.content_text ?? "")
      console.log("blocks before media insert", previousBlocks)
      const baseBlocks = (previousBlocks.length > 0
        ? previousBlocks
        : extractOutputContentBlocksFromHtml(context?.currentHtml ?? output?.content_text ?? ""))
      const nextBlocks = insertAttachmentBlockAtPosition(baseBlocks, normalized.id, context?.position)
      console.log("blocks after media insert", nextBlocks)
      if (!nextBlocks.some((block) => block.type === "attachment" && block.attachment_id === normalized.id)) {
        throw new Error("Attachment block was not inserted into nextBlocks")
      }
      const nextContentText = contentBlocksToPlainText(nextBlocks)
      console.log("saving content_json", nextBlocks)
      const saveAllowed = await saveTaskComponentOutputContentWithGuard({
        supabase,
        outputId: resolvedOutputId,
        previousBlocks,
        nextBlocks,
        contentText: nextContentText,
        traceLabel: "insertInlineAttachment saving",
        traceMeta: { insertedAttachmentId: normalized.id },
      })
      if (!saveAllowed) return null
      onPatchOutput?.({
        attachments: merged,
        task_component_output_id: resolvedOutputId,
        resolved_content_json: nextBlocks,
        content_json: nextBlocks,
        content_text: nextContentText,
      })
      onRequestOutputRefresh?.()
      return {
        attachmentId: normalized.id,
        url: signedUrl ?? normalized.file_path,
        mediaType: mediaType,
        fileName: normalized.file_name || file.name,
      } as const
    } finally {
      setIsUploadingMedia(false)
      onSetIsInsertingMedia?.(false)
    }
  }, [
    onCancelPendingOutputAutosave,
    onSetIsInsertingMedia,
    ensureTaskComponentOutputId,
    component,
    getOutputSaveTargetForComponent,
    canonicalOutputBlocks,
    output?.content_text,
    output?.content_json,
    outputAttachments,
    taskId,
    supabase,
    resolveImageDimensions,
    resolveVideoDuration,
    currentPublicUserId,
    onPatchOutput,
    onRequestOutputRefresh,
  ])
  const handleInlineAttachmentClick = useCallback((
    attachmentId: string,
    context?: { clientX: number; clientY: number; anchorX: number | null; anchorY: number | null }
  ) => {
    setSelectedEditableAttachmentId(attachmentId)
    const threadForAttachment = outputCommentThreads.find(
      (thread) =>
        (thread.target.anchorType === "image_point" || thread.target.anchorType === "asset")
        && thread.target.attachmentId === attachmentId
    )
    if (threadForAttachment) {
      setActiveOutputCommentThreadId(threadForAttachment.threadId)
    } else {
      setActiveOutputCommentThreadId(null)
    }
    setShowCommentHighlights(true)
    if (context && context.anchorX != null && context.anchorY != null && taskComponentOutputId) {
      console.log('[image comment] clicked image', {
        outputId: taskComponentOutputId,
        attachmentId,
        anchor_x: context.anchorX,
        anchor_y: context.anchorY,
      })
      setSelectionDraft(null)
      setIsOutputCommentComposerOpen(false)
      openTaskLevelCommentsPanel({
        mode: "compose",
        focusComposer: true,
        threadId: threadForAttachment?.threadId ?? null,
        anchor: {
          type: "image_point",
          task_component_output_id: taskComponentOutputId,
          attachment_id: attachmentId,
          anchor_x: context.anchorX,
          anchor_y: context.anchorY,
          anchor_data: null,
        },
      })
      return
    }
    openTaskLevelCommentsPanel({ threadId: threadForAttachment?.threadId ?? null })
  }, [outputCommentThreads, openTaskLevelCommentsPanel, taskComponentOutputId])
  const saveOutputBlocks = useCallback(async (
    outputId: string | null,
    blocks: OutputContentBlock[],
    options?: { reason?: string; force?: boolean; skipRefresh?: boolean }
  ) => {
    const reason = options?.reason ?? "unknown"
    console.log("[saveOutputBlocks] START", {
      outputId,
      reason,
      rawBlocks: blocks,
    })
    if (!outputId) {
      console.error("[saveOutputBlocks] missing outputId", { reason, blocks })
      return
    }
    if (taskId && channelId) {
      await ensureManualComponentEditChannelSnapshot({
        taskId,
        channelId,
        componentTitle: getComponentOutputDisplayTitle(component),
      })
    }
    const previousBlocks = canonicalOutputBlocksRef.current
    if (!options?.force && wouldDropAttachments(previousBlocks, blocks)) {
      console.error("[saveOutputBlocks] blocked save that would drop attachments", {
        outputId,
        reason,
        previousBlocks,
        blocks,
      })
      return
    }

    const sanitizedBlocks = sanitizeBlocksForSave(blocks)
    const contentText = contentBlocksToPlainText(sanitizedBlocks as OutputContentBlock[])
    console.log("[saveOutputBlocks] RPC payload", {
      outputId,
      reason,
      contentText,
      sanitizedBlocks,
      attachmentBlocks: sanitizedBlocks.filter((block) => block.type === "attachment"),
    })
    const { data, error } = await supabase.rpc("save_task_component_output_content", {
      p_output_id: outputId,
      p_content_text: contentText,
      p_content_json: sanitizedBlocks,
    })
    console.log("[saveOutputBlocks] RPC result", {
      outputId,
      reason,
      data,
      error,
    })
    if (error) {
      console.error("[saveOutputBlocks] RPC error", error)
      throw error
    }
    if (taskId) {
      bumpAndInvalidateHomeSidebarRecent(queryClient, "tasks", {
        id: String(taskId),
        title: taskTitle?.trim() || `Task ${taskId}`,
      })
    }
    onPatchOutput?.({
      task_component_output_id: outputId,
      resolved_content_json: blocks,
      content_json: blocks,
      content_text: contentText,
    })
    if (!options?.skipRefresh) onRequestOutputRefresh?.()
    return data
  }, [supabase, onPatchOutput, onRequestOutputRefresh, taskId, taskTitle, channelId, component, queryClient])
  const debouncedPersistCanonicalBlocks = useMemo(
    () => debounce((nextBlocks: OutputContentBlock[]) => {
      void saveOutputBlocks(output?.task_component_output_id ?? null, nextBlocks, {
        reason: "paragraph-edit",
        skipRefresh: true,
      })
    }, 350),
    [saveOutputBlocks, output?.task_component_output_id]
  )
  useEffect(() => {
    return () => {
      debouncedPersistCanonicalBlocks.cancel()
    }
  }, [debouncedPersistCanonicalBlocks])
  const getCurrentCanonicalBlocksForOutput = useCallback(() => canonicalOutputBlocksRef.current, [])
  const setCanonicalBlocksForOutput = useCallback((nextBlocks: OutputContentBlock[]) => {
    canonicalOutputBlocksRef.current = nextBlocks
    onPatchOutput?.({
      resolved_content_json: nextBlocks,
      content_json: nextBlocks,
      content_text: contentBlocksToPlainText(nextBlocks),
    })
  }, [onPatchOutput])
  const removeAttachmentBlockFromOutput = useCallback(async (
    outputIdArg: string | null,
    attachmentId: string,
    reason: "x-button" | "keyboard-delete" | "remove-action" = "remove-action"
  ) => {
    const outputId = outputIdArg ?? await ensureTaskComponentOutputId()
    console.log("[removeAttachmentBlockFromOutput] start", {
      outputId,
      attachmentId,
      reason,
    })
    if (!outputId || !attachmentId) {
      console.error("[removeAttachmentBlockFromOutput] missing ids", {
        outputId,
        attachmentId,
        reason,
      })
      return
    }
    const previousBlocks = getCurrentCanonicalBlocksForOutput()
    console.log("[removeAttachmentBlockFromOutput] previousBlocks", {
      outputId,
      attachmentId,
      previousBlocks,
      attachmentBlocks: previousBlocks.filter((block) => block.type === "attachment"),
    })
    const nextBlocksRaw = previousBlocks.filter((block) => !(block.type === "attachment" && block.attachment_id === attachmentId))
    const hasParagraph = nextBlocksRaw.some((block) => block.type === "paragraph")
    const nextBlocks: OutputContentBlock[] = hasParagraph
      ? nextBlocksRaw
      : [...nextBlocksRaw, { type: "paragraph", text: "" }]
    const removed = nextBlocks.length !== previousBlocks.length
    console.log("[removeAttachmentBlockFromOutput] nextBlocks", {
      outputId,
      attachmentId,
      reason,
      removed,
      nextBlocks,
    })
    if (!removed) {
      console.error("[removeAttachmentBlockFromOutput] no matching attachment block found", {
        outputId,
        attachmentId,
      })
      return
    }
    setCanonicalBlocksForOutput(nextBlocks)
    setSelectedEditableAttachmentId((prev) => (prev === attachmentId ? null : prev))
    setDebugLastRemoveClick({
      attachmentId,
      at: new Date().toISOString(),
    })
    await saveOutputBlocks(outputId, nextBlocks, {
      reason,
      force: true,
    })
  }, [
    ensureTaskComponentOutputId,
    getCurrentCanonicalBlocksForOutput,
    setCanonicalBlocksForOutput,
    saveOutputBlocks,
  ])
  const updateAttachmentBlockInCanonicalState = useCallback((attachmentId: string, widthPct: number) => {
    const clamped = Math.max(20, Math.min(100, Number(widthPct)))
    const nextBlocks: OutputContentBlock[] = getCurrentCanonicalBlocksForOutput().map((block) => (
      block.type === "attachment" && block.attachment_id === attachmentId
        ? { ...block, width_pct: clamped }
        : block
    ))
    setCanonicalBlocksForOutput(nextBlocks)
    return nextBlocks
  }, [getCurrentCanonicalBlocksForOutput, setCanonicalBlocksForOutput])
  const handleInlineAttachmentResize = useCallback((attachmentId: string, widthPct: number) => {
    setSelectedEditableAttachmentId(attachmentId)
    updateAttachmentBlockInCanonicalState(attachmentId, widthPct)
  }, [updateAttachmentBlockInCanonicalState])
  const handleInlineAttachmentAction = useCallback((
    attachmentId: string,
    action: "remove" | "shrink" | "grow"
  ) => {
    if (action === "remove") {
      void removeAttachmentBlockFromOutput(output?.task_component_output_id ?? null, attachmentId, "x-button")
      return
    }
    setSelectedEditableAttachmentId(attachmentId)
    const currentAttachment = getCurrentCanonicalBlocksForOutput().find(
      (block): block is Extract<OutputContentBlock, { type: "attachment" }> =>
        block.type === "attachment" && block.attachment_id === attachmentId
    )
    const currentWidth = currentAttachment?.width_pct ?? 100
    const delta = action === "grow" ? 10 : -10
    const nextBlocks = updateAttachmentBlockInCanonicalState(attachmentId, Number(currentWidth) + delta)
    void saveOutputBlocks(output?.task_component_output_id ?? null, nextBlocks, {
      reason: action === "grow" ? "grow-image" : "shrink-image",
      force: true,
      skipRefresh: true,
    })
  }, [getCurrentCanonicalBlocksForOutput, output?.task_component_output_id, removeAttachmentBlockFromOutput, updateAttachmentBlockInCanonicalState, saveOutputBlocks])
  const startImageResize = useCallback((
    event: React.PointerEvent<HTMLDivElement>,
    outputId: string | null,
    attachmentId: string
  ) => {
    console.log("[image resize] handle pointerdown", {
      outputId,
      attachmentId,
      target: event.target,
      currentTarget: event.currentTarget,
    })
    event.preventDefault()
    event.stopPropagation()
    const handle = event.currentTarget
    handle.setPointerCapture?.(event.pointerId)
    const wrapper = handle.closest<HTMLElement>("[data-output-image-wrapper='true']")
    const container =
      wrapper?.closest<HTMLElement>("[data-output-content-body='true']")
      ?? wrapper?.parentElement
    if (!wrapper || !container) {
      console.error("[image resize] missing wrapper/container", {
        outputId,
        attachmentId,
        wrapper,
        container,
      })
      return
    }
    const startX = event.clientX
    const startWidthPx = wrapper.getBoundingClientRect().width
    const containerWidthPx = container.getBoundingClientRect().width
    console.log("[image resize] start", {
      outputId,
      attachmentId,
      startX,
      startWidthPx,
      containerWidthPx,
    })

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      moveEvent.stopPropagation()
      const deltaPx = moveEvent.clientX - startX
      const nextWidthPx = startWidthPx + deltaPx
      const nextPct = Math.max(20, Math.min(100, (nextWidthPx / Math.max(1, containerWidthPx)) * 100))
      console.log("[image resize] move", {
        outputId,
        attachmentId,
        deltaPx,
        nextPct,
      })
      updateAttachmentBlockInCanonicalState(attachmentId, nextPct)
    }

    const onUp = async (upEvent: PointerEvent) => {
      upEvent.preventDefault()
      upEvent.stopPropagation()
      console.log("[image resize] end", {
        outputId,
        attachmentId,
      })
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      const latestBlocks = getCurrentCanonicalBlocksForOutput()
      const resolvedOutputId = outputId ?? await ensureTaskComponentOutputId()
      await saveOutputBlocks(resolvedOutputId, latestBlocks, {
        reason: "resize-image",
        force: true,
      })
    }

    window.addEventListener("pointermove", onMove, { passive: false })
    window.addEventListener("pointerup", onUp, { passive: false })
  }, [ensureTaskComponentOutputId, getCurrentCanonicalBlocksForOutput, saveOutputBlocks, updateAttachmentBlockInCanonicalState])

  const isOutputMediaDragEvent = useCallback((event: React.DragEvent<HTMLElement>): boolean => {
    const types = Array.from(event.dataTransfer?.types ?? [])
    if (types.includes("Files")) return true
    const items = Array.from(event.dataTransfer?.items ?? [])
    return items.some((item) => item.kind === "file")
  }, [])

  const getDroppedMediaFiles = useCallback((event: React.DragEvent<HTMLElement>): File[] => {
    const files = Array.from(event.dataTransfer?.files ?? [])
    return files.filter((file) => toMediaTypeFromMime(file.type || "") != null)
  }, [])

  const uploadOutputMediaAtInsertIndex = useCallback(async (files: File[], insertIndex: number) => {
    if (files.length === 0) return
    onCancelPendingOutputAutosave?.()
    const resolvedOutputId = await ensureTaskComponentOutputId()
    if (!resolvedOutputId) return
    const safeInsertIndex = Math.max(0, Math.min(insertIndex, getCurrentCanonicalBlocksForOutput().length))
    setPendingOutputMediaInsert({ insertIndex: safeInsertIndex, count: files.length })
    onSetIsInsertingMedia?.(true)
    setIsUploadingMedia(true)
    try {
      const uploadedAttachments: TaskComponentOutputAttachment[] = []
      for (let idx = 0; idx < files.length; idx += 1) {
        const file = files[idx]
        const mediaType = toMediaTypeFromMime(file.type || "")
        if (!mediaType) continue
        const attachmentSeed = crypto.randomUUID()
        const storagePath = `task-outputs/${taskId}/${resolvedOutputId}/${attachmentSeed}/${sanitizeOutputAttachmentPathSegment(file.name)}`
        const { error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(storagePath, file, { upsert: false, contentType: file.type || undefined })
        if (uploadError) throw uploadError
        const imageSize = mediaType === "image" ? await resolveImageDimensions(file) : { width: null, height: null }
        const durationSeconds = mediaType === "video" ? await resolveVideoDuration(file) : null
        const { data: inserted, error: insertError } = await supabase
          .from("attachments")
          .insert({
            table_name: "task_component_outputs",
            record_id: resolvedOutputId,
            file_name: file.name,
            file_path: storagePath,
            uploaded_by: currentPublicUserId,
            mime_type: file.type || null,
            size: file.size,
            media_type: mediaType,
            width: imageSize.width,
            height: imageSize.height,
            duration_seconds: durationSeconds,
            sort_order: outputAttachments.length + idx,
          })
          .select("*")
          .single()
        if (insertError) throw insertError
        const normalized = normalizeTaskComponentOutputAttachments([inserted])[0]
        if (!normalized) continue
        uploadedAttachments.push(normalized)
        const signedUrl = await getAttachmentDisplayUrl({
          supabase,
          attachment: normalized,
          outputId: resolvedOutputId,
          reason: "drop-insert",
        })
        setAttachmentUrls((prev) => ({
          ...prev,
          [normalized.id]: signedUrl,
        }))
      }
      if (uploadedAttachments.length === 0) return
      const currentBlocks = getCurrentCanonicalBlocksForOutput()
      const boundedInsert = Math.max(0, Math.min(safeInsertIndex, currentBlocks.length))
      const newAttachmentBlocks: OutputContentBlock[] = uploadedAttachments.map((attachment) => ({
        type: "attachment",
        attachment_id: attachment.id,
        width_pct: 100,
      }))
      const nextBlocks: OutputContentBlock[] = [
        ...currentBlocks.slice(0, boundedInsert),
        ...newAttachmentBlocks,
        ...currentBlocks.slice(boundedInsert),
      ]
      const mergedAttachments = normalizeTaskComponentOutputAttachments([...outputAttachments, ...uploadedAttachments])
      onPatchOutput?.({ attachments: mergedAttachments })
      setCanonicalBlocksForOutput(nextBlocks)
      await saveOutputBlocks(resolvedOutputId, nextBlocks, {
        reason: "drop-media-insert",
        force: true,
      })
    } catch (error: any) {
      console.error("[output media drop] failed", error)
      toast({
        title: "Upload failed",
        description: error?.message || "Could not insert media into output.",
        variant: "destructive",
      })
    } finally {
      setPendingOutputMediaInsert(null)
      setIsUploadingMedia(false)
      onSetIsInsertingMedia?.(false)
    }
  }, [
    onCancelPendingOutputAutosave,
    ensureTaskComponentOutputId,
    getCurrentCanonicalBlocksForOutput,
    onSetIsInsertingMedia,
    taskId,
    supabase,
    resolveImageDimensions,
    resolveVideoDuration,
    currentPublicUserId,
    outputAttachments,
    onPatchOutput,
    setCanonicalBlocksForOutput,
    saveOutputBlocks,
  ])

  const handleOutputMediaDragEnter = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!isOutputMediaDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()
    outputMediaDragDepthRef.current += 1
    setIsOutputMediaDragActive(true)
  }, [isOutputMediaDragEvent])

  const handleOutputMediaDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!isOutputMediaDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()
    setIsOutputMediaDragActive(true)
    const blockEl = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-output-block-index]")
    if (!blockEl) {
      setOutputMediaDropIndex(getCurrentCanonicalBlocksForOutput().length)
      return
    }
    const rawIndex = Number(blockEl.getAttribute("data-output-block-index"))
    const blockIndex = Number.isFinite(rawIndex) ? rawIndex : getCurrentCanonicalBlocksForOutput().length
    const rect = blockEl.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2
    setOutputMediaDropIndex(before ? blockIndex : blockIndex + 1)
  }, [isOutputMediaDragEvent, getCurrentCanonicalBlocksForOutput])

  const handleOutputMediaDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!isOutputMediaDragEvent(event) && !isOutputMediaDragActive) return
    event.preventDefault()
    event.stopPropagation()
    outputMediaDragDepthRef.current = Math.max(0, outputMediaDragDepthRef.current - 1)
    if (outputMediaDragDepthRef.current === 0) {
      setIsOutputMediaDragActive(false)
      setOutputMediaDropIndex(null)
    }
  }, [isOutputMediaDragEvent, isOutputMediaDragActive])

  const handleOutputMediaDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!isOutputMediaDragEvent(event)) return
    const mediaFiles = getDroppedMediaFiles(event)
    event.preventDefault()
    event.stopPropagation()
    outputMediaDragDepthRef.current = 0
    const insertIndex = outputMediaDropIndex ?? getCurrentCanonicalBlocksForOutput().length
    setIsOutputMediaDragActive(false)
    setOutputMediaDropIndex(null)
    if (mediaFiles.length > 0) {
      void uploadOutputMediaAtInsertIndex(mediaFiles, insertIndex)
    }
  }, [isOutputMediaDragEvent, getDroppedMediaFiles, outputMediaDropIndex, getCurrentCanonicalBlocksForOutput, uploadOutputMediaAtInsertIndex])

  const handleOutputImageSurfaceClick = useCallback((
    event: React.MouseEvent<HTMLDivElement>,
    attachmentId: string
  ) => {
    const target = event.target as Element | null
    const imgFromTarget = target?.closest("img")
    const imgFromCurrent = event.currentTarget.querySelector("img")
    const imgEl = (imgFromTarget instanceof HTMLImageElement ? imgFromTarget : null)
      ?? (imgFromCurrent instanceof HTMLImageElement ? imgFromCurrent : null)
    if (!imgEl) return
    const rect = imgEl.getBoundingClientRect()
    if (!(rect.width > 0 && rect.height > 0)) return
    const anchorX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const anchorY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    if (debugImageCommentPosition) {
      setDebugImageClickMarker({
        attachmentId,
        anchorX,
        anchorY,
      })
      console.log("[image comment point]", {
        attachmentId,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        clientX: event.clientX,
        clientY: event.clientY,
        anchor_x: anchorX,
        anchor_y: anchorY,
      })
    }
    event.preventDefault()
    event.stopPropagation()
    handleInlineAttachmentClick(attachmentId, {
      clientX: event.clientX,
      clientY: event.clientY,
      anchorX,
      anchorY,
    })
  }, [debugImageCommentPosition, handleInlineAttachmentClick])

  const flushAndCancelEdit = () => {
    debouncedSave.flush()
    onCancelEdit()
  }
  const flushAndCancelEditDescription = () => {
    debouncedSave.flush()
    onCancelEditDescription()
  }

  // Title in left column (flex-1 min-w-0); no absolute positioning; input constrained so it never overlaps right chrome.
  const selectedTitleSlot = (
    <div className="min-w-0 max-w-full overflow-hidden">
      <div
        className={`${isEditing ? COMPONENT_FIELD_EDIT_WRAPPER_CLASS : COMPONENT_FIELD_DISPLAY_WRAPPER_CLASS} h-8 min-w-0 max-w-full px-1`}
        style={getTitleShellWidthStyle()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          <Input
            value={customTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            size={Math.max(1, (customTitle || '').length)}
            placeholder="Component title"
            className={COMPONENT_TITLE_EDIT_INPUT_CLASS}
            onFocus={() =>
              onActiveFieldChange?.({
                fieldType: "component_title",
                label: "Component Title",
                entityId: component.briefing_component_id ?? component.project_component_id ?? null,
                componentId: component.task_component_id ?? null,
                instructions: customDescription || null,
              })
            }
            onBlur={flushAndCancelEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                flushAndCancelEdit()
              } else if (e.key === 'Escape') {
                flushAndCancelEdit()
              }
            }}
            autoFocus
          />
        ) : (
          <h4
            className="min-w-0 h-full flex items-center cursor-text truncate whitespace-nowrap text-sm font-medium leading-[1.35] text-gray-900 hover:text-gray-700"
            onClick={() => {
              onActiveFieldChange?.({
                fieldType: "component_title",
                label: "Component Title",
                entityId: component.briefing_component_id ?? component.project_component_id ?? null,
                componentId: component.task_component_id ?? null,
                instructions: customDescription || null,
              })
              onStartEdit()
            }}
            title={customTitle || 'Click to edit'}
          >
            {customTitle}
          </h4>
        )}
      </div>
    </div>
  )

  const selectedInstructionsField = (
    <div
      className={`${isEditingDescription ? COMPONENT_FIELD_EDIT_WRAPPER_CLASS : COMPONENT_FIELD_DISPLAY_WRAPPER_CLASS} ${COMPONENT_COLLAPSED_FIELD_WRAPPER_CLASS} bg-muted/30`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isEditingDescription ? (
        <AutoResizeTextarea
          value={customDescription}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="Add instructions..."
          className={COMPONENT_FIELD_TEXTAREA_CLASS}
          onFocus={() =>
            onActiveFieldChange?.({
              fieldType: "component_instructions",
              label: "Component Instructions",
              entityId: component.briefing_component_id ?? component.project_component_id ?? null,
              componentId: component.task_component_id ?? null,
              instructions: customDescription || null,
            })
          }
          onBlur={flushAndCancelEditDescription}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              flushAndCancelEditDescription()
            } else if (e.key === 'Escape') {
              flushAndCancelEditDescription()
            }
          }}
          autoFocus
        />
      ) : (
        <p
          className="line-clamp-2 w-full cursor-text overflow-hidden px-3 py-2 text-xs leading-5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            onActiveFieldChange?.({
              fieldType: "component_instructions",
              label: "Component Instructions",
              entityId: component.briefing_component_id ?? component.project_component_id ?? null,
              componentId: component.task_component_id ?? null,
              instructions: customDescription || null,
            })
            onStartEditDescription()
          }}
          title="Click to edit instructions"
        >
          {(customDescription || '').trim() || 'Add instructions...'}
        </p>
      )}
    </div>
  )

  const showInstructionsSaveIndicator = isEditingDescription || instructionsSaveState !== 'idle'
  const instructionsSaveIndicatorSlot = showInstructionsSaveIndicator ? (
    <div
      className="flex h-4 w-4 shrink-0 items-center justify-center"
      aria-live="polite"
      aria-atomic="true"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {instructionsSaveState === 'saving' ? (
        <Loader2
          className="h-3.5 w-3.5 animate-spin text-muted-foreground"
          aria-label="Saving instructions"
        />
      ) : instructionsSaveState === 'saved' ? (
        <Check
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-label="Instructions saved"
        />
      ) : instructionsSaveState === 'error' ? (
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-red-50"
          title="Couldn't save instructions. Click to retry."
          aria-label="Couldn't save instructions. Retry."
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            void runCustomFieldSave(customTitle, customDescription, component.component_scope)
          }}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
        </button>
      ) : null}
    </div>
  ) : null

  const selectedInstructionsSection = (
    <div className="w-full" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setIsInstructionsExpanded((prev) => !prev)
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-no-dnd
          aria-expanded={isInstructionsExpanded}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-150", !isInstructionsExpanded && "-rotate-90")}
            aria-hidden
          />
          Instructions
        </button>
        {instructionsSaveIndicatorSlot}
      </div>
      {isInstructionsExpanded ? selectedInstructionsField : null}
    </div>
  )

  // Warning icon removed from header; template drift is still available via the "..." menu.
  const totalCommentThreads = Math.max(0, output?.comment_thread_count ?? 0)
  const openCommentThreads = Math.max(0, output?.open_comment_thread_count ?? 0)
  const commentsBadgeSlot = totalCommentThreads > 0 ? (
    <button
      type="button"
      className="inline-flex"
      onClick={(event) => {
        event.stopPropagation()
        setShowCommentHighlights(true)
        openTaskLevelCommentsPanel({ threadId: activeOutputCommentThreadId })
      }}
      onPointerDown={(event) => event.stopPropagation()}
      title="Open task comments"
      aria-label="Open task comments"
    >
      <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-gray-600 hover:bg-gray-50">
        {openCommentThreads > 0 ? `${openCommentThreads} open` : "All resolved"} · {totalCommentThreads}
      </Badge>
    </button>
  ) : null
  const selectedHeaderMetaSlot = commentsBadgeSlot ? (
    <div className="flex flex-wrap items-center gap-1">
      {commentsBadgeSlot}
    </div>
  ) : null

  const parsedKey = parseComponentKey(componentKeyForTemplate)
  const canDeleteSelected = parsedKey.kind === 'project' || parsedKey.kind === 'task_ad_hoc'
  const showDeleteSelected = onRequestDelete && canDeleteSelected
  const selectedMenuSlot = (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open)
        onMenuOpenChange?.(open && cardKey ? cardKey : null)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`h-6 w-6 rounded p-1 shrink-0 text-muted-foreground transition-opacity hover:bg-accent ${menuOpen ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
          title="More actions"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          data-no-dnd
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[100]" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} data-no-dnd>
        <DropdownMenuItem
          disabled={!canMoveUp}
          onClick={(e) => { e.stopPropagation(); onMoveUp?.() }}
        >
          <ChevronUp className="w-4 h-4 mr-2" />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canMoveDown}
          onClick={(e) => { e.stopPropagation(); onMoveDown?.() }}
        >
          <ChevronDown className="w-4 h-4 mr-2" />
          Move down
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            if (!isExpanded) setIsExpanded(true)
            onStartEditDescription()
          }}
        >
          <Pencil className="w-4 h-4 mr-2" />
          {hasInstructions ? 'Edit instructions' : 'Add instructions'}
        </DropdownMenuItem>
        {onDuplicateComponent && (
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDuplicateComponent(component) }}
          >
            <CopyPlus className="w-4 h-4 mr-2" />
            Duplicate component
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {component.selected && onBuildWithAI && aiBuildTargetId && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onBuildWithAI(aiBuildTargetId) }}>
            <Zap className="w-4 h-4 mr-2" />
            Build with AI
          </DropdownMenuItem>
        )}
        {component.selected && onCopyContent && (
          <DropdownMenuItem
            disabled={!canCopyContent}
            onClick={(e) => { e.stopPropagation(); onCopyContent() }}
          >
            <ClipboardCopy className="w-4 h-4 mr-2" />
            Copy component content
          </DropdownMenuItem>
        )}
        {component.selected && output?.task_component_output_id && onOpenVersionHistory && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenVersionHistory() }}>
            <Clock className="w-4 h-4 mr-2" />
            Version history
          </DropdownMenuItem>
        )}
        {component.selected && onBuildWithAI && <DropdownMenuSeparator />}
        {showApplyToProjectTemplate && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onApplyToProjectTemplate!(component) }}>
            <Save className="w-4 h-4 mr-2" />
            Overwrite project template
          </DropdownMenuItem>
        )}
        {onAddToAllChannelsInTask && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddToAllChannelsInTask(component) }}>
            <Plus className="w-4 h-4 mr-2" />
            Add to all channels in this task
          </DropdownMenuItem>
        )}
        {showSaveToProjectAllChannels && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSaveToProjectAllChannels(component) }}>
            <Save className="w-4 h-4 mr-2" />
            Save to project template (all channels)
          </DropdownMenuItem>
        )}
        {showRemoveFromTemplate && (
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onRequestRemoveFromTemplate!(component) }}
            className="text-red-600"
          >
            <FileMinus className="w-4 h-4 mr-2" />
            Remove from template
          </DropdownMenuItem>
        )}
        {showDeleteSelected && (
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onRequestDelete(component) }}
            className="text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        )}
        {component.task_component_id && onResetToTemplate && (component.custom_title != null || component.custom_description != null || component.position != null) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onResetToTemplate(component) }}>
              <History className="w-4 h-4 mr-2" />
              Reset to template
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const renderPendingOutputMediaPlaceholders = useCallback((insertIndex: number) => {
    if (!pendingOutputMediaInsert || pendingOutputMediaInsert.insertIndex !== insertIndex) return null
    return Array.from({ length: pendingOutputMediaInsert.count }).map((_, idx) => (
      <div
        key={`pending-upload-${insertIndex}-${idx}`}
        className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-700"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Uploading media...
      </div>
    ))
  }, [pendingOutputMediaInsert])

  const renderInlineOutputMediaBlocks = useCallback(() => {
    const hasAttachmentBlocks = canonicalOutputBlocks.some((block) => block.type === "attachment")
    const shouldShowMediaRail =
      hasAttachmentBlocks
      || isOutputMediaDragActive
      || pendingOutputMediaInsert != null
      || outputMediaDropIndex != null
    if (!shouldShowMediaRail) return null

    return (
    <div
      data-output-content-body="true"
      className={cn(
        "space-y-3 px-6 pb-1 transition-colors",
        isOutputMediaDragActive && "rounded-md border border-blue-300/80 bg-blue-50/40"
      )}
      onDragEnter={handleOutputMediaDragEnter}
      onDragOver={handleOutputMediaDragOver}
      onDragLeave={handleOutputMediaDragLeave}
      onDrop={handleOutputMediaDrop}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {canonicalOutputBlocks.map((block, index) => {
        if (block.type !== "attachment") {
          return outputMediaDropIndex === index ? (
            <div key={`drop-${index}`} className="h-1 rounded bg-blue-500/90" />
          ) : null
        }
        const attachment = resolveAttachmentForBlock(block, {
          attachment_map: outputAttachmentMapResolved,
          attachments: outputAttachmentsResolved,
        })
        const mediaSrc = attachment ? (attachmentUrls[attachment.id] ?? attachment.file_path) : null
        const widthPct = Math.max(20, Math.min(100, Number(block.width_pct ?? 100)))
        if (!attachment || !mediaSrc) return null
        return (
          <React.Fragment key={`attachment-${block.attachment_id}`}>
            {outputMediaDropIndex === index ? (
              <div className="h-1 rounded bg-blue-500/90" />
            ) : null}
            {renderPendingOutputMediaPlaceholders(index)}
            <div
                data-output-block-index={index}
                data-output-image-wrapper="true"
                data-attachment-id={block.attachment_id}
                className="relative inline-block max-w-full overflow-visible align-top"
                style={{ width: `${widthPct}%` }}
              >
                <div
                  data-output-image-surface="true"
                  className="relative"
                  onClick={(event) => handleOutputImageSurfaceClick(event, block.attachment_id)}
                >
                  <img
                    src={mediaSrc}
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                    className="block h-auto w-full rounded-md"
                    alt={attachment.file_name || "Attachment"}
                  />
                  {(imagePointThreadsByAttachmentId.get(block.attachment_id) ?? []).map((pin) => {
                    if (debugImageCommentPosition) {
                      console.log("[image pin render]", {
                        attachmentId: block.attachment_id,
                        threadId: pin.threadId,
                        anchor_x: pin.anchorX,
                        anchor_y: pin.anchorY,
                        leftPct: pin.anchorX * 100,
                        topPct: pin.anchorY * 100,
                      })
                    }
                    const isActive = activeOutputCommentThreadId != null && pin.threadId === activeOutputCommentThreadId
                    return (
                      <button
                        key={`${block.attachment_id}-pin-${pin.threadId}`}
                        type="button"
                        data-output-image-pin="true"
                        data-thread-id={String(pin.threadId)}
                        className="absolute z-40 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-yellow-400 shadow"
                        style={{
                          left: `${pin.anchorX * 100}%`,
                          top: `${pin.anchorY * 100}%`,
                          boxShadow: isActive
                            ? "0 0 0 4px rgba(253,224,71,0.55),0 2px 6px rgba(0,0,0,0.28)"
                            : "0 2px 6px rgba(0,0,0,0.24)",
                        }}
                        onPointerDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setActiveOutputCommentThreadId(pin.threadId)
                          openTaskLevelCommentsPanel({ threadId: pin.threadId })
                        }}
                      />
                    )
                  })}
                  {debugImageCommentPosition && debugImageClickMarker?.attachmentId === block.attachment_id ? (
                    <div
                      className="absolute z-50 h-3 w-3 -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${debugImageClickMarker.anchorX * 100}%`,
                        top: `${debugImageClickMarker.anchorY * 100}%`,
                      }}
                    >
                      <span className="absolute inset-x-0 top-1/2 h-[1px] -translate-y-1/2 bg-red-500" />
                      <span className="absolute inset-y-0 left-1/2 w-[1px] -translate-x-1/2 bg-red-500" />
                    </div>
                  ) : null}
                  {pendingImagePointPin?.attachmentId === block.attachment_id ? (
                    <span
                      className="absolute z-40 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow"
                      style={{
                        left: `${pendingImagePointPin.anchorX * 100}%`,
                        top: `${pendingImagePointPin.anchorY * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  data-output-image-remove="true"
                  className="absolute right-2 top-2 z-[9999] flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white pointer-events-auto"
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void removeAttachmentBlockFromOutput(output?.task_component_output_id ?? null, block.attachment_id, "x-button")
                  }}
                >
                  ×
                </button>
                <div
                  data-output-image-resize-handle="true"
                  className="absolute bottom-1 right-1 z-[9999] h-6 w-6 cursor-nwse-resize rounded-sm bg-blue-600 outline outline-2 outline-white pointer-events-auto"
                  onPointerDown={(event) => startImageResize(event, output?.task_component_output_id ?? null, block.attachment_id)}
                />
                <div className="absolute left-2 bottom-2 z-[9999] bg-black/70 px-1 text-[10px] text-white">
                  output {(output?.task_component_output_id ?? "").slice(0, 6)} · att {block.attachment_id.slice(0, 6)} · width {Math.round(widthPct)}%
                </div>
              </div>
          </React.Fragment>
        )
      })}
      {outputMediaDropIndex === canonicalOutputBlocks.length ? (
        <div className="h-1 rounded bg-blue-500/90" />
      ) : null}
      {renderPendingOutputMediaPlaceholders(canonicalOutputBlocks.length)}
    </div>
    )
  }, [
    isOutputMediaDragActive,
    pendingOutputMediaInsert,
    handleOutputMediaDragEnter,
    handleOutputMediaDragOver,
    handleOutputMediaDragLeave,
    handleOutputMediaDrop,
    canonicalOutputBlocks,
    outputAttachmentMapResolved,
    outputAttachmentsResolved,
    attachmentUrls,
    outputMediaDropIndex,
    renderPendingOutputMediaPlaceholders,
    handleOutputImageSurfaceClick,
    imagePointThreadsByAttachmentId,
    activeOutputCommentThreadId,
    debugImageCommentPosition,
    debugImageClickMarker,
    pendingImagePointPin,
    openTaskLevelCommentsPanel,
    removeAttachmentBlockFromOutput,
    output?.task_component_output_id,
    startImageResize,
  ])

  const selectedExpandedContent = (
    <>
      {selectedInstructionsSection}
      {(component.purpose || component.guidance || component.suggested_word_count) ? (
        <div className="space-y-1.5 group relative w-full" onPointerDown={(e) => e.stopPropagation()}>
          {component.purpose && (
            <p className="text-xs text-gray-600">{component.purpose}</p>
          )}
          {component.guidance && (
            <p className="text-xs text-gray-500 italic">{component.guidance}</p>
          )}
          {component.suggested_word_count && (
            <p className="text-xs text-gray-400">
              Suggested: ~{component.suggested_word_count} words
            </p>
          )}
        </div>
      ) : null}

      <div
        className="space-y-2 group relative w-full"
        onPointerDown={(e) => e.stopPropagation()}
        onClickCapture={(event: any) => {
          const target = event.target as HTMLElement
          console.log("[component card] click capture", {
            target,
            isRemoveButton: !!target.closest("[data-output-image-remove='true']"),
            isImageWrapper: !!target.closest("[data-output-image-wrapper='true']"),
          })
        }}
      >
        {(isLoadingOutput || isGeneratingOutput) && canonicalOutputBlocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            {isGeneratingOutput && (
              <p className="text-xs text-gray-500">Generating content…</p>
            )}
          </div>
        ) : (
          <div
              className={outputEditorWrapperClassName}
              onPointerDown={(e) => e.stopPropagation()}
              onClickCapture={(event: any) => {
                const target = event.target as HTMLElement
                const wrapper = target.closest("[data-output-image-wrapper='true']")
                if (!wrapper) return
                console.log("[image wrapper] click capture", {
                  attachmentId: wrapper instanceof HTMLElement ? wrapper.getAttribute("data-attachment-id") : null,
                  target: event.target,
                  currentTarget: event.currentTarget,
                })
              }}
              onPointerDownCapture={(event: any) => {
                const target = event.target as HTMLElement
                const wrapper = target.closest("[data-output-image-wrapper='true']")
                if (!wrapper) return
                console.log("[image wrapper] pointerdown capture", {
                  attachmentId: wrapper instanceof HTMLElement ? wrapper.getAttribute("data-attachment-id") : null,
                  target: event.target,
                  currentTarget: event.currentTarget,
                })
              }}
            >
            <ResizableEditor
              componentId={component.briefing_component_id || component.project_component_id || 0}
              value={editorOutputValue}
              onChange={(text) => {
                // Keep the canonical blocks ref live (used by image/media ops) but skip the parent
                // state patch on every keystroke — onOutputChange already syncs content upstream.
                canonicalOutputBlocksRef.current = mergeTextChangesIntoExistingBlocks(getCurrentCanonicalBlocksForOutput(), text)
                onOutputChange(text)
                onSaveOutput()
              }}
              onFocus={handleOutputEditorFocus}
              onBlur={handleOutputEditorBlur}
              toolbarId={`ql-toolbar-${component.briefing_component_id || component.project_component_id}`}
              placeholder="Add output..."
              editorWrapperClassName={COMPONENT_OUTPUT_EDITOR_CLASS}
              footerLeft={null}
              showFooter={false}
              highlightTerms={highlightTerms}
              commentHighlights={commentHighlights}
              showCommentHighlights={showCommentHighlights}
              onCommentHighlightClick={(threadId) => {
                setActiveOutputCommentThreadId(Number(threadId))
                openTaskLevelCommentsPanel({ threadId: Number(threadId) })
              }}
              showResizeHandle={false}
              onAiActionClick={
                onBuildWithAI && aiBuildTargetId
                  ? () => {
                      notifyComponentOutputActiveField("component_action")
                      onBuildWithAI(aiBuildTargetId)
                    }
                  : undefined
              }
              onCommentAction={(selection) => {
                setSelectionDraft(selection)
                setShowCommentHighlights(true)
                openTaskLevelCommentsPanel({ threadId: activeOutputCommentThreadId })
              }}
              toolbarVisibility="always"
              disableInlineMediaControls
              skipValueNormalization
              selectionIdentity={outputSelectionIdentity}
              onAskAiSelection={onAskAiFromSelection}
            />
            {renderInlineOutputMediaBlocks()}
          </div>
        )}
        {debugLastRemoveClick ? (
          <div className="mt-1 rounded bg-yellow-50 px-2 py-1 text-[11px] text-yellow-900">
            Last X click: {debugLastRemoveClick.attachmentId.slice(0, 8)} at {new Date(debugLastRemoveClick.at).toLocaleTimeString()}
          </div>
        ) : null}
      </div>
    </>
  )

  if (isOutputFocusedPane) {
    const outputUpdatedLabel = output?.updated_at
      ? `Updated ${formatRelativeTime(output.updated_at)}`
      : ''
    const outputValue = editorOutputValue
    return (
      <div className="h-full min-h-0 bg-white">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex-1 min-h-0 px-2 pt-2 pb-2">
            <div className="relative h-full min-h-0 space-y-1.5 p-1">
              <div className="absolute right-2 top-2 z-20 flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  onClick={() => onExitFocusOutputPane?.()}
                  title="Exit focused output mode"
                  aria-label="Exit focused output mode"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              </div>
            <div className={outputEditorWrapperClassName}>
            <ResizableEditor
              componentId={component.briefing_component_id || component.project_component_id || 0}
              value={outputValue}
              onChange={(text) => {
                canonicalOutputBlocksRef.current = mergeTextChangesIntoExistingBlocks(getCurrentCanonicalBlocksForOutput(), text)
                onOutputChange(text)
                onSaveOutput()
              }}
              onFocus={handleOutputEditorFocus}
              onBlur={handleOutputEditorBlur}
              toolbarId={`ql-toolbar-focused-${component.briefing_component_id || component.project_component_id}`}
              placeholder="Add output..."
              editorWrapperClassName={COMPONENT_OUTPUT_EDITOR_CLASS}
              highlightTerms={highlightTerms}
              commentHighlights={commentHighlights}
              showCommentHighlights={showCommentHighlights}
              onCommentHighlightClick={(threadId) => {
                setActiveOutputCommentThreadId(Number(threadId))
                openTaskLevelCommentsPanel({ threadId: Number(threadId) })
              }}
              footerLeft={null}
              showResizeHandle={false}
              showFooter={false}
              onAiActionClick={
                onBuildWithAI && aiBuildTargetId
                  ? () => {
                      notifyComponentOutputActiveField("component_action")
                      onBuildWithAI(aiBuildTargetId)
                    }
                  : undefined
              }
              onCommentAction={(selection) => {
                setSelectionDraft(selection)
                setShowCommentHighlights(true)
                openTaskLevelCommentsPanel({ threadId: activeOutputCommentThreadId })
              }}
              disableInlineMediaControls
              skipValueNormalization
              selectionIdentity={outputSelectionIdentity}
              onAskAiSelection={onAskAiFromSelection}
            />
            </div>
            {renderInlineOutputMediaBlocks()}
            {outputUpdatedLabel ? (
              <div className="px-1 text-xs text-gray-400">{outputUpdatedLabel}</div>
            ) : null}
            </div>
          </div>

          <div className="shrink-0 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <button
                type="button"
                onClick={() => onFocusPrevOutput?.()}
                disabled={!onFocusPrevOutput}
                className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default"
              >
                Previous
              </button>
              <span className="text-gray-400">{focusedOutputPositionLabel ?? ''}</span>
              <button
                type="button"
                onClick={() => onFocusNextOutput?.()}
                disabled={!onFocusNextOutput}
                className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-default"
              >
                Next
              </button>
            </div>
          </div>

        </div>
      </div>
    )
  }

  const selectionActionSlot = (
    !isSelected ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={isToggling}
        className="h-7 text-xs"
        aria-label="Add to task"
        aria-busy={isToggling}
        data-no-dnd
        title="Add to task"
      >
        {isToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
      </Button>
    ) : null
  )
  const excludeActionSlot = isSelected ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={isToggling}
      data-no-dnd
      aria-label="Exclude from task"
      title="Exclude from task"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  ) : null
  const isCollapsedHeaderLoading =
    isSelected
    && !isExpanded
    && (isGeneratingOutput || isLoadingOutput)
    && !(output?.content_text?.trim())
  const collapsedHeaderLoadingSlot = (
    <span
      className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-gray-200 px-2 text-gray-500"
      aria-label="Generating component output"
      title="Generating content..."
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    </span>
  )

  const showSelectionRail = isMultiSelectMode || !!isBulkSelected
  const bulkCheckbox = showSelectionRail && bulkSelectKey != null && onBulkSelectToggle ? (
    <div className="shrink-0 flex h-full items-center justify-center self-center translate-y-[2px]" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} data-no-dnd>
      <Checkbox
        checked={!!isBulkSelected}
        onCheckedChange={() => onBulkSelectToggle()}
        aria-label="Select for bulk action"
      />
    </div>
  ) : null

  // When multi-select ON: show checkbox or empty gutter so alignment matches. When OFF: no gutter (leftSlot null).
  const leftSlot = showSelectionRail ? (bulkCheckbox ?? <span aria-hidden />) : null

  // Grey bg when menu is open comes from CSS .card-row:has([data-state="open"]). Collapsed hover stays white.
  const contentColumnPaddingLeft = showSelectionRail ? CONTENT_COLUMN_PADDING_LEFT_MULTISELECT_ON : 16

  // Drag handle lives inside the card header (left of the chevron/title). Listeners are on the handle
  // only, so dragging starts from the handle rather than the whole card.
  const dragHandleSlot = (
    <button
      type="button"
      className="inline-flex h-6 w-5 items-center justify-center rounded text-gray-300 opacity-0 transition-opacity hover:text-gray-600 group-hover/card:opacity-100 cursor-grab active:cursor-grabbing touch-none"
      style={{ touchAction: 'none' }}
      {...(attributes as object)}
      {...(listeners as object)}
      aria-label="Drag to reorder"
      title="Drag to reorder"
    >
      <GripVertical className="h-4 w-4 pointer-events-none" aria-hidden />
    </button>
  )

  return (
    <ComponentCardRow
      leftSlot={leftSlot}
      titleSlot={selectedTitleSlot}
      headerMetaSlot={selectedHeaderMetaSlot}
      rightSlotBeforeChevron={
        isCollapsedHeaderLoading
          ? collapsedHeaderLoadingSlot
          : (
            <>
              {excludeActionSlot}
              {selectedMenuSlot}
              {selectionActionSlot}
            </>
          )
      }
      showChevron={!isCollapsedHeaderLoading}
      isExpanded={isExpanded}
      expandedContentPaddingLeft={contentColumnPaddingLeft}
      onExpandClick={() => {
        if (isExpanded) {
          setIsExpanded(false)
          onActiveFieldChange?.({
            fieldType: "task",
            label: "Task",
            instructions: null,
            componentSelectionSource: null,
          })
        } else {
          onActivateComponentForExport?.()
          selectComponentForAiPane("explicit_click")
          if (isSelected) {
            setIsExpanded(true)
            if (!output && !isLoadingOutput && !isGeneratingOutput) {
              onLoadOutput?.()
            }
          } else {
            onToggle()
          }
        }
      }}
      expandedContent={selectedExpandedContent}
      showCollapsedContentWhenExpanded={false}
      wrapperClassName={cn(
        "group/card transition-colors",
        isCommentNavigationActive && "ring-2 ring-yellow-300/80"
      )}
      wrapperStyle={style}
      wrapperRef={setNodeRef}
      wrapperProps={{
        id: cardDomId,
        'data-component-card-id': cardDomId,
        'data-task-component-output-id': taskComponentOutputId ?? undefined,
        onClickCapture: (event: any) => {
          const target = event.target as HTMLElement
          if (target.closest("button, a, input, textarea, [role='menuitem'], [data-prevent-export-activate='true']")) {
            return
          }
          selectComponentForAiPane("explicit_click")
          console.log("[component card] click capture", {
            target,
            isRemoveButton: !!target.closest("[data-output-image-remove='true']"),
            isImageWrapper: !!target.closest("[data-output-image-wrapper='true']"),
          })
        },
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      }}
      dragHandleSlot={dragHandleSlot}
      contentDisabled={isMutating}
    />
  )
}

function FocusedOutputsWorkspaceItem({
  component,
  output,
  taskId,
  channelId,
  isLoadingOutput,
  isGeneratingOutput,
  onOutputChange,
  onSaveOutput,
  onLoadOutput,
  onBuildWithAI,
  onActiveFieldChange,
  highlightTerms,
  commentHighlights,
  showCommentHighlights,
  onCommentHighlightClick,
  onCommentAction,
  outputCommentThreads = [],
  renderCommentComposer,
  onEditorFocus,
}: {
  component: TaskChannelComponent
  output: TaskComponentOutput | null
  taskId: number
  channelId: number | null
  isLoadingOutput: boolean
  isGeneratingOutput?: boolean
  onOutputChange: (text: string) => void
  onSaveOutput: () => void
  onLoadOutput?: () => void
  onBuildWithAI?: (componentId: number | string) => void
  onActiveFieldChange?: (context: AiActiveFieldContext) => void
  highlightTerms?: Array<{ term: string; color: string }>
  commentHighlights?: Array<{
    id: number | string
    start: number
    end: number
    color?: string
    preview?: { authorName?: string | null; authorPhoto?: string | null; createdAt?: string | null; text?: string | null }
  }>
  showCommentHighlights?: boolean
  onCommentHighlightClick?: (id: number | string) => void
  onCommentAction?: (selection: {
    start: number
    end: number
    text: string
    anchorLeft: number
    anchorTop: number
    anchorType?: "text_range" | "image_point"
    attachmentId?: string | null
    anchorX?: number | null
    anchorY?: number | null
  }) => void
  outputCommentThreads?: OutputCommentThread[]
  renderCommentComposer?: React.ReactNode
  onEditorFocus?: (editor: TiptapEditor) => void
}) {
  useEffect(() => {
    if (!output && !isLoadingOutput && !isGeneratingOutput) {
      onLoadOutput?.()
    }
  }, [output, isLoadingOutput, isGeneratingOutput, onLoadOutput])

  const supabase = useMemo(() => createClientComponentClient(), [])
  const toolbarId = `ql-toolbar-focused-all-${component.task_component_id ?? component.component_key ?? component.briefing_component_id ?? component.project_component_id ?? 'output'}`
  const outputAttachments = useMemo(
    () =>
      collectOutputAttachments({
        attachments: output?.attachments ?? [],
        attachment_map: output?.attachment_map ?? null,
        content: output?.content ?? null,
        resolved_content_json: output?.resolved_content_json ?? null,
        content_json: output?.content_json ?? null,
      }),
    [output?.attachments, output?.attachment_map, output?.content, output?.resolved_content_json, output?.content_json]
  )
  const focusedOutputAttachmentIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const nextIds = new Set(outputAttachments.map((attachment) => attachment.id))
    const prevIds = focusedOutputAttachmentIdsRef.current

    for (const attachment of outputAttachments) {
      if (!prevIds.has(attachment.id)) {
        console.log("[media render] mount", {
          component: "MediaThumb",
          outputId: output?.task_component_output_id ?? null,
          attachmentId: attachment.id,
          filePath: attachment.file_path,
        })
      }
    }
    for (const previousId of Array.from(prevIds)) {
      if (!nextIds.has(previousId)) {
        console.log("[media render] unmount", {
          component: "MediaThumb",
          outputId: output?.task_component_output_id ?? null,
          attachmentId: previousId,
        })
      }
    }
    focusedOutputAttachmentIdsRef.current = nextIds
  }, [outputAttachments, output?.task_component_output_id])
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    const loadSignedUrls = async () => {
      if (outputAttachments.length === 0) {
        setAttachmentUrls({})
        return
      }
      const nextUrls: Record<string, string> = {}
      await Promise.all(outputAttachments.map(async (attachment) => {
        try {
          const displayUrl = await getAttachmentDisplayUrl({
            supabase,
            attachment,
            outputId: output?.task_component_output_id ?? null,
            reason: "focused-output-load",
          })
          if (displayUrl) nextUrls[attachment.id] = displayUrl
        } catch (error) {
          console.error("[media url] failed to resolve display URL", {
            attachmentId: attachment.id,
            file_path: attachment.file_path,
            error,
          })
        }
      }))
      if (!cancelled) setAttachmentUrls(nextUrls)
    }
    void loadSignedUrls()
    return () => {
      cancelled = true
    }
  }, [supabase, outputAttachments, output?.task_component_output_id])
  const outputAttachmentsResolved = useMemo(
    () => outputAttachments,
    [outputAttachments]
  )
  const outputAttachmentMapResolved = useMemo(() => {
    return output?.attachment_map ?? null
  }, [output?.attachment_map])
  const canonicalBlocks = useMemo(
    () =>
      resolveCanonicalOutputBlocks(
        {
          content: output?.content ?? null,
          resolved_content_json: output?.resolved_content_json ?? null,
          content_json: output?.content_json ?? null,
          content_text: output?.content_text ?? null,
          attachment_map: outputAttachmentMapResolved,
          attachments: outputAttachmentsResolved,
        },
        component.custom_title || component.title
      ),
    [output?.content, output?.resolved_content_json, output?.content_json, output?.content_text, outputAttachmentMapResolved, outputAttachmentsResolved, component.custom_title, component.title]
  )
  const attachmentCommentCountById = useMemo(() => {
    const counts = new Map<string, number>()
    for (const thread of outputCommentThreads) {
      if ((thread.target.anchorType !== "asset" && thread.target.anchorType !== "image_point") || !thread.target.attachmentId) continue
      counts.set(thread.target.attachmentId, (counts.get(thread.target.attachmentId) ?? 0) + 1)
    }
    return counts
  }, [outputCommentThreads])
  const imagePointThreadsByAttachmentId = useMemo(() => {
    const byAttachment = new Map<string, Array<{ threadId: number; anchorX: number; anchorY: number }>>()
    for (const thread of outputCommentThreads) {
      if (thread.target.anchorType !== "image_point" || !thread.target.attachmentId) continue
      const x = Number(thread.target.anchorX)
      const y = Number(thread.target.anchorY)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const next = byAttachment.get(thread.target.attachmentId) ?? []
      next.push({ threadId: thread.threadId, anchorX: Math.max(0, Math.min(1, x)), anchorY: Math.max(0, Math.min(1, y)) })
      byAttachment.set(thread.target.attachmentId, next)
    }
    return byAttachment
  }, [outputCommentThreads])
  const debugOutputImageOverlays = useMemo(
    () => getDebugOutputImageOverlaysEnabled(),
    []
  )
  const editorOutputValue = useMemo(
    () => paragraphBlocksToEditorHtml(canonicalBlocks),
    [canonicalBlocks]
  )
  const canEditMedia = useMemo(
    () => Boolean(output?.task_component_output_id),
    [output?.task_component_output_id]
  )
  const handleInlineAttachmentClick = useCallback((
    attachmentId: string,
    context?: { clientX: number; clientY: number; anchorX: number | null; anchorY: number | null }
  ) => {
    const threadForAttachment = outputCommentThreads.find((thread) =>
      (thread.target.anchorType === "image_point" || thread.target.anchorType === "asset")
      && thread.target.attachmentId === attachmentId
    )
    if (threadForAttachment) onCommentHighlightClick?.(threadForAttachment.threadId)
    const outputId = output?.task_component_output_id ?? null
    const anchorX = context?.anchorX ?? 0.5
    const anchorY = context?.anchorY ?? 0.5
    console.log('[image comment] clicked image', {
      outputId,
      attachmentId,
      anchor_x: anchorX,
      anchor_y: anchorY,
    })
    if (typeof window !== "undefined" && outputId) {
      const outputTaskId =
        output && typeof output === "object" && "task_id" in output
          ? (output as Record<string, unknown>).task_id
          : null
      const taskIdNum = Number(outputTaskId ?? null)
      window.dispatchEvent(
        new CustomEvent("task-details:open-comments", {
          detail: {
            taskId: Number.isFinite(taskIdNum) ? taskIdNum : null,
            taskComponentOutputId: outputId,
            threadId: threadForAttachment?.threadId ?? null,
            mode: "compose",
            focusComposer: true,
            anchor: {
              type: "image_point",
              task_component_output_id: outputId,
              attachment_id: attachmentId,
              anchor_x: anchorX,
              anchor_y: anchorY,
              anchor_data: null,
            },
          },
        })
      )
    }
  }, [output, outputCommentThreads, onCommentHighlightClick, output?.task_component_output_id])
  const handleInlineAttachmentAction = useCallback((
    attachmentId: string,
    action: "remove" | "shrink" | "grow"
  ) => {
    const nextBlocks: OutputContentBlock[] = action === "remove"
      ? (() => {
          const nextRaw = canonicalBlocks.filter((block) => !(block.type === "attachment" && block.attachment_id === attachmentId))
          return nextRaw.some((block) => block.type === "paragraph")
            ? nextRaw
            : [...nextRaw, { type: "paragraph", text: "" }]
        })()
      : canonicalBlocks.map((block) => {
          if (block.type !== "attachment" || block.attachment_id !== attachmentId) return block
          const currentWidth = Number.isFinite(Number(block.width_pct)) ? Number(block.width_pct) : 100
          const delta = action === "grow" ? 10 : -10
          return { ...block, width_pct: Math.max(20, Math.min(100, currentWidth + delta)) }
        })
    const nextHtml = outputContentBlocksToHtml(
      nextBlocks,
      { attachment_map: outputAttachmentMapResolved, attachments: outputAttachmentsResolved },
      attachmentCommentCountById,
      imagePointThreadsByAttachmentId,
      {
        outputId: output?.task_component_output_id ?? null,
        mode: "focus",
        debugOutputImageOverlays,
        attachmentDisplayUrlById: attachmentUrls,
      }
    )
    onOutputChange(nextHtml)
    onSaveOutput()
  }, [canonicalBlocks, outputAttachmentMapResolved, outputAttachmentsResolved, attachmentCommentCountById, imagePointThreadsByAttachmentId, onOutputChange, onSaveOutput, output?.task_component_output_id, debugOutputImageOverlays, attachmentUrls])
  const updateInlineAttachmentWidth = useCallback((attachmentId: string, widthPct: number, shouldSave: boolean) => {
    const clamped = Math.max(20, Math.min(100, Number(widthPct)))
    const nextBlocks: OutputContentBlock[] = canonicalBlocks.map((block) => (
      block.type === "attachment" && block.attachment_id === attachmentId
        ? { ...block, width_pct: clamped }
        : block
    ))
    const nextHtml = outputContentBlocksToHtml(
      nextBlocks,
      { attachment_map: outputAttachmentMapResolved, attachments: outputAttachmentsResolved },
      attachmentCommentCountById,
      imagePointThreadsByAttachmentId,
      {
        outputId: output?.task_component_output_id ?? null,
        mode: "focus",
        debugOutputImageOverlays,
        attachmentDisplayUrlById: attachmentUrls,
      }
    )
    onOutputChange(nextHtml)
    if (shouldSave) onSaveOutput()
  }, [canonicalBlocks, outputAttachmentMapResolved, outputAttachmentsResolved, attachmentCommentCountById, imagePointThreadsByAttachmentId, onOutputChange, onSaveOutput, output?.task_component_output_id, debugOutputImageOverlays, attachmentUrls])
  const handleInlineAttachmentResize = useCallback((attachmentId: string, widthPct: number) => {
    updateInlineAttachmentWidth(attachmentId, widthPct, true)
  }, [updateInlineAttachmentWidth])
  const startImageResize = useCallback((
    event: React.PointerEvent<HTMLDivElement>,
    attachmentId: string
  ) => {
    console.log("[output image resize] pointerdown", {
      outputId: output?.task_component_output_id ?? null,
      attachmentId,
      canEditMedia,
    })
    event.preventDefault()
    event.stopPropagation()
    if (!canEditMedia) return
    const handle = event.currentTarget
    handle.setPointerCapture?.(event.pointerId)
    const wrapper = handle.closest<HTMLElement>("[data-output-image-wrapper='true']")
    const container =
      wrapper?.closest<HTMLElement>("[data-output-content-body='true']")
      ?? wrapper?.parentElement
    if (!wrapper || !container) return
    const startX = event.clientX
    const startWidthPx = wrapper.getBoundingClientRect().width
    const containerWidthPx = Math.max(1, container.getBoundingClientRect().width)
    console.log("[image resize] start", {
      outputId: output?.task_component_output_id ?? null,
      attachmentId,
      startX,
      startWidthPx,
      containerWidthPx,
    })
    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      moveEvent.stopPropagation()
      const deltaPx = moveEvent.clientX - startX
      const nextWidthPx = startWidthPx + deltaPx
      const nextPct = Math.max(20, Math.min(100, (nextWidthPx / containerWidthPx) * 100))
      console.log("[image resize] move", {
        outputId: output?.task_component_output_id ?? null,
        attachmentId,
        deltaPx,
        nextPct,
      })
      updateInlineAttachmentWidth(attachmentId, nextPct, false)
    }
    const onUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault()
      upEvent.stopPropagation()
      console.log("[image resize] end", {
        outputId: output?.task_component_output_id ?? null,
        attachmentId,
      })
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      onSaveOutput()
    }
    window.addEventListener("pointermove", onMove, { passive: false })
    window.addEventListener("pointerup", onUp, { passive: false })
  }, [canEditMedia, onSaveOutput, output?.task_component_output_id, updateInlineAttachmentWidth])
  const renderInlineOutputMediaBlocks = useCallback(() => (
    <div data-output-content-body="true" className="space-y-3 px-6 pb-4">
      {canonicalBlocks.map((block, index) => {
        if (block.type !== "attachment") {
          return <div key={`paragraph-spacer-${index}`} data-output-block-index={index} className="h-1.5 w-full" />
        }
        const attachment = resolveAttachmentForBlock(block, {
          attachment_map: outputAttachmentMapResolved,
          attachments: outputAttachmentsResolved,
        })
        if (!attachment) return null
        const mediaSrc = attachmentUrls[attachment.id] ?? attachment.file_path
        if (!mediaSrc) return null
        const widthPct = Math.max(20, Math.min(100, Number(block.width_pct ?? 100)))
        const mode = "focus"
        const isFocusMode = true
        const isExpanded = true
        console.log("[InlineOutputAttachmentBlock] render controls", {
          outputId: output?.task_component_output_id ?? null,
          attachmentId: block.attachment_id,
          mode,
          canEditMedia,
          readOnly: false,
          isExpanded,
          isFocusMode,
        })
        return (
          <div
            key={`attachment-${block.attachment_id}`}
            data-output-block-index={index}
            data-output-image-wrapper="true"
            data-attachment-id={block.attachment_id}
            className="relative inline-block max-w-full overflow-visible align-top"
            style={{ width: `${widthPct}%` }}
          >
            <div
              data-output-image-surface="true"
              className="relative"
              onClick={(event) => {
                const target = event.target as Element | null
                const imgFromTarget = target?.closest("img")
                const imgFromCurrent = event.currentTarget.querySelector("img")
                const imgEl = (imgFromTarget instanceof HTMLImageElement ? imgFromTarget : null)
                  ?? (imgFromCurrent instanceof HTMLImageElement ? imgFromCurrent : null)
                if (!imgEl) return
                const rect = imgEl.getBoundingClientRect()
                if (!(rect.width > 0 && rect.height > 0)) return
                const anchorX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
                const anchorY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
                handleInlineAttachmentClick(block.attachment_id, {
                  clientX: event.clientX,
                  clientY: event.clientY,
                  anchorX,
                  anchorY,
                })
              }}
            >
              <img
                src={mediaSrc}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                className="block h-auto w-full rounded-md"
                alt={attachment.file_name || "Attachment"}
              />
              {(imagePointThreadsByAttachmentId.get(block.attachment_id) ?? []).map((pin) => (
                <button
                  key={`${block.attachment_id}-pin-${pin.threadId}`}
                  type="button"
                  data-output-image-pin="true"
                  data-thread-id={String(pin.threadId)}
                  className="absolute z-40 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-yellow-400 shadow"
                  style={{
                    left: `${pin.anchorX * 100}%`,
                    top: `${pin.anchorY * 100}%`,
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onCommentHighlightClick?.(pin.threadId)
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              data-output-image-remove="true"
              className="absolute right-2 top-2 z-[9999] flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white pointer-events-auto"
              onPointerDown={(event) => {
                console.log("[output image remove] pointerdown", {
                  outputId: output?.task_component_output_id ?? null,
                  attachmentId: block.attachment_id,
                  mode: "focus",
                  canEditMedia,
                })
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                console.log("[output image remove] click", {
                  outputId: output?.task_component_output_id ?? null,
                  attachmentId: block.attachment_id,
                  mode: "focus",
                  canEditMedia,
                })
                event.preventDefault()
                event.stopPropagation()
                if (!canEditMedia) {
                  console.warn("[output image remove] ignored because canEditMedia=false", {
                    outputId: output?.task_component_output_id ?? null,
                    attachmentId: block.attachment_id,
                    mode: "focus",
                  })
                  return
                }
                handleInlineAttachmentAction(block.attachment_id, "remove")
              }}
            >
              ×
            </button>
            <div
              data-output-image-resize-handle="true"
              className="absolute bottom-1 right-1 z-[9999] h-6 w-6 cursor-nwse-resize rounded-sm bg-blue-600 outline outline-2 outline-white pointer-events-auto"
              onPointerDown={(event) => startImageResize(event, block.attachment_id)}
            />
          </div>
        )
      })}
    </div>
  ), [
    canonicalBlocks,
    outputAttachmentMapResolved,
    outputAttachmentsResolved,
    attachmentUrls,
    output?.task_component_output_id,
    canEditMedia,
    handleInlineAttachmentClick,
    imagePointThreadsByAttachmentId,
    onCommentHighlightClick,
    handleInlineAttachmentAction,
    startImageResize,
  ])
  const aiBuildTargetId: number | string | null =
    component.task_component_id || component.briefing_component_id || component.project_component_id || null

  return (
    <div className="relative w-full">
      {(isLoadingOutput || isGeneratingOutput) && canonicalBlocks.length === 0 ? (
        <div className="flex min-h-[8rem] items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      ) : (
        <ResizableEditor
          componentId={component.briefing_component_id || component.project_component_id || 0}
          value={editorOutputValue}
          onChange={(text) => {
            const nextBlocks = mergeTextChangesIntoExistingBlocks(canonicalBlocks, text)
            const nextHtml = outputContentBlocksToHtml(
              nextBlocks,
              { attachment_map: outputAttachmentMapResolved, attachments: outputAttachmentsResolved },
              attachmentCommentCountById,
              imagePointThreadsByAttachmentId,
              {
                outputId: output?.task_component_output_id ?? null,
                mode: "focus",
                debugOutputImageOverlays,
                attachmentDisplayUrlById: attachmentUrls,
              }
            )
            onOutputChange(nextHtml)
            onSaveOutput()
          }}
          onFocus={() =>
            onActiveFieldChange?.(
              buildComponentOutputActiveFieldContext({
                taskId,
                channelId,
                taskComponentId: component.task_component_id ?? null,
                taskComponentOutputId: output?.task_component_output_id ?? null,
                componentTitle: getComponentOutputDisplayTitle(component),
                entityId: component.briefing_component_id ?? component.project_component_id ?? null,
                instructions: (component.custom_description || component.description || "") || null,
                selectionSource: "explicit_click",
              }),
            )
          }
          toolbarId={toolbarId}
          placeholder="Add output..."
          editorWrapperClassName="!border-0"
          showResizeHandle={false}
          showFooter={false}
          autoGrow
          onAiActionClick={
            onBuildWithAI && aiBuildTargetId
              ? () => {
                  onActiveFieldChange?.(
                    buildComponentOutputActiveFieldContext({
                      taskId,
                      channelId,
                      taskComponentId: component.task_component_id ?? null,
                      taskComponentOutputId: output?.task_component_output_id ?? null,
                      componentTitle: getComponentOutputDisplayTitle(component),
                      entityId: component.briefing_component_id ?? component.project_component_id ?? null,
                      instructions: (component.custom_description || component.description || "") || null,
                      selectionSource: "component_action",
                    }),
                  )
                  onBuildWithAI(aiBuildTargetId)
                }
              : undefined
          }
          highlightTerms={highlightTerms}
          commentHighlights={commentHighlights}
          showCommentHighlights={showCommentHighlights}
          onCommentHighlightClick={onCommentHighlightClick}
          onCommentAction={onCommentAction}
          toolbarVisibility="hidden"
          onEditorFocus={onEditorFocus}
          onInlineAttachmentClick={handleInlineAttachmentClick}
          onInlineAttachmentAction={handleInlineAttachmentAction}
          onInlineAttachmentResize={handleInlineAttachmentResize}
          disableInlineMediaControls
          skipValueNormalization
        />
      )}
      {!(isLoadingOutput || isGeneratingOutput) ? renderInlineOutputMediaBlocks() : null}
      {renderCommentComposer}
    </div>
  )
}

function FocusedSortableWorkspaceItem({
  sortableId,
  anchorId,
  title,
  onExclude,
  isExcluding = false,
  children,
}: {
  sortableId: string
  anchorId: string
  title: string
  onExclude?: () => void
  isExcluding?: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sortableId,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} id={anchorId} className="scroll-mt-24">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 cursor-grab active:cursor-grabbing touch-none"
          style={{ touchAction: 'none' }}
          {...(attributes as object)}
          {...(listeners as object)}
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1 truncate text-xs text-gray-500">{title}</div>
        {onExclude ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onExclude}
            disabled={isExcluding}
            className="h-7 text-xs"
            aria-label="Exclude from task"
            title="Exclude from task"
          >
            {isExcluding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Exclude'}
          </Button>
        ) : null}
      </div>
      <div className="pl-5">
        {children}
      </div>
    </div>
  )
}

/** Available-to-add row: same card layout as Selected, toggle to add, chevron expands to show instructions (editable), "..." menu. */
function AvailableComponentRow({
  item,
  onAdd,
  isAdding,
  isDisabled,
  onSaveInstructions,
  onRemoveFromTemplate,
  onDelete,
  onApplyToProjectTemplate,
  onAddToAllChannelsInTask,
  onSaveToProjectAllChannels,
  onRequestRemoveFromTemplate,
  onRequestDelete,
  onDismissSuggestion,
  projectId,
  briefingTypeId,
  bulkSelectKey,
  isBulkSelected,
  onBulkSelectToggle,
  expandedContentPaddingLeft,
  onActiveFieldChange,
  sourceTags = [],
}: {
  item: TaskChannelAvailableComponent
  onAdd: (item: TaskChannelAvailableComponent) => void
  isAdding: boolean
  isDisabled?: boolean
  onSaveInstructions?: (item: TaskChannelAvailableComponent, title: string, description: string, applyToProjectTemplate?: boolean) => void | Promise<void>
  onRemoveFromTemplate?: (item: TaskChannelAvailableComponent) => void
  onDelete?: (item: TaskChannelAvailableComponent) => void
  onApplyToProjectTemplate?: (item: TaskChannelAvailableComponent) => void
  onAddToAllChannelsInTask?: (item: TaskChannelAvailableComponent) => void
  onSaveToProjectAllChannels?: (item: TaskChannelAvailableComponent) => void
  onRequestRemoveFromTemplate?: (item: TaskChannelAvailableComponent) => void
  onRequestDelete?: (item: TaskChannelAvailableComponent) => void
  onDismissSuggestion?: (item: TaskChannelAvailableComponent) => void
  projectId?: number
  briefingTypeId?: number | null
  bulkSelectKey?: string
  isBulkSelected?: boolean
  onBulkSelectToggle?: () => void
  /** When set, expanded body aligns with title (same content column as selected cards). */
  expandedContentPaddingLeft?: number
  sourceTags?: string[]
  onActiveFieldChange?: (context: AiActiveFieldContext) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const [isEditingInstructions, setIsEditingInstructions] = useState(false)
  const [applyToProjectTemplate, setApplyToProjectTemplate] = useState(false)
  // Display and edit both use custom_* when present (so display state matches edit state)
  const effectiveTitle = item.custom_title != null ? item.custom_title : (item.title ?? '')
  const effectiveDescription = item.custom_description != null ? item.custom_description : (item.description ?? '')

  const [editTitle, setEditTitle] = useState(effectiveTitle)
  const [editDescription, setEditDescription] = useState(effectiveDescription)
  const isTemplateBacked = item.kind === 'global' || item.kind === 'project'
  const isAiSuggestion = item.kind === 'ai_suggestion' || (item.component_key ?? item.key ?? '').startsWith('ai:')
  // Apply to project template: show for global/project with g:/p: key regardless of template membership (saving edits to template)
  const showApplyToTemplate =
    isTemplateBacked &&
    projectId &&
    briefingTypeId &&
    (item.component_key?.startsWith('g:') || item.component_key?.startsWith('p:'))

  useEffect(() => {
    setEditTitle(item.custom_title != null ? item.custom_title : (item.title ?? ''))
    setEditDescription(item.custom_description != null ? item.custom_description : (item.description ?? ''))
  }, [item.component_key, item.custom_title, item.title, item.custom_description, item.description])

  // Remove from template: only when in current template (BE field) and component_key g:/p:. Never for t: ad-hoc.
  const canRemoveFromTemplate =
    projectId &&
    item.in_current_template === true &&
    (item.component_key?.startsWith('g:') || item.component_key?.startsWith('p:'))
  // Delete: show from component_key only. p: or t: => show; g: or unknown => hide.
  const parsedKeyAvailable = parseComponentKey(item.component_key ?? item.key)
  const canDelete = parsedKeyAvailable.kind === 'project' || parsedKeyAvailable.kind === 'task_ad_hoc'
  // Save to project template (all channels): show when not in template for g:/p:/t: (uses pbtc_add_all_channels_by_key for g:/p:).
  const showSaveToProjectAllChannels =
    projectId &&
    briefingTypeId != null &&
    item.in_current_template === false &&
    (item.component_key?.startsWith('g:') || item.component_key?.startsWith('p:') || item.component_key?.startsWith('t:')) &&
    onSaveToProjectAllChannels

  const [isEditingTitle, setIsEditingTitle] = useState(false)

  const handleBlurTitle = () => {
    if (!onSaveInstructions) return
    setIsEditingTitle(false)
    const title = editTitle.trim() || effectiveTitle
    const desc = (editDescription ?? '').trim() || (effectiveDescription ?? '')
    if (title !== effectiveTitle || desc !== (effectiveDescription ?? '')) {
      onSaveInstructions(item, title, desc, applyToProjectTemplate)
    }
  }

  const handleBlurInstructions = () => {
    if (!onSaveInstructions) return
    setIsEditingInstructions(false)
    const title = (editTitle ?? '').trim() || effectiveTitle
    const desc = (editDescription ?? '').trim() || (effectiveDescription ?? '')
    if (title !== effectiveTitle || desc !== (effectiveDescription ?? '')) {
      onSaveInstructions(item, title, desc, applyToProjectTemplate)
    }
  }

  const bulkCheckbox = bulkSelectKey != null && onBulkSelectToggle ? (
    <div className="shrink-0 flex h-full items-center justify-center self-center translate-y-[2px]" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} data-no-dnd>
      <Checkbox
        checked={!!isBulkSelected}
        onCheckedChange={() => onBulkSelectToggle()}
        aria-label="Select for bulk action"
      />
    </div>
  ) : null

  // When multi-select ON: show checkbox or empty gutter (same as selected pile). When OFF: no gutter.
  const leftSlot = bulkSelectKey != null ? (bulkCheckbox ?? <span aria-hidden />) : null

  const availableTitleFieldClassName = onSaveInstructions && isEditingTitle
    ? `${COMPONENT_FIELD_EDIT_WRAPPER_CLASS} min-w-0 max-w-full`
    : `${COMPONENT_FIELD_DISPLAY_WRAPPER_CLASS} min-w-0 max-w-full`
  const titleSlot = (
    <div className="min-w-0 inline-flex max-w-full">
      <div className={`${availableTitleFieldClassName} h-8 px-1`} style={getTitleShellWidthStyle()}>
        {onSaveInstructions && isEditingTitle ? (
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            size={Math.max(1, (editTitle || '').length)}
            placeholder="Component title"
            className={COMPONENT_TITLE_EDIT_INPUT_CLASS}
            onBlur={handleBlurTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleBlurTitle()
              } else if (e.key === 'Escape') {
                setEditTitle(effectiveTitle)
                setIsEditingTitle(false)
              }
            }}
            autoFocus
          />
        ) : (
          <h4
            className="min-w-0 h-full flex items-center cursor-text truncate text-sm font-normal leading-5 text-gray-900 hover:text-gray-700"
            onClick={() => {
              if (onSaveInstructions) {
                setEditTitle(effectiveTitle)
                setIsEditingTitle(true)
              }
            }}
            title="Click to edit"
          >
            {effectiveTitle}
          </h4>
        )}
      </div>
    </div>
  )
  const availableCollapsedDescriptionContent = (
    isEditingInstructions && onSaveInstructions ? (
      <div className={`${COMPONENT_FIELD_EDIT_WRAPPER_CLASS} ${COMPONENT_COLLAPSED_FIELD_WRAPPER_CLASS}`}>
        <AutoResizeTextarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder="Add instructions..."
          className={COMPONENT_FIELD_TEXTAREA_CLASS}
          onFocus={() =>
            onActiveFieldChange?.({
              fieldType: "component_instructions",
              label: "Component Instructions",
              entityId: item.briefing_component_id ?? item.project_component_id ?? null,
              componentId: item.task_component_id ?? null,
              instructions: editDescription || null,
            })
          }
          onBlur={handleBlurInstructions}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditDescription(effectiveDescription ?? '')
              setIsEditingInstructions(false)
            }
          }}
          autoFocus
        />
      </div>
    ) : (
      <div className={`${COMPONENT_FIELD_DISPLAY_WRAPPER_CLASS} ${COMPONENT_COLLAPSED_FIELD_WRAPPER_CLASS}`}>
        <p
          className="line-clamp-2 break-words min-h-8 px-1 py-0.5 text-sm leading-5 text-gray-500 cursor-text hover:text-gray-700 w-full overflow-hidden"
          onClick={() => {
            onActiveFieldChange?.({
              fieldType: "component_instructions",
              label: "Component Instructions",
              entityId: item.briefing_component_id ?? item.project_component_id ?? null,
              componentId: item.task_component_id ?? null,
              instructions: effectiveDescription || null,
            })
            if (onSaveInstructions) {
              setEditDescription(effectiveDescription ?? '')
              setIsEditingInstructions(true)
            }
          }}
          title="Click to edit"
        >
          {(effectiveDescription || '').trim() || 'Add instructions...'}
        </p>
      </div>
    )
  )

  const hasMenuActions = showApplyToTemplate || onAddToAllChannelsInTask || showSaveToProjectAllChannels || canRemoveFromTemplate || canDelete || (isAiSuggestion && !!onDismissSuggestion)
  const menuSlot = hasMenuActions ? (
    <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-1 hover:bg-gray-100 rounded shrink-0 text-gray-500"
          title="More actions"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          data-no-dnd
        >
          <MoreVertical className="w-4 h-4 text-gray-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[100]" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} data-no-dnd>
        {showApplyToTemplate && onApplyToProjectTemplate && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onApplyToProjectTemplate(item) }}>
            <Save className="w-4 h-4 mr-2" />
            Overwrite project template
          </DropdownMenuItem>
        )}
        {onAddToAllChannelsInTask && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddToAllChannelsInTask(item) }}>
            <Plus className="w-4 h-4 mr-2" />
            Add to all channels in this task
          </DropdownMenuItem>
        )}
        {showSaveToProjectAllChannels && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSaveToProjectAllChannels!(item) }}>
            <Save className="w-4 h-4 mr-2" />
            Save to project template (all channels)
          </DropdownMenuItem>
        )}
        {canRemoveFromTemplate && onRequestRemoveFromTemplate && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRequestRemoveFromTemplate(item) }} className="text-red-600">
            <FileMinus className="w-4 h-4 mr-2" />
            Remove from template
          </DropdownMenuItem>
        )}
        {canDelete && onRequestDelete && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRequestDelete(item) }} className="text-red-600">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        )}
        {isAiSuggestion && onDismissSuggestion && (
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onDismissSuggestion(item) }}
            className="text-red-600"
          >
            <X className="w-4 h-4 mr-2" />
            Dismiss suggestion
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  const selectionActionSlot = onAdd ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={(e) => { e.stopPropagation(); if (!isDisabled && !isAdding) onAdd(item) }}
      onPointerDown={(e) => e.stopPropagation()}
      disabled={isDisabled || isAdding}
      className="h-7 text-xs"
      aria-label="Add to task"
      data-no-dnd
      title="Add to task"
    >
      Add
    </Button>
  ) : null

  const rightSlotBeforeChevron = (
    <div className="flex items-center gap-0.5 shrink-0" ref={rowRef}>
      {menuSlot}
      {selectionActionSlot}
    </div>
  )

  return (
    <ComponentCardRow
      leftSlot={leftSlot}
      titleSlot={titleSlot}
      rightSlotBeforeChevron={rightSlotBeforeChevron}
      isExpanded={false}
      onExpandClick={() => {}}
      expandedContent={null}
      collapsedContent={availableCollapsedDescriptionContent}
      collapsedContentPaddingLeft={expandedContentPaddingLeft ?? CONTENT_LEFT_INSET_PX}
      expandedContentPaddingLeft={expandedContentPaddingLeft ?? CONTENT_LEFT_INSET_PX}
      showChevron={false}
      wrapperClassName={`group/card transition-colors ${!isEditingTitle && !isEditingInstructions ? COMPONENT_CARD_HEIGHT_CLASS : ''} ${isAdding ? 'opacity-70 pointer-events-none' : isDisabled ? 'opacity-60' : ''}`.trim()}
      wrapperRef={(el) => {
        ;(rowRef as React.MutableRefObject<HTMLDivElement | null>).current = el
      }}
      wrapperProps={{
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      }}
    />
  )
}

export function TaskContentTab({
  taskId,
  projectId,
  contentTypeId,
  languageId,
  taskTitle: taskTitleProp,
  contentTypeTitle,
  taskMetaTitle,
  taskMetaDescription,
  taskKeyword,
  taskSlug,
  projectLogoUrl,
  taskSourceUrls,
  canLoad = true,
  onChannelChange,
  onActiveFieldChange,
  taskBuildInstructions,
  isSectionExpanded = false,
  onToggleSectionExpand,
  skipInitialTaskChannelsFetch = false,
  bootstrapTaskChannels,
  accessToken = null,
  preferredChannelId = null,
}: TaskContentTabProps) {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const focusHighlightToken = useComponentEditStreamStore(
    (state) => state.focusRequest?.highlightToken ?? null,
  )
  const consumeFocusRequest = useComponentEditStreamStore((state) => state.consumeFocusRequest)
  const editStreamEntries = useComponentEditStreamStore((state) => state.streams)
  const buildPreviewEntries = useAiBuildComponentPreviewStore((state) => state.previews)
  const [streamHighlightComponentId, setStreamHighlightComponentId] = useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const aiBuildContent = useAiBuildContent()
  const queryClient = useQueryClient()
  const currentPublicUserId = useCurrentUserStore((state) => state.publicUserId)
  const currentUserName = useCurrentUserStore((state) => state.fullName)
  const setPendingTextSelection = useAiChatTextSelectionStore((state) => state.setPendingSelection)
  
  // State
  const [channels, setChannels] = useState<TaskChannel[]>([])
  const [availableChannels, setAvailableChannels] = useState<TaskChannel[]>([])
  const [isManageChannelsOpen, setIsManageChannelsOpen] = useState(false)
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null)
  const editStreamsForChannel = useMemo(
    () =>
      selectedChannelId != null
        ? Object.values(editStreamEntries).filter(
            (row) => row.taskId === taskId && row.channelId === selectedChannelId,
          )
        : [],
    [editStreamEntries, taskId, selectedChannelId],
  )
  const buildPreviewsForChannel = useMemo(
    () =>
      selectedChannelId != null
        ? Object.values(buildPreviewEntries).filter(
            (row) =>
              row.phase === "preview"
              && row.taskId === taskId
              && row.channelId === selectedChannelId
              && row.contentText.trim().length > 0,
          )
        : [],
    [buildPreviewEntries, taskId, selectedChannelId],
  )
  const [selectedBriefingTypeId, setSelectedBriefingTypeId] = useState<number | null>(null)
  const [effectiveDefaultBriefingTypeId, setEffectiveDefaultBriefingTypeId] = useState<number | null>(null)
  const [isNoBriefing, setIsNoBriefing] = useState<boolean>(false)
  const [briefingTypeOptions, setBriefingTypeOptions] = useState<ProjectChannelBriefingTypeOption[]>([])
  const [briefingDescriptionOverrides, setBriefingDescriptionOverrides] = useState<Record<number, string>>({})
  const [briefingTitleOverrides, setBriefingTitleOverrides] = useState<Record<number, string>>({})
  const [isEditingBriefingDescription, setIsEditingBriefingDescription] = useState(false)
  /** Optimistic task×channel briefing until `task-channel-bootstrap` matches after mutations. */
  const [optimisticBriefing, setOptimisticBriefing] = useState<{
    channelId: number
    explicitBriefingTypeId: number | null
    disableBriefing: boolean
  } | null>(null)
  const [inlineBriefingTitleEditId, setInlineBriefingTitleEditId] = useState<number | null>(null)
  const [inlineBriefingTitleDraft, setInlineBriefingTitleDraft] = useState('')
  const [isBriefingDropdownOpen, setIsBriefingDropdownOpen] = useState(false)
  const [isBriefingTypeRowActive, setIsBriefingTypeRowActive] = useState(false)
  const [isAddingBriefingInline, setIsAddingBriefingInline] = useState(false)
  const inlineBriefingTitleInputRef = useRef<HTMLInputElement | null>(null)
  const addBriefingInlineInputRef = useRef<HTMLInputElement | null>(null)
  const briefingDropdownTriggerRef = useRef<HTMLDivElement | null>(null)
  const briefingDropdownContentRef = useRef<HTMLDivElement | null>(null)
  const skipNextInlineBriefingBlurCommitRef = useRef(false)
  const suppressInlineBriefingTitleCommitRef = useRef(false)
  const [confirmBriefingMetaUpdate, setConfirmBriefingMetaUpdate] = useState<{
    briefingTypeId: number
    oldTitle: string
    oldDescription: string
    newTitle: string
    newDescription: string
  } | null>(null)
  // When set, a confirmation modal asks the user before regenerating AI content for this channel.
  const [confirmGenerateWithAi, setConfirmGenerateWithAi] = useState<{ channelId: number } | null>(null)
  const [isGeneratingWithAi, setIsGeneratingWithAi] = useState(false)
  const [isComponentVersionHistoryOpen, setIsComponentVersionHistoryOpen] = useState(false)
  const [componentVersionHistoryFilterId, setComponentVersionHistoryFilterId] = useState<string | null>(null)
  const [isChannelContentHistoryOpen, setIsChannelContentHistoryOpen] = useState(false)
  const [components, setComponents] = useState<TaskChannelComponent[]>([]) // Active components (top area)
  const componentsRef = useRef<TaskChannelComponent[]>([])
  componentsRef.current = components
  const lastSelectedAiTaskComponentIdRef = useRef<string | null>(null)
  const [removedComponents, setRemovedComponents] = useState<TaskChannelComponent[]>([]) // Removed from task (bottom area - first list)
  const [availableTemplates, setAvailableTemplates] = useState<TaskChannelComponent[]>([]) // Available from template (bottom area - second list)
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null)
  const [editingDescriptionComponentId, setEditingDescriptionComponentId] = useState<string | null>(null)
  const [openMenuSortableId, setOpenMenuSortableId] = useState<string | null>(null)
  const [componentOutputs, setComponentOutputs] = useState<Map<string, TaskComponentOutput>>(new Map())
  const componentOutputsRef = useRef<Map<string, TaskComponentOutput>>(new Map())
  const [requestedOutputCommentThreadIds, setRequestedOutputCommentThreadIds] = useState<Set<string>>(new Set())
  const [inFlightComponentGenerations, setInFlightComponentGenerations] = useState<Map<string, InFlightComponentGeneration>>(new Map())
  const [loadingOutputs, setLoadingOutputs] = useState<Set<number>>(new Set())
  /** Component card loading state keyed by task component id: t:<task_component_id>. */
  const [generatingComponentKeys, setGeneratingComponentKeys] = useState<Set<string>>(new Set())
  /** Main content (component 80) keeps a separate loading state (it is not a task component row). */
  const [isGeneratingMainOutput, setIsGeneratingMainOutput] = useState(false)
  const [seoData, setSeoData] = useState<EffectiveSEO | null>(null)
  const [variantSEOData, setVariantSEOData] = useState<CTTVariantSEO | null>(null)
  const hasHydratedSeoStateRef = useRef(false)
  const [isUpdatingKeywords, setIsUpdatingKeywords] = useState(false)
  const [isTogglingSEO, setIsTogglingSEO] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [taskChannelInitError, setTaskChannelInitError] = useState<string | null>(null)
  const [removingChannelIds, setRemovingChannelIds] = useState<Set<number>>(new Set())
  const [isSavingOutput, setIsSavingOutput] = useState<Map<string, boolean>>(new Map())
  const isSavingOutputRef = useRef<Map<string, boolean>>(new Map())
  const dirtyOutputKeysRef = useRef<Set<string>>(new Set())
  const pendingSaveOutputKeysRef = useRef<Set<string>>(new Set())
  const [selectedChannelKeyword, setSelectedChannelKeyword] = useState<string | null>(null)
  const [persistedTaskChannelSeoKeywords, setPersistedTaskChannelSeoKeywords] = useState<{
    primaryKeyword: string
    secondaryKeywords: string[]
  } | null>(null)
  const [taskTitle, setTaskTitle] = useState<string>(taskTitleProp || '')
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isCopyingContent, setIsCopyingContent] = useState(false)
  const activeOutputTaskComponentIdRef = useRef<string | null>(null)
  const [activeOutputTaskComponentId, setActiveOutputTaskComponentId] = useState<string | null>(null)
  const [autoExpandComponentId, setAutoExpandComponentId] = useState<number | null>(null)
  const [autoExpandTaskComponentId, setAutoExpandTaskComponentId] = useState<string | null>(null)
  const [autoExpandTaskComponentIds, setAutoExpandTaskComponentIds] = useState<Set<string>>(new Set())
  const [focusedOutputCardKey, setFocusedOutputCardKey] = useState<string | null>(null)
  const [focusedWorkspaceToolbarEditor, setFocusedWorkspaceToolbarEditor] = useState<TiptapEditor | null>(null)
  const [isFocusedNavigatorOpen, setIsFocusedNavigatorOpen] = useState(false)
  const [isFocusedSearchOpen, setIsFocusedSearchOpen] = useState(false)
  const [focusedCommentsTargetCardKey, setFocusedCommentsTargetCardKey] = useState<string | null>(null)
  const [focusedCommentsActiveThreadId, setFocusedCommentsActiveThreadId] = useState<number | null>(null)
  const [requestedFocusedOutputId, setRequestedFocusedOutputId] = useState<string | null>(null)
  const [commentNavigationTarget, setCommentNavigationTarget] = useState<CommentNavigationTarget | null>(null)
  const [focusedInlineCommentDraft, setFocusedInlineCommentDraft] = useState<OutputSelectionDraft | null>(null)
  const [focusedInlineCommentText, setFocusedInlineCommentText] = useState("")
  const [focusedInlinePendingParticipants, setFocusedInlinePendingParticipants] = useState<any[]>([])
  const [focusedInlineRemovedParticipants, setFocusedInlineRemovedParticipants] = useState<any[]>([])
  const [focusedShowCommentHighlights, setFocusedShowCommentHighlights] = useState(false)
  const [activeFocusedPanel, setActiveFocusedPanel] = useState<"comments" | "seo" | null>(null)
  const [commentsFilter, setCommentsFilter] = useState<"open" | "resolved" | "all">("open")
  const [focusedSearchTerm, setFocusedSearchTerm] = useState('')
  const [focusedReplaceTerm, setFocusedReplaceTerm] = useState('')
  const [focusedSearchActiveIndex, setFocusedSearchActiveIndex] = useState(0)
  const [isFocusedKeywordHighlightEnabled, setIsFocusedKeywordHighlightEnabled] = useState(true)
  const [focusedKeywordInput, setFocusedKeywordInput] = useState('')
  const [focusedInsertPosition, setFocusedInsertPosition] = useState<number | null>(null)
  const [focusedInsertTitle, setFocusedInsertTitle] = useState('')
  const [focusedInsertDescription, setFocusedInsertDescription] = useState('')
  const [isFocusedInsertSubmitting, setIsFocusedInsertSubmitting] = useState(false)
  const [aiThreads, setAiThreads] = useState<Array<{ id: string; title: string | null; last_message_at: string | null; created_at: string }>>([])
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)
  const [taskSourceUrl, setTaskSourceUrl] = useState<string>(
    Array.isArray(taskSourceUrls) ? taskSourceUrls.join('\n') : (taskSourceUrls || "")
  )
  const [isImportTemplateOpen, setIsImportTemplateOpen] = useState(false)
  const [isCreateBriefingOpen, setIsCreateBriefingOpen] = useState(false)
  const [createBriefingTitle, setCreateBriefingTitle] = useState('')
  const [createBriefingDescription, setCreateBriefingDescription] = useState('')
  const [isCreatingBriefing, setIsCreatingBriefing] = useState(false)
  const [isAddComponentDropdownOpen, setIsAddComponentDropdownOpen] = useState(false)
  const [addComponentSearchQuery, setAddComponentSearchQuery] = useState('')
  const [addComponentDropdownMode, setAddComponentDropdownMode] = useState<'select' | 'create'>('select')
  const [addComponentCreateInstructions, setAddComponentCreateInstructions] = useState('')
  const [selectedComponentIds, setSelectedComponentIds] = useState<Set<string>>(new Set())
  const [addComponentHighlightedIndex, setAddComponentHighlightedIndex] = useState(0)
  const [isCreatingDropdownComponent, setIsCreatingDropdownComponent] = useState(false)
  const [isBulkAddingDropdownComponents, setIsBulkAddingDropdownComponents] = useState(false)
  const [expandedTaskComponentIds, setExpandedTaskComponentIds] = useState<Set<string>>(() => new Set())
  const [confirmRemoveFromTemplate, setConfirmRemoveFromTemplate] = useState<{
    componentBriefingId: number
    scope: ComponentScope
    projectComponentId?: number | null
    keepInTask: boolean
    /** From row (g:/p:/t:); used for channel scope to set p_component_id and p_is_project_component. */
    component_key?: string
  } | null>(null)
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState<TaskChannelComponent | null>(null)
  useEffect(() => {
    componentOutputsRef.current = componentOutputs
  }, [componentOutputs])

  useEffect(() => {
    isSavingOutputRef.current = isSavingOutput
  }, [isSavingOutput])

  const markOutputDirty = useCallback((outputKey: string) => {
    dirtyOutputKeysRef.current.add(outputKey)
  }, [])

  const clearOutputDirty = useCallback((outputKey: string) => {
    dirtyOutputKeysRef.current.delete(outputKey)
    pendingSaveOutputKeysRef.current.delete(outputKey)
  }, [])

  const shouldPreserveLocalOutput = useCallback((outputKey: string) => {
    return (
      dirtyOutputKeysRef.current.has(outputKey)
      || pendingSaveOutputKeysRef.current.has(outputKey)
      || isSavingOutputRef.current.get(outputKey) === true
    )
  }, [])

  useEffect(() => {
    dirtyOutputKeysRef.current.clear()
    pendingSaveOutputKeysRef.current.clear()
    setExpandedTaskComponentIds(new Set())
    setSelectedChannelKeyword(null)
  }, [taskId, selectedChannelId])
  const materializeVirtualMainOnFirstSaveRef = useRef(false)
  const [confirmDeleteAvailable, setConfirmDeleteAvailable] = useState<TaskChannelAvailableComponent | null>(null)
  const [confirmOverwriteTemplate, setConfirmOverwriteTemplate] = useState<TaskChannelComponent | null>(null)
  /** Component key (g:/p:/t:) currently being toggled; show loading on that row only. */
  const [togglingComponentKey, setTogglingComponentKey] = useState<string | null>(null)
  /** Multi-select: set of component_key for bulk actions (selected + available lists). */
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<Set<string>>(new Set())
  /** When true, show selection checkboxes and allow bulk actions. */
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  /** Confirm bulk delete (shows count of non-deletable if any). */
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<{ keys: string[]; nonDeletableCount: number } | null>(null)
  /** Confirm bulk add to all channels. */
  const [confirmBulkAddToAllChannels, setConfirmBulkAddToAllChannels] = useState<boolean>(false)
  const [linkStatusByUrl, setLinkStatusByUrl] = useState<Record<string, LinkStatusResult>>({})
  const [expandedLinkSummaryUrls, setExpandedLinkSummaryUrls] = useState<Set<string>>(new Set())
  const [activeLinkReplaceUrl, setActiveLinkReplaceUrl] = useState<string | null>(null)
  const [linkReplaceInput, setLinkReplaceInput] = useState('')
  const [linkReplaceError, setLinkReplaceError] = useState<string | null>(null)
  const [isReplacingLink, setIsReplacingLink] = useState(false)
  const [finalComponentOutputPreviews, setFinalComponentOutputPreviews] = useState<Map<string, FinalComponentOutputPreview>>(new Map())
  const addComponentCardInputRef = useRef<HTMLInputElement | null>(null)
  const inFlightComponentGenerationsRef = useRef<Map<string, InFlightComponentGeneration>>(new Map())
  const generationQueueRef = useRef<Promise<void>>(Promise.resolve())
  const streamedAssetByAttachmentIdRef = useRef<Map<string, Record<string, unknown>>>(new Map())
  const streamedAssetByAssetKeyRef = useRef<Map<string, Record<string, unknown>>>(new Map())

  // Ensure document.body never keeps pointer-events:none after confirm dialogs close (Radix can leave it set)
  useEffect(() => {
    const anyOpen = !!(confirmRemoveFromTemplate || confirmDeleteSelected || confirmDeleteAvailable || confirmOverwriteTemplate || confirmBriefingMetaUpdate || confirmBulkDelete || confirmBulkAddToAllChannels)
    if (!anyOpen) {
      document.body.style.pointerEvents = ''
    }
    return () => {
      document.body.style.pointerEvents = ''
    }
  }, [confirmRemoveFromTemplate, confirmDeleteSelected, confirmDeleteAvailable, confirmOverwriteTemplate, confirmBriefingMetaUpdate, confirmBulkDelete, confirmBulkAddToAllChannels])

  const selectedChannelIdRef = useRef<number | null>(null)
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId
  }, [selectedChannelId])
  // True while task-channel-bootstrap is hydrating local state for a channel, so bootstrap-driven
  // state updates never trip save/generate logic (bootstrap is read-only hydration).
  const isHydratingTaskChannelRef = useRef(false)
  useEffect(() => {
    setFinalComponentOutputPreviews(new Map())
    streamedAssetByAttachmentIdRef.current = new Map()
    streamedAssetByAssetKeyRef.current = new Map()
  }, [taskId, selectedChannelId])
  
  // Do NOT set autoExpandComponentId from URL on initial load (prevents auto expand/scroll on page load).
  // Only auto-expand when explicitly set (e.g. after user creates a component via onComponentAdded callback).

  /** Ref set to true after first paint; guards scrollIntoView/focus so they only run after user actions. */
  const didMountRef = useRef(false)
  useEffect(() => {
    didMountRef.current = true
  }, [])

  // Keep newly-added components auto-expanded only while waiting for first streamed words.
  useEffect(() => {
    if (autoExpandTaskComponentIds.size === 0) return
    setAutoExpandTaskComponentIds((prev) => {
      let changed = false
      const next = new Set(prev)
      prev.forEach((taskComponentId) => {
        const generation = inFlightComponentGenerations.get(taskComponentId)
        if (!generation) return
        const hasAnyContent = generation.previewText.trim().length > 0
        const finished = generation.status === "complete" || generation.status === "failed"
        if (hasAnyContent || finished) {
          next.delete(taskComponentId)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [autoExpandTaskComponentIds, inFlightComponentGenerations])

  // Drag and drop sensors: small distance only so drag starts on first grab; handle-only keeps inputs from starting drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  
  // Use refs to store latest values for debounced save
  const outputValuesRef = useRef<Map<string, string>>(new Map())
  const outputJsonValuesRef = useRef<Map<string, OutputContentBlock[]>>(new Map())
  const mediaInsertOutputKeysRef = useRef<Set<string>>(new Set())
  // Coalesce the heavy componentOutputs state update while the user is typing. Refs above always
  // hold the latest text/blocks (used by autosave), so it is safe to debounce the React re-render.
  const flushOutputStateFromRefs = useCallback((outputKey: string) => {
    setComponentOutputs((prev) => {
      const newMap = new Map(prev)
      const text = outputValuesRef.current.get(outputKey) ?? ''
      const nextBlocks =
        outputJsonValuesRef.current.get(outputKey)
        ?? mergeTextChangesIntoExistingBlocks(getOutputBlocks(newMap.get(outputKey) ?? null), text)
      newMap.set(
        outputKey,
        buildOutputRecord(newMap.get(outputKey), {
          content_text: text,
          content_json: nextBlocks,
          updated_at: new Date().toISOString(),
        })
      )
      return newMap
    })
  }, [])
  const debouncedFlushOutputState = useMemo(
    () => debounce((outputKey: string) => flushOutputStateFromRefs(outputKey), 140),
    [flushOutputStateFromRefs]
  )
  useEffect(() => {
    return () => {
      debouncedFlushOutputState.cancel()
    }
  }, [debouncedFlushOutputState])
  const focusedSearchPopoverRef = useRef<HTMLDivElement | null>(null)
  const focusedNavigatorPopoverRef = useRef<HTMLDivElement | null>(null)
  // Track which channels have already loaded main content (component 80) to prevent infinite loops
  const mainLoadedRef = useRef<Set<number>>(new Set())
  // Track in-flight component output loads (stable ref, not state)
  const loadingOutputsRef = useRef<Set<number>>(new Set())
  const activeInteractiveStreamIdsRef = useRef<Set<string>>(new Set())
  const briefingStreamTaskComponentIdsRef = useRef<Set<string>>(new Set())
  const linkStatusCacheRef = useRef<Map<string, LinkStatusResult>>(new Map())
  const suppressFocusOutputsUrlRestoreRef = useRef(false)
  const wasFocusedAllOutputsRef = useRef(false)

  const markGeneratingByTaskComponentId = useCallback((taskComponentId: string, componentType: string) => {
    const key = getGeneratingKeyFromTaskComponentId(taskComponentId)
    setGeneratingComponentKeys((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    console.log('[TaskContentTab] generation started', {
      componentType,
      taskComponentId,
      generatingKey: key,
      generatingStateSet: true,
    })
  }, [])

  const expandAddedTaskComponent = useCallback((taskComponentId: string) => {
    setAutoExpandTaskComponentId(taskComponentId)
    setAutoExpandTaskComponentIds((prev) => {
      const next = new Set(prev)
      next.add(taskComponentId)
      return next
    })
    // Persist expansion by stable task_component_id so AI refetch/stream does not collapse the card.
    setExpandedTaskComponentIds((prev) => {
      if (prev.has(taskComponentId)) return prev
      const next = new Set(prev)
      next.add(taskComponentId)
      return next
    })
  }, [])

  const handleExpandedTaskComponentChange = useCallback((taskComponentId: string, expanded: boolean) => {
    setExpandedTaskComponentIds((prev) => {
      const has = prev.has(taskComponentId)
      if (expanded === has) return prev
      const next = new Set(prev)
      if (expanded) next.add(taskComponentId)
      else next.delete(taskComponentId)
      return next
    })
  }, [])

  // Once a card has consumed its pending auto-expand, drop the flag so it never re-forces
  // the card open (which previously blocked the user from collapsing it until reload).
  const handleAutoExpandConsumed = useCallback((taskComponentId: string) => {
    setAutoExpandTaskComponentId((prev) => (prev === taskComponentId ? null : prev))
    setAutoExpandTaskComponentIds((prev) => {
      if (!prev.has(taskComponentId)) return prev
      const next = new Set(prev)
      next.delete(taskComponentId)
      return next
    })
  }, [])

  useEffect(() => {
    inFlightComponentGenerationsRef.current = inFlightComponentGenerations
  }, [inFlightComponentGenerations])

  const startInteractiveComponentGenerationStream = useCallback(
    async (
      taskComponentId: string,
      source: string,
      streamOptions?: string | InteractiveGenerationStreamOptions | null,
    ) => {
      if (!selectedChannelId) return
      if (activeInteractiveStreamIdsRef.current.has(taskComponentId)) {
        console.debug("[TaskContentTab] skip duplicate interactive stream", { taskComponentId, source })
        return
      }

      const { message, displayMessage, componentLabel, autoRun = false } =
        normalizeInteractiveGenerationStreamOptions(streamOptions)
      const trimmedMessage = message?.trim() ? message.trim() : null
      const componentRow = componentsRef.current.find((row) => row.task_component_id === taskComponentId)
      const resolvedComponentLabel =
        componentLabel?.trim()
        || componentRow?.custom_title
        || componentRow?.title
        || null
      const channelTitle =
        channels.find((channel) => channel.channel_id === selectedChannelId)?.name ?? null
      const outputKey = getOutputMapKeyFromTaskComponentId(taskComponentId)
      const buildDisplayPayload =
        resolvedComponentLabel && taskId && selectedChannelId
          ? buildBuildComponentUserMessageDisplay({
              taskId,
              channelId: selectedChannelId,
              componentId: taskComponentId,
              componentTitle: resolvedComponentLabel,
              channelName: channelTitle,
              taskTitle: taskTitle?.trim() || `Task ${taskId}`,
              taskComponentOutputId:
                componentOutputsRef.current.get(outputKey)?.task_component_output_id ?? null,
            })
          : null
      const resolvedDisplayMessage =
        displayMessage?.trim()
        || buildDisplayPayload?.displayMessage
        || null

      activeInteractiveStreamIdsRef.current.add(taskComponentId)
      const generatingKey = getGeneratingKeyFromTaskComponentId(taskComponentId)
      let streamedText = ""
      let finalMessageId: string | null = null
      let hasTemporaryBlockPreview = false
      let isFinalComponentOutputApplied = false
      let hasStreamContentStarted = false
      const markStreamContentStarted = () => {
        if (hasStreamContentStarted) return
        hasStreamContentStarted = true
        setGeneratingComponentKeys((prev) => {
          if (!prev.has(generatingKey)) return prev
          const next = new Set(prev)
          next.delete(generatingKey)
          return next
        })
      }
      const applyPreviewBlocks = (nextBlocks: OutputContentBlock[], nextText?: string) => {
        const textValue = typeof nextText === "string" ? nextText : contentBlocksToPlainText(nextBlocks)
        if (nextBlocks.length > 0 || textValue.trim().length > 0) {
          markStreamContentStarted()
        }
        outputValuesRef.current.set(outputKey, textValue)
        outputJsonValuesRef.current.set(outputKey, nextBlocks)
        setInFlightComponentGenerations((prev) => {
          const next = new Map(prev)
          next.set(taskComponentId, {
            taskComponentId,
            status: "generating",
            previewText: textValue,
            previewBlocks: nextBlocks,
            updatedAt: new Date().toISOString(),
          })
          return next
        })
        setComponentOutputs((prev) => {
          const next = new Map(prev)
          next.set(
            outputKey,
            buildOutputRecord(next.get(outputKey), {
              content: nextBlocks,
              content_json: nextBlocks,
              resolved_content_json: nextBlocks,
              content_text: textValue,
              updated_at: new Date().toISOString(),
            })
          )
          return next
        })
      }
      const applyStreamingTextPreview = (nextText: string) => {
        if (!nextText.trim()) return
        applyPreviewBlocks(buildStreamingPreviewBlocks(nextText), nextText)
      }
      const streamSafetyTimeout = setTimeout(() => {
        if (!activeInteractiveStreamIdsRef.current.has(taskComponentId)) return
        console.error("[TaskContentTab] stream timed out", { taskComponentId, source })
        setInFlightComponentGenerations((prev) => {
          const next = new Map(prev)
          const currentText = next.get(taskComponentId)?.previewText ?? streamedText
          next.set(taskComponentId, {
            taskComponentId,
            status: "failed",
            previewText: currentText,
            previewBlocks: next.get(taskComponentId)?.previewBlocks ?? null,
            updatedAt: new Date().toISOString(),
          })
          return next
        })
        setGeneratingComponentKeys((prev) => {
          const next = new Set(prev)
          next.delete(generatingKey)
          return next
        })
        setComponents((prev) =>
          prev.map((row) => (
            row.task_component_id === taskComponentId
              ? { ...row, generationStatus: "error" }
              : row
          ))
        )
        activeInteractiveStreamIdsRef.current.delete(taskComponentId)
        briefingStreamTaskComponentIdsRef.current.delete(taskComponentId)
      }, 60_000)

      console.debug("[TaskContentTab] direct ai-chat stream start", { taskComponentId, source, channelId: selectedChannelId })
      console.log("[stream-start] taskComponentId", taskComponentId)
      markGeneratingByTaskComponentId(taskComponentId, "interactive_component_add_stream")
      setComponents((prev) =>
        prev.map((row) => (
          row.task_component_id === taskComponentId
            ? { ...row, generationStatus: "generating" }
            : row
        ))
      )
      setInFlightComponentGenerations((prev) => {
        const next = new Map(prev)
        next.set(taskComponentId, {
          taskComponentId,
          status: "generating",
          previewText: "",
          previewBlocks: [],
          updatedAt: new Date().toISOString(),
        })
        return next
      })

      // Local preview should win while stream is active.
      outputValuesRef.current.set(outputKey, "")
      outputJsonValuesRef.current.set(outputKey, [])
      setComponentOutputs((prev) => {
        const next = new Map(prev)
        next.set(
          outputKey,
          buildOutputRecord(next.get(outputKey), {
            content_text: "",
            content_json: [],
            updated_at: new Date().toISOString(),
          })
        )
        return next
      })

      try {
        const { ensureAiThread } = await import("../../../features/ai-chat/ai-utils")
        const threadId = await ensureAiThread({ taskId, channelId: selectedChannelId })
        const existingOutputIdRaw =
          componentOutputsRef.current.get(outputKey)?.task_component_output_id ?? null
        // Only a real task_component_outputs.id UUID may be sent as a write target.
        const existingOutputId = isRealTaskComponentOutputId(existingOutputIdRaw)
          ? existingOutputIdRaw
          : null

        if (trimmedMessage && resolvedDisplayMessage) {
          const userMessageContentJson = buildDisplayPayload
            ? {
                ...buildDisplayPayload.contentJson,
                internal_message: trimmedMessage,
              }
            : {
                display_message: resolvedDisplayMessage,
                internal_message: trimmedMessage,
              }
          dispatchAiChatOptimisticUserMessage({
            threadId,
            displayMessage: resolvedDisplayMessage,
            internalMessage: trimmedMessage,
            contentJson: userMessageContentJson,
          })
        }

        const aiChatPayload = {
          thread_id: threadId,
          message: trimmedMessage,
          ...(resolvedDisplayMessage ? { display_message: resolvedDisplayMessage } : {}),
          ...(buildDisplayPayload
            ? {
                content_json: {
                  ...buildDisplayPayload.contentJson,
                  internal_message: trimmedMessage,
                },
                tagged_task_component_refs: buildDisplayPayload.taggedTaskComponentRefs,
                tagged_task_ids: [taskId],
                context_source: "component_action",
              }
            : {}),
          attachments: [],
          active_channel_id: selectedChannelId,
          channel_id: selectedChannelId,
          task_id: taskId,
          mode: "build_component" as const,
          component_id: taskComponentId,
          ...(existingOutputId ? { task_component_output_id: existingOutputId } : {}),
          selected_context_type: "component_output" as const,
          ...(resolvedComponentLabel ? { selected_component_label: resolvedComponentLabel } : {}),
          auto_run: autoRun,
          stream: true,
        }
        console.debug("[TaskContentTab] ai-chat payload", aiChatPayload)
        const response = await invokeEdgeFunctionFetch({
          supabase,
          url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`,
          debugLabel: "ai-chat",
          init: {
            method: "POST",
            body: JSON.stringify(aiChatPayload),
          },
          headers: {
            "Content-Type": "application/json",
          },
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || "Interactive generation failed")
        }

        if (trimmedMessage && buildDisplayPayload && resolvedDisplayMessage) {
          await persistUserMessageMentionMetadata({
            threadId,
            content: resolvedDisplayMessage,
            contentJson: {
              ...buildDisplayPayload.contentJson,
              internal_message: trimmedMessage,
            },
          }).catch((persistError) => {
            console.warn("[TaskContentTab] failed to persist build display metadata", persistError)
          })
        }

        if (response.body) {
          const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
          const streamResult = await consumeTextStream(response, {
            onTextChunk: (chunk) => {
              streamedText += chunk
              console.debug("[TaskContentTab] stream chunk", { taskComponentId, chunkLength: chunk.length, totalLength: streamedText.length })
              console.log("[stream-chunk] taskComponentId", taskComponentId)
              console.log("[bulk-add] stream chunk id", taskComponentId)
              if (briefingStreamTaskComponentIdsRef.current.has(taskComponentId)) {
                console.log("[briefing] stream event", taskComponentId)
              }
              if (isFinalComponentOutputApplied) {
                return
              }
              if (hasTemporaryBlockPreview) {
                const currentBlocks = outputJsonValuesRef.current.get(outputKey) ?? []
                const nextBlocks = appendTextToOutputBlocks(currentBlocks, chunk)
                applyPreviewBlocks(nextBlocks, streamedText)
                return
              }
              applyStreamingTextPreview(streamedText)
            },
            onAssetEvent: (event: AiChatAssetEvent) => {
              const payload = event as Record<string, unknown>
              const attachmentId = typeof payload.attachment_id === "string" ? payload.attachment_id : null
              const assetKey = typeof payload.asset_key === "string" ? payload.asset_key : null
              if (attachmentId) streamedAssetByAttachmentIdRef.current.set(attachmentId, payload)
              if (assetKey) streamedAssetByAssetKeyRef.current.set(assetKey, payload)
              const outputIdFromPayload =
                typeof payload.task_component_output_id === "string"
                  ? payload.task_component_output_id
                  : payload.attachment && typeof payload.attachment === "object"
                    ? (() => {
                        const metadata = (payload.attachment as Record<string, unknown>).metadata
                        return metadata && typeof metadata === "object" && typeof (metadata as Record<string, unknown>).task_component_output_id === "string"
                          ? ((metadata as Record<string, unknown>).task_component_output_id as string)
                          : null
                      })()
                    : null
              const assetBlock: OutputContentBlock = {
                type: "attachment",
                attachment_id: attachmentId ?? "",
                width_pct: Number.isFinite(Number(payload.width_pct)) ? Math.max(20, Math.min(100, Number(payload.width_pct))) : 100,
                attachment: normalizeTaskComponentOutputAttachments([payload.attachment])[0] ?? null,
                missing_attachment: false,
                signed_url: typeof payload.signed_url === "string" ? payload.signed_url : null,
                file_path: typeof payload.file_path === "string" ? payload.file_path : null,
                mime_type: typeof payload.mime_type === "string" ? payload.mime_type : null,
                media_type: typeof payload.media_type === "string" ? payload.media_type : null,
                alt_text: typeof payload.alt_text === "string" ? payload.alt_text : null,
                caption: typeof payload.caption === "string" ? payload.caption : null,
              }
              if (!assetBlock.attachment_id) return
              if (isFinalComponentOutputApplied) return
              hasTemporaryBlockPreview = true
              const currentBlocks = outputJsonValuesRef.current.get(outputKey) ?? []
              const nextBlocks = [...currentBlocks, assetBlock]
              applyPreviewBlocks(nextBlocks)
              setComponentOutputs((prev) => {
                const next = new Map(prev)
                next.set(
                  outputKey,
                  buildOutputRecord(next.get(outputKey), {
                    content: nextBlocks,
                    content_json: nextBlocks,
                    resolved_content_json: nextBlocks,
                    task_component_output_id: outputIdFromPayload ?? null,
                    attachments: normalizeTaskComponentOutputAttachments([payload.attachment]),
                    updated_at: new Date().toISOString(),
                  })
                )
                return next
              })
            },
            onComponentOutputEvent: (event: AiChatComponentOutputEvent) => {
              const payload = event as Record<string, unknown>
              const payloadTaskComponentId =
                typeof payload.component_id === "string"
                  ? payload.component_id
                  : typeof payload.task_component_id === "string"
                    ? payload.task_component_id
                    : null
              if (payloadTaskComponentId && payloadTaskComponentId !== taskComponentId) return
              const baseBlocks = normalizeOutputContentJson(payload.content_json) ?? []
              console.log("[final event block order]", baseBlocks.map((block) => block.type))
              const cachedAssets = [
                ...Array.from(streamedAssetByAttachmentIdRef.current.values()),
                ...Array.from(streamedAssetByAssetKeyRef.current.values()),
              ]
              const finalBlocks = hydrateBlocksFromAssets(baseBlocks, payload.assets, cachedAssets)
              console.log("[hydrated final block order]", finalBlocks.map((block) => block.type))
              if (finalBlocks.length === 0) return
              isFinalComponentOutputApplied = true
              hasTemporaryBlockPreview = false
              applyPreviewBlocks(finalBlocks)
              setFinalComponentOutputPreviews((prev) => {
                const next = new Map(prev)
                next.set(taskComponentId, {
                  taskComponentId,
                  taskComponentOutputId:
                    typeof payload.task_component_output_id === "string"
                      ? payload.task_component_output_id
                      : null,
                  blocks: finalBlocks,
                  updatedAt: new Date().toISOString(),
                  source: "final-component-output-event",
                })
                return next
              })
              setInFlightComponentGenerations((prev) => {
                const next = new Map(prev)
                next.set(taskComponentId, {
                  taskComponentId,
                  status: "complete",
                  previewText: contentBlocksToPlainText(finalBlocks),
                  previewBlocks: finalBlocks,
                  updatedAt: new Date().toISOString(),
                })
                return next
              })
              setComponentOutputs((prev) => {
                const next = new Map(prev)
                next.set(
                  outputKey,
                  buildOutputRecord(next.get(outputKey), {
                    content: finalBlocks,
                    content_json: finalBlocks,
                    resolved_content_json: finalBlocks,
                    content_text: contentBlocksToPlainText(finalBlocks),
                    task_component_output_id:
                      typeof payload.task_component_output_id === "string"
                        ? payload.task_component_output_id
                        : null,
                    attachments: normalizeTaskComponentOutputAttachments(
                      finalBlocks
                        .filter((block): block is Extract<OutputContentBlock, { type: "attachment" }> => block.type === "attachment")
                        .map((block) => block.attachment)
                        .filter((row): row is TaskComponentOutputAttachment => !!row)
                    ),
                    updated_at: new Date().toISOString(),
                  })
                )
                return next
              })
            },
          })
          finalMessageId = streamResult.terminal?.messageId ?? null

          const rawTrimmed = streamResult.rawText.trimStart()
          const rawLooksLikeJson = rawTrimmed.startsWith("{") || rawTrimmed.startsWith("[")
          if (contentType.includes("application/json") && rawLooksLikeJson) {
            const parsed = JSON.parse(streamResult.rawText || "{}")
            const parsedContent = typeof parsed?.message?.content === "string" ? parsed.message.content : streamedText
            streamedText = parsedContent
            finalMessageId = typeof parsed?.message?.id === "string" ? parsed.message.id : finalMessageId
          } else {
            streamedText = streamResult.fullText
          }
        } else {
          const data = await response.json().catch(() => null)
          streamedText = typeof data?.message?.content === "string" ? data.message.content : streamedText
          finalMessageId = typeof data?.message?.id === "string" ? data.message.id : finalMessageId
        }

        if (!isFinalComponentOutputApplied) {
          applyPreviewBlocks(
            hydrateOutputBlocksFromContentText(
              streamedText,
              componentRow?.custom_title ?? componentRow?.title ?? null,
            ),
            streamedText,
          )
        }
        setInFlightComponentGenerations((prev) => {
          const next = new Map(prev)
          const finalPreviewBlocks = isFinalComponentOutputApplied ? (outputJsonValuesRef.current.get(outputKey) ?? null) : null
          next.set(taskComponentId, {
            taskComponentId,
            status: "complete",
            previewText: finalPreviewBlocks ? contentBlocksToPlainText(finalPreviewBlocks) : streamedText,
            previewBlocks: finalPreviewBlocks ?? hydrateOutputBlocksFromContentText(
              streamedText,
              componentRow?.custom_title ?? componentRow?.title ?? null,
            ),
            updatedAt: new Date().toISOString(),
          })
          return next
        })
        setGeneratingComponentKeys((prev) => {
          const next = new Set(prev)
          next.delete(generatingKey)
          return next
        })
        setComponents((prev) =>
          prev.map((row) => (
            row.task_component_id === taskComponentId
              ? { ...row, generationStatus: "completed" }
              : row
          ))
        )
        console.log("[stream-complete] taskComponentId", taskComponentId)
        console.debug("[TaskContentTab] stream complete", { taskComponentId, finalLength: streamedText.length, finalMessageId })
      } catch (error: any) {
        console.error("[TaskContentTab] interactive component stream failed", { taskComponentId, source, error })
        console.log("[stream-error] taskComponentId", taskComponentId)
        setInFlightComponentGenerations((prev) => {
          const next = new Map(prev)
          const currentText = next.get(taskComponentId)?.previewText ?? streamedText
          next.set(taskComponentId, {
            taskComponentId,
            status: "failed",
            previewText: currentText,
            previewBlocks: next.get(taskComponentId)?.previewBlocks ?? null,
            updatedAt: new Date().toISOString(),
          })
          return next
        })
        setGeneratingComponentKeys((prev) => {
          const next = new Set(prev)
          next.delete(generatingKey)
          return next
        })
        setComponents((prev) =>
          prev.map((row) => (
            row.task_component_id === taskComponentId
              ? { ...row, generationStatus: "error" }
              : row
          ))
        )
      } finally {
        clearTimeout(streamSafetyTimeout)
        activeInteractiveStreamIdsRef.current.delete(taskComponentId)
        briefingStreamTaskComponentIdsRef.current.delete(taskComponentId)
      }
    },
    [channels, markGeneratingByTaskComponentId, selectedChannelId, supabase, taskId]
  )

  const startNewComponentGenerationLifecycle = useCallback(
    (
      taskComponentId: string,
      source: string,
      generationOptions: string | InteractiveGenerationStreamOptions | null,
    ): Promise<void> => {
      const existing = inFlightComponentGenerationsRef.current.get(taskComponentId)
      if (activeInteractiveStreamIdsRef.current.has(taskComponentId) || existing?.status === "generating") {
        console.debug("[TaskContentTab] skip duplicate lifecycle start", { taskComponentId, source })
        return Promise.resolve()
      }
      console.log("[render] component task_component_id", taskComponentId)
      console.log("[bulk-add] stream start id", taskComponentId)
      expandAddedTaskComponent(taskComponentId)
      return startInteractiveComponentGenerationStream(taskComponentId, source, generationOptions)
    },
    [expandAddedTaskComponent, startInteractiveComponentGenerationStream],
  )
  
  // Debounced save for component outputs - uses refs to always get latest value
  const debouncedSaveOutput = useMemo(
    () => debounce(async (target: OutputSaveTarget) => {
      if (!selectedChannelId || !taskId) return
      if (mediaInsertOutputKeysRef.current.has(target.outputKey)) return

      pendingSaveOutputKeysRef.current.add(target.outputKey)
      
      // Get the latest value from ref
      const text = outputValuesRef.current.get(target.outputKey) || ''
      const existingOutput = componentOutputsRef.current.get(target.outputKey)
      const existingBlocks = getOutputBlocks(existingOutput ?? null)
      const blocks = outputJsonValuesRef.current.get(target.outputKey)
        ?? mergeTextChangesIntoExistingBlocks(existingBlocks, text)
      const sanitizedBlocks = sanitizeBlocksForSave(blocks)
      const previousBlocksForGuard = outputJsonValuesRef.current.get(target.outputKey) ?? existingBlocks
      const plainText = contentBlocksToPlainText(blocks)
      const isEmptyContent = isMeaningfullyEmptyHtml(text)
      const hasBlocks = blocks.length > 0
      
      setIsSavingOutput(prev => new Map(prev).set(target.outputKey, true))
      
      try {
        await ensureManualComponentEditChannelSnapshot({
          taskId,
          channelId: selectedChannelId,
          componentTitle: resolveComponentTitleForSaveTarget(target, componentsRef.current),
        })

        let outputId = existingOutput?.task_component_output_id ?? null
        if (!outputId) {
          if (isEmptyContent && !hasBlocks) {
            setComponentOutputs(prev => {
              const newMap = new Map(prev)
              newMap.delete(target.outputKey)
              return newMap
            })
            return
          }
          const ensurePayload = target.mode === 'task'
            ? {
                task_id: taskId,
                channel_id: selectedChannelId,
                task_component_id: target.taskComponentId,
                content_text: plainText,
                content_json: sanitizedBlocks,
                updated_at: new Date().toISOString(),
              }
            : {
                task_id: taskId,
                channel_id: selectedChannelId,
                briefing_component_id: target.briefingComponentId,
                content_text: plainText,
                content_json: sanitizedBlocks,
                updated_at: new Date().toISOString(),
              }
          const { data: ensured, error: ensureError } = await supabase
            .from('task_component_outputs')
            .upsert(ensurePayload, {
              onConflict: target.mode === 'task' ? 'task_component_id' : 'task_id,channel_id,briefing_component_id'
            })
            .select('id')
            .single()
          if (ensureError) throw ensureError
          outputId = typeof ensured?.id === "string" ? ensured.id : null
        }

        if (outputId) {
          const saveAllowed = await saveTaskComponentOutputContentWithGuard({
            supabase,
            outputId,
            outputKey: target.outputKey,
            previousBlocks: previousBlocksForGuard,
            nextBlocks: blocks,
            contentText: plainText,
          })
          if (!saveAllowed) return
        }

        // Update local state
        setComponentOutputs(prev => {
          const newMap = new Map(prev)
          newMap.set(
            target.outputKey,
            buildOutputRecord(newMap.get(target.outputKey), {
              task_component_output_id: outputId ?? newMap.get(target.outputKey)?.task_component_output_id ?? null,
              content_text: plainText,
              content_json: blocks,
              updated_at: new Date().toISOString(),
            })
          )
          return newMap
        })
        clearOutputDirty(target.outputKey)
      } catch (err: any) {
        console.error('Failed to save component output:', err)
        toast({
          title: 'Failed to save',
          description: err.message,
          variant: 'destructive'
        })
      } finally {
        pendingSaveOutputKeysRef.current.delete(target.outputKey)
        setIsSavingOutput(prev => {
          const newMap = new Map(prev)
          newMap.delete(target.outputKey)
          return newMap
        })
      }
    }, 1000),
    [supabase, taskId, selectedChannelId, clearOutputDirty]
  )
  
  // Fetch task channels
  const fetchTaskChannels = useCallback(async (signal?: AbortSignal): Promise<TaskChannel[]> => {
    try {
      const { data, error } = await supabase
        .from('task_channels')
        .select(`
          channel_id,
          channels!inner(id, name)
        `)
        .eq('task_id', taskId)
        .abortSignal(signal as any)
      
      if (error) throw error
      
      const taskChannels = (data || []).map((tc: any) => ({
        channel_id: tc.channel_id,
        name: tc.channels.name
      })).sort((a, b) => a.name.localeCompare(b.name))
      
      setChannels(taskChannels)
      setTaskChannelInitError(null)
      
      // Auto-select first channel if available and none selected
      if (taskChannels.length > 0 && !selectedChannelIdRef.current) {
        const firstChannelId = taskChannels[0].channel_id
        setSelectedChannelId(firstChannelId)
        onChannelChange?.(firstChannelId)
      }
      return taskChannels
    } catch (err: any) {
      if (err?.name === 'AbortError' || /abort/i.test(String(err?.message || ''))) return []
      console.error('Failed to fetch task channels:', err)
      setTaskChannelInitError(err?.message || 'Could not load channels for this task.')
      toast({
        title: 'Error loading channels',
        description: err.message,
        variant: 'destructive'
      })
      throw err
    }
  }, [supabase, taskId, onChannelChange])
  
  // Fetch available channels for adding (optional `taskChannelsOverride` avoids stale `channels` when called in the same tick as setState, e.g. after remove)
  const fetchAvailableChannels = useCallback(async (signal?: AbortSignal, taskChannelsOverride?: TaskChannel[]) => {
    if (!projectId || !contentTypeId) return
    
    try {
      // First try project-specific channels
      let channelsData: any[] = []
      
      const { data: projectChannels, error: projectError } = await supabase
        .from('project_content_types_channels')
        .select(`
          channel_id,
          position,
          channels!inner(id, name)
        `)
        .eq('project_id', projectId)
        .eq('content_type_id', contentTypeId)
        .order('position', { ascending: true })
        .abortSignal(signal as any)
      
      if (!projectError && projectChannels) {
        channelsData = projectChannels.map((pctc: any) => ({
          channel_id: pctc.channel_id,
          name: pctc.channels.name,
          position: pctc.position
        })).sort((a, b) => {
          // First sort by position, then by name
          const posA = a.position ?? 999
          const posB = b.position ?? 999
          if (posA !== posB) return posA - posB
          return a.name.localeCompare(b.name)
        })
      }
      
      // Fallback to global channels if no project channels
      if (channelsData.length === 0) {
        const { data: globalChannels, error: globalError } = await supabase
          .from('content_types_channels')
          .select(`
            channel_id,
            position,
            channels!inner(id, name)
          `)
          .eq('content_type_id', contentTypeId)
          .order('position', { ascending: true })
          .abortSignal(signal as any)
        
        if (globalError) throw globalError
        
        channelsData = (globalChannels || []).map((ctc: any) => ({
          channel_id: ctc.channel_id,
          name: ctc.channels.name,
          position: ctc.position
        })).sort((a, b) => {
          // First sort by position, then by name
          const posA = a.position ?? 999
          const posB = b.position ?? 999
          if (posA !== posB) return posA - posB
          return a.name.localeCompare(b.name)
        })
      }
      
      // Filter out already added channels (use override when state has not committed yet)
      const listForFilter = taskChannelsOverride ?? channels
      const existingIds = new Set(listForFilter.map((c) => c.channel_id))
      setAvailableChannels(channelsData.filter((c: TaskChannel) => !existingIds.has(c.channel_id)))
    } catch (err: any) {
      if (err?.name === 'AbortError' || /abort/i.test(String(err?.message || ''))) return
      console.error('Failed to fetch available channels:', err)
    }
  }, [supabase, projectId, contentTypeId, channels])
  
  // Fetch briefing types for project × content type × channel (with channel default info)
  const fetchChannelBriefingTypes = useCallback(async (): Promise<number | null> => {
    if (!projectId || !contentTypeId || !selectedChannelId) {
      setBriefingTypeOptions([])
      setEffectiveDefaultBriefingTypeId(null)
      return null
    }
    
    try {
      const { data, error } = await supabase.rpc('project_channel_briefing_types', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: selectedChannelId
      })
      
      if (error) throw error
      
      const { options, effectiveDefaultBriefingTypeId: effectiveId } = mapProjectChannelBriefingTypeOptions(
        (data || []) as any[]
      )
      
      setBriefingTypeOptions(options)
      setEffectiveDefaultBriefingTypeId(effectiveId)
      return effectiveId
    } catch (err: any) {
      console.error('Failed to fetch channel briefing types:', err)
      setBriefingTypeOptions([])
      setEffectiveDefaultBriefingTypeId(null)
      return null
    }
  }, [supabase, projectId, contentTypeId, selectedChannelId])

  // task-channel-bootstrap authenticates via the supabase client, so it must NOT be gated on a
  // (frequently absent) accessToken prop. Gate only on a loadable task + selected channel so the
  // call fires on initial content-tab load and on every channel change.
  const channelBootstrapEnabled =
    canLoad && !!taskId && !!selectedChannelId

  const channelBootstrapQuery = useTaskChannelBootstrap(taskId, selectedChannelId ?? null, accessToken, {
    enabled: channelBootstrapEnabled,
  })
  const channelContentQuery = useTaskChannelContent(taskId, selectedChannelId ?? null, {
    enabled: channelBootstrapEnabled,
  })
  const channelBootstrapErrorMessage =
    channelContentQuery.isError
      ? channelContentQuery.error instanceof Error
        ? channelContentQuery.error.message
        : 'Could not load channel data for this task.'
      : channelBootstrapQuery.isError
        ? channelBootstrapQuery.error instanceof Error
          ? channelBootstrapQuery.error.message
          : 'Could not load channel data for this task.'
        : null
  const fallbackMainRequired =
    channelContentQuery.isSuccess
    && channelContentQuery.data?.channel_id === selectedChannelId
    && (
      channelContentQuery.data.fallback_main_required
      || mapContentComponentRowsToActive(channelContentQuery.data.components ?? []).length === 0
    )
  const recoverableOutputs = useMemo(() => {
    if (
      !channelContentQuery.data
      || channelContentQuery.data.channel_id !== selectedChannelId
    ) {
      return []
    }
    return channelContentQuery.data.recoverable_outputs ?? []
  }, [channelContentQuery.data, selectedChannelId])
  const channelSeoKeywordList = useMemo(
    () => buildTaskChannelKeywordList(variantSEOData, persistedTaskChannelSeoKeywords),
    [variantSEOData, persistedTaskChannelSeoKeywords],
  )

  useEffect(() => {
    if (channelSeoKeywordList.length === 0) {
      setSelectedChannelKeyword(null)
      return
    }
    setSelectedChannelKeyword((current) => {
      if (current && channelSeoKeywordList.includes(current)) return current
      return channelSeoKeywordList[0] ?? null
    })
  }, [channelSeoKeywordList])

  /** Template / RPCs: explicit id from bootstrap, else channel default when inheriting; null when briefing disabled. */
  const effectiveBriefingTypeId = useMemo(() => {
    if (optimisticBriefing && optimisticBriefing.channelId === selectedChannelId) {
      if (optimisticBriefing.disableBriefing) return null
      if (optimisticBriefing.explicitBriefingTypeId != null) {
        return optimisticBriefing.explicitBriefingTypeId
      }
    }
    const d = channelBootstrapQuery.data
    if (!selectedChannelId || !d || d.channel_id !== selectedChannelId) {
      return selectedBriefingTypeId ?? effectiveDefaultBriefingTypeId
    }
    const br = d.briefing
    if (!br || br.disable_briefing) return null
    if (br.briefing_type_id != null) return br.briefing_type_id
    return effectiveDefaultBriefingTypeId
  }, [
    optimisticBriefing,
    channelBootstrapQuery.data,
    selectedChannelId,
    effectiveDefaultBriefingTypeId,
    selectedBriefingTypeId,
  ])

  /** Dropdown: only an explicitly stored briefing id — never show inherited default as if it were selected. */
  const dropdownExplicitBriefingTypeId = useMemo(() => {
    if (optimisticBriefing && optimisticBriefing.channelId === selectedChannelId) {
      if (optimisticBriefing.disableBriefing) return null
      return optimisticBriefing.explicitBriefingTypeId
    }
    const d = channelBootstrapQuery.data
    if (!selectedChannelId || !d || d.channel_id !== selectedChannelId) return null
    const br = d.briefing
    if (!br || br.disable_briefing) return null
    return br.briefing_type_id ?? null
  }, [optimisticBriefing, channelBootstrapQuery.data, selectedChannelId])

  /** Single visible label for the briefing row (matches effective template, including inherit). */
  const displayBriefingRowTitle = useMemo(() => {
    const id = effectiveBriefingTypeId
    if (!id) return isNoBriefing ? 'No briefing' : 'Select briefing'
    const active = briefingTypeOptions.find((t) => t.id === id)
    return (briefingTitleOverrides[id] ?? active?.title) ?? ''
  }, [effectiveBriefingTypeId, isNoBriefing, briefingTypeOptions, briefingTitleOverrides])

  /** Drop optimistic overlay once bootstrap matches server state. */
  useEffect(() => {
    if (!optimisticBriefing || optimisticBriefing.channelId !== selectedChannelId) return
    const d = channelBootstrapQuery.data
    if (!d || d.channel_id !== selectedChannelId) return
    const br = d.briefing
    const disable = br?.disable_briefing ?? false
    const explicit = br?.briefing_type_id ?? null
    if (optimisticBriefing.disableBriefing) {
      if (disable && explicit === null) {
        setOptimisticBriefing(null)
      }
      return
    }
    if (!disable && optimisticBriefing.explicitBriefingTypeId === explicit) {
      setOptimisticBriefing(null)
    }
  }, [optimisticBriefing, selectedChannelId, channelBootstrapQuery.data])

  useEffect(() => {
    setInlineBriefingTitleEditId(null)
    setIsBriefingDropdownOpen(false)
    setIsBriefingTypeRowActive(false)
    setIsAddingBriefingInline(false)
  }, [selectedChannelId])

  useEffect(() => {
    if (!isBriefingDropdownOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (briefingDropdownTriggerRef.current?.contains(target)) return
      if (briefingDropdownContentRef.current?.contains(target)) return
      setIsBriefingDropdownOpen(false)
      setIsBriefingTypeRowActive(false)
      setIsAddingBriefingInline(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBriefingDropdownOpen(false)
        setIsBriefingTypeRowActive(false)
        setIsAddingBriefingInline(false)
        suppressInlineBriefingTitleCommitRef.current = true
        setInlineBriefingTitleEditId(null)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isBriefingDropdownOpen])

  useEffect(() => {
    if (!isBriefingDropdownOpen || !isAddingBriefingInline) return
    window.setTimeout(() => {
      addBriefingInlineInputRef.current?.focus()
    }, 0)
  }, [isBriefingDropdownOpen, isAddingBriefingInline])

  const outputCommentUsersQuery = useQuery({
    queryKey: ["output-comment-users", projectId ?? null],
    enabled: !!projectId,
    queryFn: async (): Promise<OutputCommentUserOption[]> => {
      const { data, error } = await supabase
        .from("v_project_watchers_with_user")
        .select("user_id, full_name, email, photo")
        .order("full_name", { ascending: true })
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        id: Number(row.user_id),
        full_name: row.full_name ?? `User #${row.user_id}`,
        email: row.email ?? "",
        auth_user_id: String(row.user_id),
        photo: row.photo ?? null,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
  const outputCommentUsers = outputCommentUsersQuery.data ?? []
  const { watchers: taskWatcherUsers } = useTaskWatchers(taskId)
  const defaultCommentParticipants = useMemo(() => {
    const projectWatcherById = new Map(outputCommentUsers.map((user) => [Number(user.id), user]))
    const fromTaskWatchers = taskWatcherUsers
      .map((watcher) => projectWatcherById.get(Number(watcher.watcher_user_id)) ?? {
        id: Number(watcher.watcher_user_id),
        full_name: watcher.full_name ?? `User #${watcher.watcher_user_id}`,
        email: "",
        auth_user_id: String(watcher.watcher_user_id),
        photo: watcher.photo ?? null,
      })
      .filter((user): user is OutputCommentUserOption => !!user)
    const withCreator =
      currentPublicUserId != null
        ? [
            ...fromTaskWatchers,
            projectWatcherById.get(Number(currentPublicUserId))
              ?? {
                id: Number(currentPublicUserId),
                full_name: currentUserName ?? `User #${currentPublicUserId}`,
                email: "",
                auth_user_id: String(currentPublicUserId),
                photo: null,
              },
          ]
        : fromTaskWatchers
    const deduped = new Map<number, OutputCommentUserOption>()
    for (const user of withCreator) deduped.set(Number(user.id), user)
    return Array.from(deduped.values())
  }, [outputCommentUsers, taskWatcherUsers, currentPublicUserId, currentUserName])

  const groupedBriefingTypeOptions = useMemo(
    () => splitBriefingTypeOptions(briefingTypeOptions),
    [briefingTypeOptions]
  )

  const availableList = useMemo(
    () => mapBootstrapAvailableRows(channelBootstrapQuery.data?.available_components ?? []),
    [channelBootstrapQuery.data?.available_components],
  )

  const refreshChannelBootstrap = useCallback(
    async (channelIdOverride?: number) => {
      const channelId = channelIdOverride ?? selectedChannelId
      if (!channelId) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...taskChannelContentQueryKey(taskId, channelId)] }),
        queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(taskId, channelId)] }),
      ])
    },
    [queryClient, taskId, selectedChannelId]
  )

  const refreshComponents = refreshChannelBootstrap
  const refreshAvailableComponents = refreshChannelBootstrap

  const refreshAllComponentLists = useCallback(
    async (channelIdOverride?: number) => {
      await refreshChannelBootstrap(channelIdOverride)
    },
    [refreshChannelBootstrap]
  )

  const hydrateComponentsFromGenerationPlan = useCallback((planRows: GenerationPlanRow[]) => {
    if (planRows.length === 0) return

    setComponents((prev) => {
      const next = [...prev]
      for (const row of planRows) {
        const taskComponentId = row.task_component_id
        const existingIndex = next.findIndex((component) => component.task_component_id === taskComponentId)
        const existing = existingIndex >= 0 ? next[existingIndex] : null
        const inferredKind: TaskChannelComponent["kind"] =
          row.kind === "project" || row.project_component_id != null
            ? "project"
            : row.kind === "task_ad_hoc" || (row.kind?.includes("task") ?? false)
              ? "task_ad_hoc"
              : "global"
        const mergedRow: TaskChannelComponent = {
          ...(existing ?? {
            task_component_id: taskComponentId,
            briefing_component_id: row.briefing_component_id,
            project_component_id: row.project_component_id,
            component_key: row.component_key
              ?? (row.project_component_id != null
                ? `p:${row.project_component_id}`
                : row.briefing_component_id != null
                  ? `g:${row.briefing_component_id}`
                  : `t:${taskComponentId}`),
            kind: inferredKind,
            in_current_template: true,
            template_layer: undefined,
            origin: inferredKind === "project" ? "project" : inferredKind === "global" ? "global" : "task",
            global_overridden: false,
            title: row.title ?? "",
            description: row.description ?? null,
            selected: true,
            position: row.position ?? null,
            custom_title: row.title ?? null,
            custom_description: row.description ?? null,
            project_template_title: null,
            project_template_description: null,
            purpose: null,
            guidance: null,
            suggested_word_count: null,
            subheads: null,
            is_ad_hoc: inferredKind === "task_ad_hoc",
            generationStatus: "queued",
          }),
          task_component_id: taskComponentId,
          briefing_component_id: row.briefing_component_id ?? existing?.briefing_component_id ?? null,
          project_component_id: row.project_component_id ?? existing?.project_component_id ?? null,
          component_key: row.component_key ?? existing?.component_key,
          kind: inferredKind,
          origin: inferredKind === "project" ? "project" : inferredKind === "global" ? "global" : "task",
          selected: true,
          title: row.title ?? existing?.title ?? "",
          description: row.description ?? existing?.description ?? null,
          custom_title: row.title ?? existing?.custom_title ?? existing?.title ?? null,
          custom_description: row.description ?? existing?.custom_description ?? existing?.description ?? null,
          position: row.position ?? existing?.position ?? null,
          generationStatus: "queued",
        }
        if (existingIndex >= 0) next[existingIndex] = mergedRow
        else next.push(mergedRow)
      }
      return sortTaskChannelComponentsByPosition(next.filter((row) => row.selected))
    })
    setRemovedComponents([])
    setAvailableTemplates([])
    setAutoExpandTaskComponentIds((prev) => {
      const next = new Set(prev)
      for (const row of planRows) next.add(row.task_component_id)
      return next
    })
    setExpandedTaskComponentIds((prev) => {
      const next = new Set(prev)
      for (const row of planRows) next.add(row.task_component_id)
      return next
    })
  }, [])

  const enqueueGenerationJobs = useCallback(
    async (jobs: Array<{ taskComponentId: string; generationPrompt: string | null; source: string }>) => {
      if (jobs.length === 0) return
      generationQueueRef.current = generationQueueRef.current.then(async () => {
        for (const job of jobs) {
          console.log("[queue] job start", job.taskComponentId)
          if (job.source === "available_bulk") {
            console.log("[bulk] stream start", job.taskComponentId)
          }
          if (job.source === "briefing") briefingStreamTaskComponentIdsRef.current.add(job.taskComponentId)
          await startNewComponentGenerationLifecycle(job.taskComponentId, job.source, job.generationPrompt)
          console.log("[queue] job complete", job.taskComponentId)
        }
      })
      await generationQueueRef.current
    },
    [startNewComponentGenerationLifecycle],
  )

  const runBriefingGenerationPlan = useCallback(async (channelId: number) => {
    const { data: planData, error: planError } = await supabase.rpc("generate_components_for_briefing", {
      p_task_id: taskId,
      p_channel_id: channelId,
    })
    if (planError) throw planError

    const planRows = normalizeGenerationPlanRows(planData)
    console.log("[plan] received rows", planRows.map((row) => row.task_component_id))
    if (planRows.length === 0) return

    hydrateComponentsFromGenerationPlan(planRows)
    console.log("[briefing] components to generate", planRows.map((row) => row.task_component_id))
    await enqueueGenerationJobs(
      planRows.map((row) => ({
        taskComponentId: row.task_component_id,
        generationPrompt: row.generation_prompt ?? row.description ?? null,
        source: "briefing",
      }))
    )
  }, [
    enqueueGenerationJobs,
    hydrateComponentsFromGenerationPlan,
    supabase,
    taskId,
  ])

  /** Invalidate task-channel-bootstrap for one (task, channel). */
  const invalidateTaskChannelComponents = useCallback(
    (tid: number, channelId: number) => {
      queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(tid, channelId)] })
    },
    [queryClient]
  )

  /** Invalidate task-channel-bootstrap for all channels of this task (partial key). */
  const invalidateTaskAllChannelsAvailable = useCallback(
    (tid: number) => {
      queryClient.invalidateQueries({ queryKey: ['task-channel-bootstrap', tid] })
    },
    [queryClient]
  )

  const invalidateTaskAllChannelsComponents = useCallback(
    (tid: number) => {
      queryClient.invalidateQueries({ queryKey: ['task-channel-bootstrap', tid] })
    },
    [queryClient]
  )

  /** Invalidate project template / briefing queries (v_project_briefing_types_components_resolved, project_briefing_types_components, project_ct_channel_briefing_components, etc.). */
  const invalidateProjectTemplate = useCallback(
    (pid: number) => {
      queryClient.invalidateQueries({ queryKey: ['projBriefings:components', pid] })
      queryClient.invalidateQueries({ queryKey: ['projBriefings:list', pid] })
      queryClient.invalidateQueries({ queryKey: ['availableComponents', pid] })
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:globalUsage:templates', pid] })
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', pid] })
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:globalUsage:ct', pid] })
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:componentUsage', pid] })
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey
        if (!Array.isArray(k) || k[1] !== pid) return false
        return k[0] === 'projBriefings' || k[0] === 'proj:ctch'
      } })
    },
    [queryClient]
  )

  /** Lookup from available list: component_key -> row (for in_current_template on selected/unselected cards that lack it). */
  const availableByKey = useMemo(() => {
    const list = availableList
    const map = new Map<string, { in_current_template?: boolean }>()
    for (const row of list) {
      const key = row.component_key ?? row.key ?? ''
      if (key) map.set(key, { in_current_template: row.in_current_template === true })
    }
    return map
  }, [availableList])

  /** Template title/description by component_key (for overwrite confirmation diff only; dirty indicator uses row.project_template_*). */
  const availableTemplateByKey = useMemo(() => {
    const list = availableList
    const map = new Map<string, { title: string; description: string | null }>()
    for (const row of list) {
      const key = row.component_key ?? row.key ?? ''
      if (key) map.set(key, { title: row.title ?? '', description: row.description ?? null })
    }
    return map
  }, [availableList])

  /** Normalize for dirty comparison: (v ?? '').trim().replace(/\s+/g, ' ') */
  const normalizeTemplateText = useCallback((v: string | null | undefined): string => {
    return (v ?? '').trim().replace(/\s+/g, ' ')
  }, [])

  /** Derive component_key from a selected/unselected row (tc_components_for_task_channel has no component_key; infer from origin). */
  const getComponentKeyForSelectedRow = useCallback((row: TaskChannelComponent): string => {
    if (row.origin === 'global' && row.briefing_component_id != null) return `g:${row.briefing_component_id}`
    if (row.origin === 'project' && row.project_component_id != null) return `p:${row.project_component_id}`
    if (row.is_ad_hoc === true && row.task_component_id) return `t:${row.task_component_id}`
    if (row.project_component_id != null) return `p:${row.project_component_id}`
    if (row.briefing_component_id != null) return `g:${row.briefing_component_id}`
    if (row.task_component_id) return `t:${row.task_component_id}`
    return ''
  }, [])

  /** Set of component_key that show the "unsaved to project template" warning: ad-hoc always; non ad-hoc when title/desc differ from project_template_*. */
  const dirtyTemplateKeys = useMemo(() => {
    const set = new Set<string>()
    for (const c of components) {
      const key = getComponentKeyForSelectedRow(c) ?? c.component_key ?? ''
      const isAdHoc = c.kind === 'task_ad_hoc' || c.is_ad_hoc === true
      if (isAdHoc) {
        set.add(key)
        continue
      }
      if (!key.startsWith('g:') && !key.startsWith('p:')) continue
      const currentTitle = normalizeTemplateText(c.title)
      const currentDesc = normalizeTemplateText(c.description ?? '')
      const projectTplTitle = normalizeTemplateText(c.project_template_title ?? '')
      const projectTplDesc = normalizeTemplateText(c.project_template_description ?? '')
      if (currentTitle !== projectTplTitle || currentDesc !== projectTplDesc) set.add(key)
    }
    return set
  }, [components, getComponentKeyForSelectedRow, normalizeTemplateText])

  const getSelectedCardKey = useCallback((component: TaskChannelComponent): string => {
    return component.task_component_id
      || component.component_key
      || `temp-${component.briefing_component_id ?? component.project_component_id ?? 'u'}`
  }, [])

  const getSelectedCardDomId = useCallback((cardKey: string): string => {
    const safe = cardKey.replace(/[^a-zA-Z0-9_-]/g, '-')
    return `task-content-card-${safe}`
  }, [])

  const activeChannelIdFromUrl = searchParams.get("activeChannelId")
  useEffect(() => {
    if (!activeChannelIdFromUrl) return
    const parsed = Number(activeChannelIdFromUrl)
    if (!Number.isFinite(parsed)) return
    if (!channels.some((channel) => channel.channel_id === parsed)) return
    setSelectedChannelId((prev) => {
      if (prev === parsed) return prev
      Promise.resolve().then(() => onChannelChange?.(parsed))
      return parsed
    })
  }, [activeChannelIdFromUrl, channels, onChannelChange])

  useEffect(() => {
    if (selectedChannelId == null) return
    resetTaskChannelEditSession(taskId, selectedChannelId)
  }, [taskId, selectedChannelId])

  useEffect(() => {
    if (focusHighlightToken == null) return
    const req = consumeFocusRequest()
    if (!req || req.taskId !== taskId) return
    setSelectedChannelId((prev) => {
      if (prev === req.channelId) return prev
      onChannelChange?.(req.channelId)
      return req.channelId
    })
    setStreamHighlightComponentId(req.componentId)
    window.setTimeout(() => {
      const domId = getSelectedCardDomId(req.componentId)
      document.getElementById(domId)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 300)
    const clearHighlight = window.setTimeout(() => setStreamHighlightComponentId(null), 3200)
    return () => window.clearTimeout(clearHighlight)
  }, [focusHighlightToken, taskId, consumeFocusRequest, getSelectedCardDomId, onChannelChange])
  const getFocusedOutputAnchorId = useCallback((cardKey: string): string => {
    const safe = cardKey.replace(/[^a-zA-Z0-9_-]/g, '-')
    return `focused-output-anchor-${safe}`
  }, [])

  const isFocusedOutputMode = focusedOutputCardKey != null
  const isFocusedAllOutputsMode = focusedOutputCardKey === FOCUSED_ALL_SELECTED_OUTPUTS_KEY
  const isFocusedSingleOutputMode = isFocusedOutputMode && !isFocusedAllOutputsMode
  useEffect(() => {
    if (!isFocusedAllOutputsMode) {
      setFocusedWorkspaceToolbarEditor(null)
    }
  }, [isFocusedAllOutputsMode])
  const focusedOutputOrder = useMemo(() => {
    return components.map((component) => ({
      cardKey: getSelectedCardKey(component),
      componentId: component.briefing_component_id ?? component.project_component_id ?? null,
    }))
  }, [components, getSelectedCardKey])
  const focusedOutputIndex = useMemo(() => {
    if (!focusedOutputCardKey || focusedOutputCardKey === FOCUSED_ALL_SELECTED_OUTPUTS_KEY) return -1
    return focusedOutputOrder.findIndex((entry) => entry.cardKey === focusedOutputCardKey)
  }, [focusedOutputCardKey, focusedOutputOrder])
  const focusedSelectedComponents = useMemo(() => {
    if (!focusedOutputCardKey || focusedOutputCardKey === FOCUSED_ALL_SELECTED_OUTPUTS_KEY) return components
    return components.filter((component) => getSelectedCardKey(component) === focusedOutputCardKey)
  }, [components, focusedOutputCardKey, getSelectedCardKey])
  const focusedCommentsTargetComponent = useMemo(() => {
    if (focusedSelectedComponents.length === 0) return null
    if (!focusedCommentsTargetCardKey) return focusedSelectedComponents[0]
    return focusedSelectedComponents.find((component) => getSelectedCardKey(component) === focusedCommentsTargetCardKey) ?? focusedSelectedComponents[0]
  }, [focusedSelectedComponents, focusedCommentsTargetCardKey, getSelectedCardKey])
  const createFocusedOutputCommentThreadMutation = useCreateOutputCommentThread()
  const resolveFocusedOutputCommentThreadMutation = useResolveOutputCommentThread()
  const reopenFocusedOutputCommentThreadMutation = useReopenOutputCommentThread()
  const focusedCommentsTargetOutputId = focusedCommentsTargetComponent
    ? getOutputForComponent(componentOutputs, focusedCommentsTargetComponent)?.task_component_output_id ?? null
    : null
  const focusedVisibleOutputIds = useMemo(
    () =>
      focusedSelectedComponents
        .map((component) => getOutputForComponent(componentOutputs, component)?.task_component_output_id ?? null)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    [focusedSelectedComponents, componentOutputs]
  )
  const shouldLoadFocusedAllThreads =
    isFocusedAllOutputsMode && activeFocusedPanel === "comments"
  const effectiveRequestedOutputIds = useMemo(() => {
    const merged = new Set<string>()
    requestedOutputCommentThreadIds.forEach((id) => merged.add(id))
    if (shouldLoadFocusedAllThreads) {
      focusedVisibleOutputIds.forEach((id) => merged.add(id))
    } else if (
      isFocusedOutputMode
      && focusedCommentsTargetOutputId
      && (activeFocusedPanel === "comments" || focusedShowCommentHighlights)
    ) {
      merged.add(focusedCommentsTargetOutputId)
    }
    return Array.from(merged)
  }, [
    requestedOutputCommentThreadIds,
    shouldLoadFocusedAllThreads,
    isFocusedOutputMode,
    activeFocusedPanel,
    focusedShowCommentHighlights,
    focusedVisibleOutputIds,
    focusedCommentsTargetOutputId,
  ])
  const outputCommentThreadsBatchQuery = useOutputCommentThreadsBatch(effectiveRequestedOutputIds, {
    enabled: canLoad && !!selectedChannelId,
  })
  const outputCommentThreadsByOutputId = useMemo(
    () => groupThreadsByOutputId(outputCommentThreadsBatchQuery.data ?? []),
    [outputCommentThreadsBatchQuery.data]
  )
  const ensureOutputCommentThreads = useCallback((outputId: string) => {
    setRequestedOutputCommentThreadIds((prev) => {
      if (prev.has(outputId)) return prev
      const next = new Set(prev)
      next.add(outputId)
      return next
    })
  }, [])
  const refetchOutputCommentThreads = useCallback(() => {
    void outputCommentThreadsBatchQuery.refetch()
  }, [outputCommentThreadsBatchQuery])
  const focusedBrowseThreads = useMemo(() => {
    if (isFocusedAllOutputsMode) {
      return focusedVisibleOutputIds.flatMap((outputId) => outputCommentThreadsByOutputId.get(outputId) ?? [])
    }
    if (!focusedCommentsTargetOutputId) return []
    return outputCommentThreadsByOutputId.get(focusedCommentsTargetOutputId) ?? []
  }, [isFocusedAllOutputsMode, focusedVisibleOutputIds, focusedCommentsTargetOutputId, outputCommentThreadsByOutputId])
  const filteredFocusedBrowseThreads = useMemo(() => {
    if (commentsFilter === "all") return focusedBrowseThreads
    if (commentsFilter === "resolved") return focusedBrowseThreads.filter((thread) => !!thread.resolvedAt)
    return focusedBrowseThreads.filter((thread) => !thread.resolvedAt)
  }, [focusedBrowseThreads, commentsFilter])
  const focusedActiveCommentThread = focusedBrowseThreads.find((thread) => thread.threadId === focusedCommentsActiveThreadId) ?? null
  const focusedActiveThreadMentionsQuery = useThreadMentionsBatch(
    focusedActiveCommentThread ? [focusedActiveCommentThread.threadId] : [],
    { enabled: activeFocusedPanel === "comments" && !!focusedActiveCommentThread }
  )
  const focusedActiveThreadMessages = useMemo(
    () =>
      (focusedActiveThreadMentionsQuery.data ?? []).map((row) => ({
        id: row.id,
        thread_id: row.thread_id,
        comment: row.comment ?? "",
        created_at: row.created_at,
        created_by: row.created_by,
        reply_to_id: row.reply_to_id,
        attachment: row.attachment,
        users: row.users ?? null,
      })),
    [focusedActiveThreadMentionsQuery.data]
  )

  useEffect(() => {
    if (focusedSelectedComponents.length === 0) {
      setFocusedCommentsTargetCardKey(null)
      setFocusedCommentsActiveThreadId(null)
      setFocusedInlineCommentDraft(null)
      return
    }
    if (!focusedCommentsTargetCardKey) {
      setFocusedCommentsTargetCardKey(getSelectedCardKey(focusedSelectedComponents[0]))
    }
  }, [focusedSelectedComponents, focusedCommentsTargetCardKey, getSelectedCardKey])
  useEffect(() => {
    if (filteredFocusedBrowseThreads.length === 0) {
      if (focusedCommentsActiveThreadId != null) setFocusedCommentsActiveThreadId(null)
      return
    }
    if (focusedCommentsActiveThreadId == null) {
      setFocusedCommentsActiveThreadId(filteredFocusedBrowseThreads[0].threadId)
      return
    }
    if (!filteredFocusedBrowseThreads.some((thread) => thread.threadId === focusedCommentsActiveThreadId)) {
      setFocusedCommentsActiveThreadId(filteredFocusedBrowseThreads[0].threadId)
    }
  }, [filteredFocusedBrowseThreads, focusedCommentsActiveThreadId])

  const getResolvedOutputForComponent = useCallback((component: TaskChannelComponent): TaskComponentOutput | null => {
    const taskComponentId = component.task_component_id
    const editStream = taskComponentId
      ? editStreamsForChannel.find((stream) => stream.componentId === taskComponentId)
      : undefined

    if (editStream && isLiveComponentEditStream(editStream) && (editStream.hasPreviewContent || editStream.isStreaming || editStream.phase === "started")) {
      const persisted = getOutputForComponent(componentOutputs, component)
      const streamBlocks = buildEditStreamOptimisticOutputBlocks(editStream)
      const mergedText = buildEditStreamMergedPlainText(editStream)
      return buildOutputRecord(persisted, {
        content: streamBlocks,
        content_json: streamBlocks,
        resolved_content_json: streamBlocks,
        content_text: mergedText,
        updated_at: editStream.updatedAt,
      })
    }

    // Live orchestrated-build preview — overlay only; never write into canonical cache.
    const buildPreview = taskComponentId
      ? buildPreviewsForChannel.find((row) => row.componentId === taskComponentId)
      : undefined
    if (buildPreview) {
      const persisted = getOutputForComponent(componentOutputs, component)
      const previewText = buildPreview.contentText
      const streamBlocks =
        Array.isArray(buildPreview.contentJson) && buildPreview.contentJson.length > 0
          ? (buildPreview.contentJson as OutputContentBlock[])
          : buildStreamingPreviewBlocks(previewText)
      return buildOutputRecord(persisted, {
        content: streamBlocks,
        content_json: streamBlocks,
        resolved_content_json: streamBlocks,
        content_text: previewText,
        updated_at: buildPreview.updatedAt,
      })
    }

    const streamedGeneration = taskComponentId
      ? inFlightComponentGenerations.get(taskComponentId)
      : undefined
    if (streamedGeneration?.status === "generating") {
      const previewText = streamedGeneration.previewText ?? ""
      const streamBlocks = buildStreamingPreviewBlocks(previewText)
      return buildOutputRecord(getOutputForComponent(componentOutputs, component), {
        content: streamBlocks,
        content_json: streamBlocks,
        resolved_content_json: streamBlocks,
        content_text: previewText,
        updated_at: streamedGeneration.updatedAt,
      })
    }
    if (streamedGeneration?.previewBlocks?.length) {
      return buildOutputRecord(getOutputForComponent(componentOutputs, component), {
        content: streamedGeneration.previewBlocks,
        content_json: streamedGeneration.previewBlocks,
        resolved_content_json: streamedGeneration.previewBlocks,
        content_text: contentBlocksToPlainText(streamedGeneration.previewBlocks),
        updated_at: streamedGeneration.updatedAt,
      })
    }
    if (streamedGeneration?.previewText?.trim()) {
      return {
        content: null,
        content_text: streamedGeneration.previewText,
        resolved_content_json: null,
        content_json: null,
        attachment_map: null,
        updated_at: streamedGeneration.updatedAt,
        task_component_output_id: null,
        attachments: [],
        comment_thread_count: 0,
        open_comment_thread_count: 0,
      }
    }
    return getOutputForComponent(componentOutputs, component)
  }, [componentOutputs, editStreamsForChannel, buildPreviewsForChannel, inFlightComponentGenerations])

  const setActiveExportComponentId = useCallback((taskComponentId: string | null) => {
    activeOutputTaskComponentIdRef.current = taskComponentId
    setActiveOutputTaskComponentId(taskComponentId)
  }, [])

  const handleActiveFieldChangeWrapped = useCallback((context: AiActiveFieldContext) => {
    if (
      context.selectedContextType === "component_output"
      || context.fieldType?.toLowerCase() === "component_output"
    ) {
      setActiveExportComponentId(context.taskComponentId ?? null)
      lastSelectedAiTaskComponentIdRef.current = context.taskComponentId ?? null
    } else if (context.fieldType === "task" || context.selectedContextType === "task") {
      lastSelectedAiTaskComponentIdRef.current = null
    }
    onActiveFieldChange?.(context)
  }, [onActiveFieldChange, setActiveExportComponentId])

  const canCopyComponentContent = useCallback((component: TaskChannelComponent) => {
    return buildNormalizedExportFromLiveOutput({
      component: taskChannelComponentToExportRow(component),
      output: getResolvedOutputForComponent(component),
    }) != null
  }, [getResolvedOutputForComponent])

  const buildAllChannelNormalizedExportsForCopy = useCallback((): NormalizedComponentExport[] => {
    const seen = new Set<string>()
    const orderedComponents = sortTaskChannelComponentsByPosition(
      components.filter((component) => component.selected),
    )

    const results: NormalizedComponentExport[] = []
    for (const component of orderedComponents) {
      const normalized = buildNormalizedExportFromLiveOutput({
        component: taskChannelComponentToExportRow(component),
        output: getResolvedOutputForComponent(component),
      })
      if (!normalized?.hasContent) continue
      if (seen.has(normalized.id)) continue
      seen.add(normalized.id)
      results.push(normalized)
    }

    if (results.length === 0 && (isNoBriefing || !effectiveBriefingTypeId)) {
      const mainComponent: TaskChannelComponent = {
        task_component_id: null,
        briefing_component_id: MAIN_BRIEFING_COMPONENT_ID,
        project_component_id: null,
        title: "Main content",
        description: null,
        selected: true,
        position: 0,
        custom_title: null,
        custom_description: null,
        purpose: null,
        guidance: null,
        suggested_word_count: null,
        subheads: null,
      }
      const mainNormalized = buildNormalizedExportFromLiveOutput({
        component: taskChannelComponentToExportRow(mainComponent),
        output: getOutputForComponent(componentOutputs, mainComponent),
      })
      if (mainNormalized?.hasContent && !seen.has(mainNormalized.id)) {
        results.push(mainNormalized)
      }
    }

    return results
  }, [
    componentOutputs,
    components,
    effectiveBriefingTypeId,
    getResolvedOutputForComponent,
    isNoBriefing,
  ])

  const canCopyAllChannelContent = useMemo(
    () => buildAllChannelNormalizedExportsForCopy().length > 0,
    [buildAllChannelNormalizedExportsForCopy],
  )

  const handleCopyComponentContent = useCallback(async (component: TaskChannelComponent) => {
    console.log("[copy-content-click-component]", {
      taskId,
      channelId: selectedChannelId,
      componentId: component.task_component_id,
      componentLabel: getComponentOutputDisplayTitle(component),
    })
    if (isCopyingContent) return
    setIsCopyingContent(true)
    try {
      const normalized = buildNormalizedExportFromLiveOutput({
        component: taskChannelComponentToExportRow(component),
        output: getResolvedOutputForComponent(component),
      })
      if (!normalized) {
        console.warn("[copy-content-error]", { reason: "empty-component", componentId: component.task_component_id })
        toast({ title: "Nothing to copy", description: "This component has no content yet." })
        return
      }
      const result = await copyComponentsToClipboard([normalized])
      if (result.ok && result.mode === "rich") {
        toast({ title: "Copied", description: "Component content copied to clipboard." })
        return
      }
      if (result.ok && result.mode === "plain") {
        toast({
          title: "Copied as plain text",
          description: "Rich formatting could not be copied; plain text was copied instead.",
        })
        return
      }
      toast({
        title: "Copy failed",
        description: result.message ?? "Could not copy content.",
        variant: "destructive",
      })
    } catch (err: unknown) {
      console.error("[copy-content-error]", err)
      toast({
        title: "Copy failed",
        description: err instanceof Error ? err.message : "Could not copy content.",
        variant: "destructive",
      })
    } finally {
      setIsCopyingContent(false)
    }
  }, [
    getResolvedOutputForComponent,
    isCopyingContent,
    selectedChannelId,
    taskId,
  ])

  const handleCopyAllChannelContent = useCallback(async () => {
    console.log("[copy-content-handler-all-entry]", {
      taskId,
      channelId: selectedChannelId,
    })
    if (isCopyingContent) return
    setIsCopyingContent(true)
    try {
      const exportsForCopy = buildAllChannelNormalizedExportsForCopy()
      if (exportsForCopy.length === 0) {
        console.warn("[copy-content-error]", { reason: "empty-channel", taskId, channelId: selectedChannelId })
        toast({
          title: "Nothing to copy",
          description: "No component outputs are available for this channel yet.",
        })
        return
      }
      const result = await copyComponentsToClipboard(exportsForCopy)
      if (result.ok && result.mode === "rich") {
        toast({
          title: "Copied",
          description: `${exportsForCopy.length} component${exportsForCopy.length === 1 ? "" : "s"} copied to clipboard.`,
        })
        return
      }
      if (result.ok && result.mode === "plain") {
        toast({
          title: "Copied as plain text",
          description: "Rich formatting could not be copied; plain text was copied instead.",
        })
        return
      }
      toast({
        title: "Copy failed",
        description: result.message ?? "Could not copy content.",
        variant: "destructive",
      })
    } catch (err: unknown) {
      console.error("[copy-content-error]", err)
      toast({
        title: "Copy failed",
        description: err instanceof Error ? err.message : "Could not copy content.",
        variant: "destructive",
      })
    } finally {
      setIsCopyingContent(false)
    }
  }, [buildAllChannelNormalizedExportsForCopy, isCopyingContent, selectedChannelId, taskId])

  useEffect(() => {
    if (!isFocusedSingleOutputMode || focusedSelectedComponents.length !== 1) return
    const nextId = focusedSelectedComponents[0]?.task_component_id ?? null
    if (nextId) setActiveExportComponentId(nextId)
  }, [focusedSelectedComponents, isFocusedSingleOutputMode, setActiveExportComponentId])

  useEffect(() => {
    console.log("[task-details-copy-debug-version]", "2026-06-24-copy-debug-v1")
  }, [])

  useEffect(() => {
    if (!taskId || typeof window === "undefined") return
    const copyableExports = buildAllChannelNormalizedExportsForCopy()
    window.dispatchEvent(
      new CustomEvent("task-details:export-actions-state", {
        detail: {
          taskId,
          channelId: selectedChannelId,
          canCopyAllChannelContent,
          componentCount: components.filter((component) => component.selected).length,
          copyableComponentCount: copyableExports.length,
        },
      }),
    )
  }, [
    buildAllChannelNormalizedExportsForCopy,
    canCopyAllChannelContent,
    componentOutputs,
    components,
    taskId,
  ])

  const handleCopyMainContent = useCallback(async () => {
    const mainComponent: TaskChannelComponent = {
      task_component_id: null,
      briefing_component_id: MAIN_BRIEFING_COMPONENT_ID,
      project_component_id: null,
      title: "Main content",
      description: null,
      selected: true,
      position: 0,
      custom_title: null,
      custom_description: null,
      purpose: null,
      guidance: null,
      suggested_word_count: null,
      subheads: null,
    }
    const mainOutput = getOutputForComponent(componentOutputs, mainComponent)
    if (isCopyingContent) return
    setIsCopyingContent(true)
    try {
      const normalized = buildNormalizedExportFromLiveOutput({
        component: taskChannelComponentToExportRow(mainComponent),
        output: mainOutput,
      })
      if (!normalized) {
        toast({ title: "Nothing to copy", description: "Main content is empty." })
        return
      }
      const result = await copyComponentsToClipboard([normalized])
      if (result.ok && result.mode === "rich") {
        toast({ title: "Copied", description: "Main content copied to clipboard." })
      } else if (result.ok && result.mode === "plain") {
        toast({ title: "Copied as plain text", description: "Rich formatting could not be copied; plain text was copied instead." })
      } else {
        toast({ title: "Copy failed", description: result.message ?? "Could not copy content.", variant: "destructive" })
      }
    } finally {
      setIsCopyingContent(false)
    }
  }, [componentOutputs, isCopyingContent])

  const focusedWorkspaceLatestUpdatedAt = useMemo(() => {
    let latestTimestamp = 0
    let latestRaw: string | null = null
    for (const component of focusedSelectedComponents) {
      const resolvedOutput = getResolvedOutputForComponent(component)
      if (!resolvedOutput?.updated_at) continue
      const ts = Date.parse(resolvedOutput.updated_at)
      if (Number.isNaN(ts) || ts <= latestTimestamp) continue
      latestTimestamp = ts
      latestRaw = resolvedOutput.updated_at
    }
    return latestRaw
  }, [focusedSelectedComponents, getResolvedOutputForComponent])

  const focusedWorkspaceCombinedText = useMemo(() => {
    return focusedSelectedComponents
      .map((component) => extractPlainText(getResolvedOutputForComponent(component)?.content_text ?? ''))
      .filter(Boolean)
      .join('\n')
  }, [focusedSelectedComponents, getResolvedOutputForComponent])
  const focusedWorkspaceWordCount = useMemo(() => {
    return focusedWorkspaceCombinedText
      .split(/\s+/)
      .filter(Boolean)
      .length
  }, [focusedWorkspaceCombinedText])

  const parseKeywordTokens = useCallback((raw: string): string[] => {
    return raw
      .split(/[;,]/)
      .map((token) => token.trim())
      .filter(Boolean)
  }, [])

  const focusedWorkspaceKeywordList = useMemo(
    () => buildTaskChannelKeywordList(variantSEOData, persistedTaskChannelSeoKeywords),
    [variantSEOData, persistedTaskChannelSeoKeywords],
  )

  const focusedWorkspaceKeywordOccurrences = useMemo(() => {
    return focusedWorkspaceKeywordList.map((keyword, index) => {
      const color = KEYWORD_HIGHLIGHT_PALETTE[index % KEYWORD_HIGHLIGHT_PALETTE.length]
      return {
        keyword,
        color,
        occurrences: countKeywordOccurrences(focusedWorkspaceCombinedText, keyword),
      }
    })
  }, [focusedWorkspaceKeywordList, focusedWorkspaceCombinedText])
  const focusedWorkspaceKeywordOccurrenceTotal = useMemo(
    () => focusedWorkspaceKeywordOccurrences.reduce((sum, item) => sum + item.occurrences, 0),
    [focusedWorkspaceKeywordOccurrences]
  )
  const focusedWorkspaceHighlightTerms = useMemo(
    () => (isFocusedKeywordHighlightEnabled
      ? focusedWorkspaceKeywordOccurrences.map((item) => ({ term: item.keyword, color: item.color }))
      : []),
    [focusedWorkspaceKeywordOccurrences, isFocusedKeywordHighlightEnabled]
  )

  const focusedWorkspaceKeywordDensities = useMemo(() => {
    if (focusedWorkspaceKeywordList.length === 0) return []
    return focusedWorkspaceKeywordList.map((keyword) => ({
      keyword,
      density: calculateKeywordDensity(focusedWorkspaceCombinedText, keyword),
    }))
  }, [focusedWorkspaceKeywordList, focusedWorkspaceCombinedText])
  const focusedCommentCount = useMemo(() => {
    return focusedSelectedComponents.reduce((count, component) => {
      const output = getOutputForComponent(componentOutputs, component)
      return count + Math.max(0, output?.comment_thread_count ?? 0)
    }, 0)
  }, [focusedSelectedComponents, componentOutputs])
  const focusedHasKeywordWarning = useMemo(() => {
    return focusedWorkspaceKeywordDensities.some((item) => getDensityColor(item.density).color.includes("red"))
  }, [focusedWorkspaceKeywordDensities])
  const shouldRenderFocusedCommentHighlights =
    isFocusedAllOutputsMode && activeFocusedPanel === "comments" && focusedShowCommentHighlights
  const handleCreateFocusedInlineComment = useCallback(async () => {
    if (!currentPublicUserId || !focusedCommentsTargetComponent || !focusedInlineCommentDraft) return
    const comment = focusedInlineCommentText.trim()
    if (!comment) return
    const taskComponentOutputId = getOutputForComponent(componentOutputs, focusedCommentsTargetComponent)?.task_component_output_id
    if (!taskComponentOutputId) return
    const watcherIds = Array.from(
      new Set(
        [
          ...((focusedInlinePendingParticipants ?? []).length > 0 ? focusedInlinePendingParticipants : defaultCommentParticipants),
          currentPublicUserId != null ? { id: currentPublicUserId } : null,
        ]
          .filter(Boolean)
          .map((participant: any) => Number(participant?.id))
          .filter((id: number) => Number.isFinite(id))
      )
    )
    try {
      const threadId = await createFocusedOutputCommentThreadMutation.mutateAsync({
        taskId,
        projectId: projectId ?? null,
        channelId: selectedChannelId ?? null,
        taskComponentOutputId,
        comment,
        anchorType: focusedInlineCommentDraft.anchorType === "image_point" ? "image_point" : "text_range",
        anchorStart: focusedInlineCommentDraft.anchorType === "image_point" ? null : focusedInlineCommentDraft.start,
        anchorEnd: focusedInlineCommentDraft.anchorType === "image_point" ? null : focusedInlineCommentDraft.end,
        anchorQuote: focusedInlineCommentDraft.anchorType === "image_point" ? null : focusedInlineCommentDraft.text,
        attachmentId: focusedInlineCommentDraft.attachmentId ?? null,
        anchorX: focusedInlineCommentDraft.anchorType === "image_point" ? (focusedInlineCommentDraft.anchorX ?? null) : null,
        anchorY: focusedInlineCommentDraft.anchorType === "image_point" ? (focusedInlineCommentDraft.anchorY ?? null) : null,
        watcherIds,
        createdBy: currentPublicUserId,
      })
      setFocusedInlineCommentText("")
      setFocusedInlinePendingParticipants([])
      setFocusedInlineRemovedParticipants([])
      setFocusedInlineCommentDraft(null)
      setFocusedCommentsActiveThreadId(threadId)
      refetchOutputCommentThreads()
    } catch (_error) {
      // handled by mutation error state + next refetch
    }
  }, [
    currentPublicUserId,
    focusedCommentsTargetComponent,
    focusedInlineCommentDraft,
    focusedInlineCommentText,
    focusedInlinePendingParticipants,
    defaultCommentParticipants,
    createFocusedOutputCommentThreadMutation,
    taskId,
    projectId,
    selectedChannelId,
    componentOutputs,
    refetchOutputCommentThreads,
  ])
  const focusedNavigatorItems = useMemo(() => {
    return focusedSelectedComponents.map((component) => {
      const cardKey = getSelectedCardKey(component)
      const title = (component.custom_title || component.title || 'Untitled component').trim()
      return {
        cardKey,
        anchorId: getFocusedOutputAnchorId(cardKey),
        title: title || 'Untitled component',
      }
    })
  }, [focusedSelectedComponents, getSelectedCardKey, getFocusedOutputAnchorId])
  const scrollToFocusedOutput = useCallback((anchorId: string) => {
    const el = document.getElementById(anchorId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  useEffect(() => {
    if (!requestedFocusedOutputId) return
    if (!isFocusedAllOutputsMode) return
    const matchedComponent = focusedSelectedComponents.find((component) => {
      const output = getOutputForComponent(componentOutputs, component)
      return output?.task_component_output_id === requestedFocusedOutputId
    })
    if (!matchedComponent) return
    const cardKey = getSelectedCardKey(matchedComponent)
    scrollToFocusedOutput(getFocusedOutputAnchorId(cardKey))
    setFocusedCommentsTargetCardKey(cardKey)
    setActiveFocusedPanel("comments")
    setRequestedFocusedOutputId(null)
  }, [
    requestedFocusedOutputId,
    isFocusedAllOutputsMode,
    focusedSelectedComponents,
    componentOutputs,
    getSelectedCardKey,
    scrollToFocusedOutput,
    getFocusedOutputAnchorId,
  ])
  const focusedComponentByCardKey = useMemo(() => {
    const map = new Map<string, TaskChannelComponent>()
    focusedSelectedComponents.forEach((component) => {
      map.set(getSelectedCardKey(component), component)
    })
    return map
  }, [focusedSelectedComponents, getSelectedCardKey])
  const selectedComponentByCardKey = useMemo(() => {
    const map = new Map<string, TaskChannelComponent>()
    components
      .filter((component) => component.selected)
      .forEach((component) => {
        map.set(getSelectedCardKey(component), component)
      })
    return map
  }, [components, getSelectedCardKey])
  const focusedSearchMatches = useMemo(() => {
    const term = focusedSearchTerm.trim()
    if (!term) return [] as Array<{ cardKey: string; anchorId: string }>
    const matches: Array<{ cardKey: string; anchorId: string }> = []
    focusedSelectedComponents.forEach((component) => {
      const cardKey = getSelectedCardKey(component)
      const plain = extractPlainText(getResolvedOutputForComponent(component)?.content_text ?? '')
      const hitCount = countKeywordOccurrences(plain, term)
      if (hitCount === 0) return
      for (let i = 0; i < hitCount; i += 1) {
        matches.push({ cardKey, anchorId: getFocusedOutputAnchorId(cardKey) })
      }
    })
    return matches
  }, [focusedSearchTerm, focusedSelectedComponents, getSelectedCardKey, getResolvedOutputForComponent, getFocusedOutputAnchorId])

  useEffect(() => {
    if (focusedSearchMatches.length === 0) {
      if (focusedSearchActiveIndex !== 0) setFocusedSearchActiveIndex(0)
      return
    }
    if (focusedSearchActiveIndex >= focusedSearchMatches.length) {
      setFocusedSearchActiveIndex(focusedSearchMatches.length - 1)
    }
  }, [focusedSearchMatches, focusedSearchActiveIndex])

  const syncFocusOutputsModeInUrl = useCallback((enabled: boolean) => {
    const newParams = new URLSearchParams(searchParams.toString())
    const currentValue = newParams.get(FOCUS_OUTPUTS_URL_PARAM)
    const nextValue = enabled ? 'all' : null

    if (currentValue === nextValue) return
    if (nextValue) newParams.set(FOCUS_OUTPUTS_URL_PARAM, nextValue)
    else newParams.delete(FOCUS_OUTPUTS_URL_PARAM)

    const query = newParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [searchParams, pathname, router])

  const enterFocusedOutputMode = useCallback((cardKey: string, componentId: number | null) => {
    setFocusedOutputCardKey(cardKey)
    if (cardKey && cardKey !== FOCUSED_ALL_SELECTED_OUTPUTS_KEY) {
      setActiveExportComponentId(cardKey)
    }
    if (componentId != null) setAutoExpandComponentId(componentId)
    if (!isSectionExpanded && onToggleSectionExpand) onToggleSectionExpand()
  }, [isSectionExpanded, onToggleSectionExpand, setActiveExportComponentId])

  const enterFocusedAllOutputsMode = useCallback(() => {
    suppressFocusOutputsUrlRestoreRef.current = false
    setFocusedOutputCardKey(FOCUSED_ALL_SELECTED_OUTPUTS_KEY)
    setIsFocusedNavigatorOpen(false)
    setIsFocusedSearchOpen(false)
    syncFocusOutputsModeInUrl(true)
    if (!isSectionExpanded && onToggleSectionExpand) onToggleSectionExpand()
  }, [isSectionExpanded, onToggleSectionExpand, syncFocusOutputsModeInUrl])

  const exitFocusedOutputMode = useCallback(() => {
    const isExitingAllOutputs = focusedOutputCardKey === FOCUSED_ALL_SELECTED_OUTPUTS_KEY
    if (isExitingAllOutputs) {
      suppressFocusOutputsUrlRestoreRef.current = true
      syncFocusOutputsModeInUrl(false)
    }
    setFocusedOutputCardKey(null)
    setIsFocusedNavigatorOpen(false)
    setActiveFocusedPanel(null)
  }, [focusedOutputCardKey, syncFocusOutputsModeInUrl])
  const focusPrevOutput = useCallback(() => {
    if (focusedOutputCardKey === FOCUSED_ALL_SELECTED_OUTPUTS_KEY) return
    if (focusedOutputIndex <= 0) return
    const prev = focusedOutputOrder[focusedOutputIndex - 1]
    setFocusedOutputCardKey(prev.cardKey)
    setActiveExportComponentId(prev.cardKey)
    if (prev.componentId != null) setAutoExpandComponentId(prev.componentId)
  }, [focusedOutputCardKey, focusedOutputIndex, focusedOutputOrder, setActiveExportComponentId])
  const focusNextOutput = useCallback(() => {
    if (focusedOutputCardKey === FOCUSED_ALL_SELECTED_OUTPUTS_KEY) return
    if (focusedOutputIndex < 0 || focusedOutputIndex >= focusedOutputOrder.length - 1) return
    const next = focusedOutputOrder[focusedOutputIndex + 1]
    setFocusedOutputCardKey(next.cardKey)
    setActiveExportComponentId(next.cardKey)
    if (next.componentId != null) setAutoExpandComponentId(next.componentId)
  }, [focusedOutputCardKey, focusedOutputIndex, focusedOutputOrder, setActiveExportComponentId])
  const focusedOutputPositionLabel = useMemo(() => {
    if (focusedOutputIndex < 0) return ''
    return `${focusedOutputIndex + 1} / ${focusedOutputOrder.length}`
  }, [focusedOutputIndex, focusedOutputOrder.length])

  useEffect(() => {
    if (!isFocusedAllOutputsMode && isFocusedNavigatorOpen) {
      setIsFocusedNavigatorOpen(false)
    }
  }, [isFocusedAllOutputsMode, isFocusedNavigatorOpen])

  useEffect(() => {
    wasFocusedAllOutputsRef.current = isFocusedAllOutputsMode
  }, [isFocusedAllOutputsMode])

  useEffect(() => {
    if (!isFocusedAllOutputsMode) return
    if (!isFocusedSearchOpen && !isFocusedNavigatorOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const isInsideSearch = focusedSearchPopoverRef.current?.contains(target) ?? false
      const isInsideNavigator = focusedNavigatorPopoverRef.current?.contains(target) ?? false
      if (!isInsideSearch) setIsFocusedSearchOpen(false)
      if (!isInsideNavigator) setIsFocusedNavigatorOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isFocusedAllOutputsMode, isFocusedSearchOpen, isFocusedNavigatorOpen])

  const scrollToSelectedCard = useCallback((cardKey: string) => {
    const el = document.getElementById(getSelectedCardDomId(cardKey))
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [getSelectedCardDomId])

  /** Keys of components currently in the selected list (g:<id> | p:<id> | t:<uuid>) for defensive disable Add */
  const selectedKeySet = useMemo(() => {
    const set = new Set<string>()
    for (const c of components) {
      const key = getComponentKeyForSelectedRow(c) || (c.component_key ?? (c.briefing_component_id != null ? `g:${c.briefing_component_id}` : c.project_component_id != null ? `p:${c.project_component_id}` : c.task_component_id ? `t:${c.task_component_id}` : ''))
      if (key) set.add(key)
    }
    return set
  }, [components, getComponentKeyForSelectedRow])

  const filteredAvailableComponents = useMemo(() => {
    const query = addComponentSearchQuery.trim().toLowerCase()
    const rows = Array.isArray(availableList) ? [...availableList] : []
    if (!query) return rows
    return rows.filter((item) => {
      const title = (item.custom_title || item.title || '').toString().toLowerCase()
      const tag = (item.tag || '').toString().toLowerCase()
      return title.includes(query) || tag.includes(query)
    })
  }, [availableList, addComponentSearchQuery])

  const shouldShowCreateNewComponentRow = useMemo(() => {
    const query = addComponentSearchQuery.trim()
    if (!query) return false
    const normalized = query.toLowerCase()
    return !availableList.some((item) => {
      const title = (item.custom_title || item.title || '').toString().trim().toLowerCase()
      return title === normalized
    })
  }, [availableList, addComponentSearchQuery])

  const addComponentDropdownRowsCount = filteredAvailableComponents.length + (shouldShowCreateNewComponentRow ? 1 : 0)

  useEffect(() => {
    if (!isAddComponentDropdownOpen) return
    setAddComponentHighlightedIndex(0)
    window.setTimeout(() => {
      addComponentCardInputRef.current?.focus()
    }, 0)
  }, [isAddComponentDropdownOpen])

  useEffect(() => {
    if (isAddComponentDropdownOpen) return
    setAddComponentSearchQuery('')
    setAddComponentDropdownMode('create')
    setAddComponentCreateInstructions('')
    setSelectedComponentIds(new Set())
    setAddComponentHighlightedIndex(0)
  }, [isAddComponentDropdownOpen])

  useEffect(() => {
    materializeVirtualMainOnFirstSaveRef.current = false
  }, [taskId, selectedChannelId])

  const linkSummaryItems = useMemo<LinkSummaryItem[]>(() => {
    const summary = new Map<string, LinkSummaryItem>()
    const selectedComponents = components.filter((component) => component.selected)

    for (const component of selectedComponents) {
      const cardKey = getSelectedCardKey(component)
      const componentTitle = (component.custom_title ?? component.title ?? '').trim() || 'Untitled component'
      const output = getResolvedOutputForComponent(component)
      const extractedUrls = extractUrlsFromComponentOutput(output)
      for (const extracted of extractedUrls) {
        if (isMediaOrStorageUrl(extracted.url)) continue
        const normalized = normalizeUrl(extracted.url)
        if (!normalized.normalizedUrl) continue

        const existing = summary.get(normalized.normalizedUrl)
        if (existing) {
          existing.occurrences += 1
          const existingComponent = existing.components.find((entry) => entry.cardKey === cardKey)
          if (existingComponent) existingComponent.count += 1
          else existing.components.push({ cardKey, title: componentTitle, count: 1 })
          const cleanAnchor = (extracted.anchorText ?? '').trim()
          if (cleanAnchor && !existing.anchorSamples.includes(cleanAnchor) && existing.anchorSamples.length < 3) {
            existing.anchorSamples.push(cleanAnchor)
          }
          continue
        }

        summary.set(normalized.normalizedUrl, {
          normalizedUrl: normalized.normalizedUrl,
          url: normalized.displayUrl,
          displayUrl: normalized.displayUrl,
          isValid: normalized.isValid,
          occurrences: 1,
          anchorSamples: (extracted.anchorText ?? '').trim() ? [(extracted.anchorText ?? '').trim()] : [],
          components: [{ cardKey, title: componentTitle, count: 1 }],
        })
      }
    }

    return Array.from(summary.values())
  }, [components, getResolvedOutputForComponent, getSelectedCardKey])

  useEffect(() => {
    if (linkSummaryItems.length === 0) return

    setLinkStatusByUrl((prev) => {
      let hasChanges = false
      const next = { ...prev }
      for (const item of linkSummaryItems) {
        if (!item.isValid) {
          if (next[item.normalizedUrl]?.kind !== 'invalid') {
            next[item.normalizedUrl] = { kind: 'invalid' }
            hasChanges = true
          }
          continue
        }

        const cached = linkStatusCacheRef.current.get(item.normalizedUrl)
        if (cached) {
          if (next[item.normalizedUrl] !== cached) {
            next[item.normalizedUrl] = cached
            hasChanges = true
          }
        } else if (!next[item.normalizedUrl] || next[item.normalizedUrl].kind !== 'checking') {
          next[item.normalizedUrl] = { kind: 'checking' }
          hasChanges = true
        }
      }
      return hasChanges ? next : prev
    })

    const pendingChecks = linkSummaryItems.filter(
      (item) => item.isValid && !linkStatusCacheRef.current.has(item.normalizedUrl)
    )
    if (pendingChecks.length === 0) return

    let isCancelled = false
    const runCheck = async () => {
      const urls = pendingChecks.map((item) => item.normalizedUrl)
      console.log("[check-links] candidate links", urls)
      if (urls.length === 0) return
      const { data, error } = await supabase.functions.invoke('check-links', {
        body: { urls },
      })
      if (isCancelled) return

      if (error) {
        setLinkStatusByUrl((prev) => {
          const next = { ...prev }
          for (const item of pendingChecks) {
            next[item.normalizedUrl] = { kind: 'unknown' }
          }
          return next
        })
        return
      }

      const functionResults = extractCheckLinksResults(data)
      const resultByNormalizedUrl = new Map<string, CheckLinksFunctionResult>()
      for (const result of functionResults) {
        if (typeof result?.normalizedUrl === 'string' && result.normalizedUrl) {
          const normalizedFromResult = normalizeUrl(result.normalizedUrl).normalizedUrl
          if (normalizedFromResult) resultByNormalizedUrl.set(normalizedFromResult, result)
        }
        if (typeof result?.input === 'string' && result.input) {
          const normalizedFromInput = normalizeUrl(result.input).normalizedUrl
          if (normalizedFromInput && !resultByNormalizedUrl.has(normalizedFromInput)) {
            resultByNormalizedUrl.set(normalizedFromInput, result)
          }
        }
      }

      setLinkStatusByUrl((prev) => {
        const next = { ...prev }
        for (const item of pendingChecks) {
          const result = resultByNormalizedUrl.get(item.normalizedUrl)
          const status = result ? mapCheckLinksResultToStatus(result) : { kind: 'unknown' } satisfies LinkStatusResult
          linkStatusCacheRef.current.set(item.normalizedUrl, status)
          next[item.normalizedUrl] = status
        }
        return next
      })
    }

    void runCheck()

    return () => {
      isCancelled = true
    }
  }, [linkSummaryItems, supabase])

  const sortedLinkSummaryItems = useMemo(() => {
    return [...linkSummaryItems].sort((a, b) => {
      const statusA: LinkStatusResult = !a.isValid
        ? { kind: 'invalid' }
        : (linkStatusByUrl[a.normalizedUrl] ?? { kind: 'checking' })
      const statusB: LinkStatusResult = !b.isValid
        ? { kind: 'invalid' }
        : (linkStatusByUrl[b.normalizedUrl] ?? { kind: 'checking' })

      const bucketDiff = getLinkStatusSortBucket(statusA) - getLinkStatusSortBucket(statusB)
      if (bucketDiff !== 0) return bucketDiff
      return a.displayUrl.localeCompare(b.displayUrl)
    })
  }, [linkSummaryItems, linkStatusByUrl])

  const linkSummaryNon200Count = useMemo(() => {
    return sortedLinkSummaryItems.reduce((count, item) => {
      if (!item.isValid) return count + 1
      const status = linkStatusByUrl[item.normalizedUrl]
      if (!status) return count + 1
      if (status.kind !== 'http') return count + 1
      return status.statusCode === 200 ? count : count + 1
    }, 0)
  }, [sortedLinkSummaryItems, linkStatusByUrl])
  const focusedHasSeoWarning = focusedHasKeywordWarning || linkSummaryNon200Count > 0

  const renderLinkSummarySection = ({
    containerClassName = 'mt-2',
    useCountNavigator = false,
    onNavigateToLinkComponent,
    enableReplace = false,
  }: {
    containerClassName?: string
    useCountNavigator?: boolean
    onNavigateToLinkComponent?: (cardKey: string) => void
    enableReplace?: boolean
  } = {}) => (
    <div className={containerClassName}>
      <div className="flex w-full items-center justify-between gap-2 px-0 py-1 text-left">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-sm font-normal text-gray-400">Linkbuilding summary</span>
          {linkSummaryNon200Count > 0 ? (
            <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              {linkSummaryNon200Count} issue{linkSummaryNon200Count === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>

      <div className="pt-1">
          {sortedLinkSummaryItems.length > 0 ? (
            <div className="space-y-1.5">
              {sortedLinkSummaryItems.map((linkItem) => {
                const status: LinkStatusResult = !linkItem.isValid
                  ? { kind: 'invalid' }
                  : (linkStatusByUrl[linkItem.normalizedUrl] ?? { kind: 'checking' })
                const statusLabel = getLinkStatusLabel(status)
                const statusColor = getLinkStatusColor(status)
                const statusCodeText = status.kind === 'http'
                  ? String(status.statusCode)
                  : status.kind === 'checking'
                    ? '...'
                    : statusLabel
                const isExpandedLink = expandedLinkSummaryUrls.has(linkItem.normalizedUrl)
                const sortedComponents = linkItem.components
                  .slice()
                  .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
                const anchorNote = linkItem.anchorSamples.length > 0
                  ? `Anchor examples: ${linkItem.anchorSamples.join(' | ')}`
                  : undefined

                return (
                  <div
                    key={linkItem.normalizedUrl}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1.5"
                  >
                  <div className="flex items-center gap-2">
                    {!useCountNavigator ? (
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
                        onClick={() => {
                          setExpandedLinkSummaryUrls((prev) => {
                            const next = new Set(prev)
                            if (next.has(linkItem.normalizedUrl)) next.delete(linkItem.normalizedUrl)
                            else next.add(linkItem.normalizedUrl)
                            return next
                          })
                        }}
                        title={isExpandedLink ? 'Hide components' : 'Show components'}
                        aria-label={isExpandedLink ? 'Hide components' : 'Show components'}
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform duration-150 ${
                            isExpandedLink ? "rotate-0" : "-rotate-90"
                          }`}
                        />
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <a
                          href={linkItem.isValid ? linkItem.url : undefined}
                          target={linkItem.isValid ? '_blank' : undefined}
                          rel={linkItem.isValid ? 'noreferrer noopener' : undefined}
                          className={`truncate text-xs ${linkItem.isValid ? "text-blue-700 hover:text-blue-800 hover:underline" : "text-gray-500"}`}
                          title={linkItem.url}
                        >
                          {linkItem.displayUrl}
                        </a>
                        <span className={`text-xs font-medium ${statusColor}`}>
                          {statusCodeText}
                        </span>
                      </div>
                      {linkItem.anchorSamples.length > 0 ? (
                        <p className="mt-0.5 truncate text-[11px] text-gray-500" title={anchorNote}>
                          {linkItem.anchorSamples.join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {linkItem.occurrences > 0 ? (
                        useCountNavigator ? (
                          linkItem.components.length === 1 && onNavigateToLinkComponent ? (
                            <button
                              type="button"
                              onClick={() => onNavigateToLinkComponent(linkItem.components[0].cardKey)}
                              className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-200"
                              title="Jump to linked component"
                              aria-label="Jump to linked component"
                            >
                              {linkItem.occurrences}
                            </button>
                          ) : (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-200"
                                  title="Show linked components"
                                  aria-label="Show linked components"
                                >
                                  {linkItem.occurrences}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-64 p-1">
                                <div className="max-h-60 overflow-y-auto">
                                  {sortedComponents.map((componentRef) => (
                                    <button
                                      key={`${linkItem.normalizedUrl}-drawer-${componentRef.cardKey}`}
                                      type="button"
                                      onClick={() => onNavigateToLinkComponent?.(componentRef.cardKey)}
                                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-gray-100"
                                      title={componentRef.title}
                                    >
                                      <span className="truncate text-[11px] text-gray-700">{componentRef.title}</span>
                                      <span className="text-[11px] font-medium text-gray-600">{componentRef.count}</span>
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )
                        ) : (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                  {linkItem.occurrences}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {anchorNote ? (
                                  <p className="text-xs">{anchorNote}</p>
                                ) : (
                                  <p className="text-xs">Repeated link across selected component outputs.</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )
                      ) : null}
                      {enableReplace ? (
                        <Popover
                          open={activeLinkReplaceUrl === linkItem.normalizedUrl}
                          onOpenChange={(open) => {
                            if (open) {
                              setActiveLinkReplaceUrl(linkItem.normalizedUrl)
                              setLinkReplaceInput(linkItem.displayUrl)
                              setLinkReplaceError(null)
                            } else if (activeLinkReplaceUrl === linkItem.normalizedUrl) {
                              setActiveLinkReplaceUrl(null)
                              setLinkReplaceInput('')
                              setLinkReplaceError(null)
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title="Replace this link across focused outputs"
                              aria-label="Replace this link across focused outputs"
                            >
                              Replace
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-[min(90vw,28rem)] p-2">
                            <div className="space-y-2 text-xs">
                              <div>
                                <p className="font-medium text-gray-600">Current URL</p>
                                <p className="truncate text-gray-500" title={linkItem.displayUrl}>{linkItem.displayUrl}</p>
                              </div>
                              <div>
                                <p className="font-medium text-gray-600">New URL</p>
                                <Input
                                  value={activeLinkReplaceUrl === linkItem.normalizedUrl ? linkReplaceInput : ''}
                                  onChange={(event) => {
                                    setLinkReplaceInput(event.target.value)
                                    setLinkReplaceError(null)
                                  }}
                                  placeholder="https://example.com/new-target"
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="text-gray-500">
                                {linkItem.components.length} component(s) · {linkItem.occurrences} occurrence(s)
                              </div>
                              {activeLinkReplaceUrl === linkItem.normalizedUrl && linkReplaceError ? (
                                <p className="text-[11px] text-red-600">{linkReplaceError}</p>
                              ) : null}
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setActiveLinkReplaceUrl(null)
                                    setLinkReplaceInput('')
                                    setLinkReplaceError(null)
                                  }}
                                  disabled={isReplacingLink}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => void handleApplyLinkReplace(linkItem.normalizedUrl)}
                                  disabled={isReplacingLink}
                                >
                                  {isReplacingLink && activeLinkReplaceUrl === linkItem.normalizedUrl ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : 'Replace all'}
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                    </div>
                    {!useCountNavigator && isExpandedLink ? (
                    <div className="mt-1.5 overflow-hidden rounded border border-gray-100">
                        {linkItem.components.length === 0 ? (
                          <div className="px-2 py-1 text-[11px] text-gray-500">No linked components found.</div>
                        ) : (
                        <div className="divide-y divide-gray-100">
                          {sortedComponents.map((componentRef) => (
                              <div
                                key={`${linkItem.normalizedUrl}-${componentRef.cardKey}`}
                                className="flex items-center justify-between gap-2 px-2 py-1"
                              >
                                <button
                                  type="button"
                                  onClick={() => scrollToSelectedCard(componentRef.cardKey)}
                                  className="truncate text-left text-[11px] text-blue-700 hover:underline"
                                  title={componentRef.title}
                                >
                                  {componentRef.title}
                                </button>
                                <span className="text-[11px] font-medium text-gray-600">{componentRef.count}</span>
                              </div>
                            ))}
                        </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No outbound links found in selected component outputs.</p>
          )}
        </div>
    </div>
  )

  useEffect(() => {
    const data = channelContentQuery.data
    // get_task_channel_content_v1 is the Content-tab source of truth (briefing-independent).
    console.log('[task-channel-content] applying', {
      activeTaskId: taskId,
      activeChannelId: selectedChannelId,
      responseTaskId: data?.task_id,
      responseChannelId: data?.channel_id,
      components: data?.components?.length,
      output: data?.composed_output?.length,
      fallbackMainRequired: data?.fallback_main_required,
    })
    if (!data || data.channel_id !== selectedChannelId) {
      return
    }
    const rows = data.components ?? []

    setComponents((prev) => {
      const next = mapContentComponentRowsToActive(rows)
      const activeStreamIds = activeInteractiveStreamIdsRef.current
      const localGenerations = inFlightComponentGenerationsRef.current
      if (activeStreamIds.size === 0 && localGenerations.size === 0) return next

      const nextByTaskId = new Map(
        next
          .filter((row) => !!row.task_component_id)
          .map((row) => [row.task_component_id as string, row])
      )
      let preservedAnyRow = false
      for (const prevRow of prev) {
        const taskComponentId = prevRow.task_component_id
        if (!taskComponentId || nextByTaskId.has(taskComponentId)) continue
        const generation = localGenerations.get(taskComponentId)
        const shouldPreserve =
          activeStreamIds.has(taskComponentId)
          || generation?.status === "generating"
          || generation?.status === "complete"
        if (!shouldPreserve) continue
        nextByTaskId.set(taskComponentId, prevRow)
        preservedAnyRow = true
      }
      if (!preservedAnyRow) return next
      return sortTaskChannelComponentsByPosition(
        Array.from(nextByTaskId.values()).filter((row) => row.selected && !!row.task_component_id),
      )
    })
    setRemovedComponents([])
  setAvailableTemplates([])
  }, [channelContentQuery.data?.components, channelContentQuery.data?.channel_id, selectedChannelId, taskId])

  useEffect(() => {
    setRequestedOutputCommentThreadIds(new Set())
  }, [taskId, selectedChannelId])

  useEffect(() => {
    const composed =
      channelContentQuery.data?.composed_output
      ?? channelContentQuery.data?.latest_outputs
      ?? channelBootstrapQuery.data?.composed_output
    const contentChannelId =
      channelContentQuery.data?.channel_id
      ?? channelBootstrapQuery.data?.channel_id
    if (!composed || contentChannelId !== selectedChannelId) return
    setComponentOutputs((prev) => {
      const next = new Map(prev)
      for (const row of composed) {
        const outputKeys = getOutputMapKeysForRow({
          taskComponentId: row.task_component_id,
          briefingComponentId: row.briefing_component_id,
        })
        if (outputKeys.length === 0) continue
        for (const outputKey of outputKeys) {
          const existing = next.get(outputKey)
          const preserveLocal = shouldPreserveLocalOutput(outputKey)
          const localContent = outputValuesRef.current.get(outputKey)
          const localContentJson = outputJsonValuesRef.current.get(outputKey)
          const normalizedAttachments = normalizeTaskComponentOutputAttachments((row as any).attachments)
          const normalizedBootstrapContent = normalizeBootstrapOutputContent({
            row,
            attachments: normalizedAttachments,
          })
          const incomingBlocks = normalizedBootstrapContent.content ?? normalizedBootstrapContent.content_json ?? []
          const incomingHasBlocks = Array.isArray(incomingBlocks) && incomingBlocks.length > 0
          const incomingOutputId = typeof row.task_component_output_id === "string" ? row.task_component_output_id : null
          const existingBlocks = getOutputBlocks(existing ?? null)
          const existingHasBlocks = existingBlocks.length > 0
          const existingOutputId = existing?.task_component_output_id ?? null
          const hasFinalEventPreview =
            typeof row.task_component_id === "string" && finalComponentOutputPreviews.has(row.task_component_id)
          const activeEditStream =
            typeof row.task_component_id === "string" && selectedChannelId != null
              ? useComponentEditStreamStore
                  .getState()
                  .getActiveStreamForComponent(
                    taskId,
                    selectedChannelId,
                    row.task_component_id,
                    incomingOutputId ?? existingOutputId,
                  )
              : null
          if (activeEditStream) {
            continue
          }
          const shouldSkipStaleBootstrap =
            !incomingOutputId
            && !incomingHasBlocks
            && (
              (existingOutputId != null && existingHasBlocks)
              || hasFinalEventPreview
            )
          if (shouldSkipStaleBootstrap) {
            console.log("[bootstrap stale guard] keeping local/final output", {
              task_component_id: row.task_component_id ?? null,
              incoming_task_component_output_id: incomingOutputId,
              existing_task_component_output_id: existingOutputId,
              hasFinalEventPreview,
            })
            continue
          }
          if (preserveLocal) {
            next.set(
              outputKey,
              buildOutputRecord(existing, {
                task_component_output_id: incomingOutputId ?? existingOutputId,
                attachments: normalizedAttachments,
                attachment_map: normalizeAttachmentMap((row as any).attachment_map),
                comment_thread_count: row.comment_thread_count ?? existing?.comment_thread_count ?? 0,
                open_comment_thread_count: row.open_comment_thread_count ?? existing?.open_comment_thread_count ?? 0,
              })
            )
            continue
          }
          next.set(
            outputKey,
            buildOutputRecord(existing, {
              content: normalizedBootstrapContent.content,
              content_text: typeof localContent === "string" ? localContent : row.content_text,
              resolved_content_json:
                normalizedBootstrapContent.resolved_content_json,
              content_json:
                localContentJson
                ?? normalizedBootstrapContent.content_json,
              attachment_map: normalizeAttachmentMap((row as any).attachment_map),
              updated_at: row.updated_at,
              task_component_output_id: row.task_component_output_id,
              attachments: normalizedAttachments,
              comment_thread_count: row.comment_thread_count ?? 0,
              open_comment_thread_count: row.open_comment_thread_count ?? 0,
            })
          )
        }
      }
      return next
    })
    setInFlightComponentGenerations((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const row of composed) {
        if (!row.task_component_id) continue
        const normalizedBootstrapContent = normalizeBootstrapOutputContent({
          row,
          attachments: normalizeTaskComponentOutputAttachments((row as any).attachments),
        })
        const hasBlocks =
          (normalizedBootstrapContent.content?.length ?? 0) > 0
          || (normalizedBootstrapContent.content_json?.length ?? 0) > 0
        if (!hasBlocks) continue
        if (!next.has(row.task_component_id)) continue
        next.delete(row.task_component_id)
        changed = true
      }
      return changed ? next : prev
    })
  }, [
    channelContentQuery.data?.composed_output,
    channelContentQuery.data?.latest_outputs,
    channelContentQuery.data?.channel_id,
    channelBootstrapQuery.data?.composed_output,
    channelBootstrapQuery.data?.channel_id,
    finalComponentOutputPreviews,
    selectedChannelId,
    shouldPreserveLocalOutput,
  ])

  useEffect(() => {
    const composed =
      channelContentQuery.data?.composed_output
      ?? channelContentQuery.data?.latest_outputs
      ?? channelBootstrapQuery.data?.composed_output
    if (!composed || finalComponentOutputPreviews.size === 0) return
    setFinalComponentOutputPreviews((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Map(prev)
      for (const row of composed) {
        if (!row.task_component_id) continue
        const locked = next.get(row.task_component_id)
        if (!locked) continue
        const normalizedBootstrapContent = normalizeBootstrapOutputContent({
          row,
          attachments: normalizeTaskComponentOutputAttachments((row as any).attachments),
        })
        const incomingBlocks = normalizedBootstrapContent.content ?? normalizedBootstrapContent.content_json ?? []
        const incomingHasBlocks = Array.isArray(incomingBlocks) && incomingBlocks.length > 0
        const incomingOutputId = typeof row.task_component_output_id === "string" ? row.task_component_output_id : null
        const sameOutput = !!incomingOutputId && !!locked.taskComponentOutputId && incomingOutputId === locked.taskComponentOutputId
        if (!incomingHasBlocks || !sameOutput) continue
        if (!isIsoNewerOrEqual(row.updated_at, locked.updatedAt)) continue
        next.delete(row.task_component_id)
        changed = true
      }
      return changed ? next : prev
    })
  }, [channelBootstrapQuery.data?.composed_output, finalComponentOutputPreviews.size])
  
  // Read component output from composed output query (source of truth).
  const fetchComponentOutput = useCallback(async ({
    taskComponentId,
    briefingComponentId,
  }: {
    taskComponentId?: string | null
    briefingComponentId?: number | null
  }) => {
    if (!selectedChannelId) return

    const loadingKey = briefingComponentId ?? (taskComponentId ? (components.find((c) => c.task_component_id === taskComponentId)?.briefing_component_id ?? components.find((c) => c.task_component_id === taskComponentId)?.project_component_id ?? null) : null)

    // ✅ guard with ref (stable, not tied to state updates)
    if (loadingKey != null && loadingOutputsRef.current.has(loadingKey)) return
    if (loadingKey != null) loadingOutputsRef.current.add(loadingKey)

    // still keep state for UI spinner
    if (loadingKey != null) setLoadingOutputs(prev => new Set(prev).add(loadingKey))

    try {
      const data = (channelBootstrapQuery.data?.composed_output ?? []).find((row) => {
        if (taskComponentId && row.task_component_id === taskComponentId) return true
        if (typeof briefingComponentId === 'number' && row.briefing_component_id === briefingComponentId) return true
        return false
      }) ?? null
      if (data) {
        const outputKeys = getOutputMapKeysForRow({
          taskComponentId: data.task_component_id,
          briefingComponentId: data.briefing_component_id,
        })
        if (outputKeys.length === 0) return
        setComponentOutputs(prev => {
          const newMap = new Map(prev)
          const normalizedAttachments = normalizeTaskComponentOutputAttachments((data as any).attachments)
          const normalizedBootstrapContent = normalizeBootstrapOutputContent({
            row: data,
            attachments: normalizedAttachments,
          })
          for (const outputKey of outputKeys) {
            const existing = newMap.get(outputKey)
            const incomingBlocks = normalizedBootstrapContent.content ?? normalizedBootstrapContent.content_json ?? []
            const incomingHasBlocks = Array.isArray(incomingBlocks) && incomingBlocks.length > 0
            const incomingOutputId = typeof data.task_component_output_id === "string" ? data.task_component_output_id : null
            const existingBlocks = getOutputBlocks(existing ?? null)
            const existingHasBlocks = existingBlocks.length > 0
            const existingOutputId = existing?.task_component_output_id ?? null
            const hasFinalEventPreview =
              typeof data.task_component_id === "string" && finalComponentOutputPreviews.has(data.task_component_id)
            const shouldSkipStaleBootstrap =
              !incomingOutputId
              && !incomingHasBlocks
              && (
                (existingOutputId != null && existingHasBlocks)
                || hasFinalEventPreview
              )
            if (shouldSkipStaleBootstrap) continue
            newMap.set(
              outputKey,
              buildOutputRecord(existing, {
                content: normalizedBootstrapContent.content,
                content_text: data.content_text,
                resolved_content_json:
                  normalizedBootstrapContent.resolved_content_json,
                content_json:
                  normalizedBootstrapContent.content_json,
                attachment_map: normalizeAttachmentMap((data as any).attachment_map),
                updated_at: data.updated_at,
                task_component_output_id: data.task_component_output_id,
                attachments: normalizedAttachments,
                comment_thread_count: data.comment_thread_count ?? 0,
                open_comment_thread_count: data.open_comment_thread_count ?? 0,
              })
            )
          }
          return newMap
        })
      } else {
        await channelBootstrapQuery.refetch()
      }
    } catch (err: any) {
      console.error('Failed to fetch component output:', err)
    } finally {
      if (loadingKey != null) {
        loadingOutputsRef.current.delete(loadingKey)
        setLoadingOutputs(prev => {
          const newSet = new Set(prev)
          newSet.delete(loadingKey)
          return newSet
        })
      }
    }
  }, [selectedChannelId, components, channelBootstrapQuery.data?.composed_output, channelBootstrapQuery.refetch, finalComponentOutputPreviews])
  const fetchComponentOutputRef = useRef(fetchComponentOutput)
  useEffect(() => {
    fetchComponentOutputRef.current = fetchComponentOutput
  }, [fetchComponentOutput])

  const debouncedReconcileComponentQueries = useMemo(
    () =>
      debounce(() => {
        if (!selectedChannelId) return
        void queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(taskId, selectedChannelId)] })
      }, 700),
    [queryClient, taskId, selectedChannelId]
  )

  useEffect(() => {
    return () => {
      debouncedReconcileComponentQueries.cancel()
    }
  }, [debouncedReconcileComponentQueries])

  // Realtime only patches task_component_outputs rows; normal loading remains RPC-based
  useTaskComponentOutputsRealtime({
    taskId: taskId ?? null,
    channelId: selectedChannelId ?? null,
    enabled: canLoad && !!taskId && !!selectedChannelId,
    onChange: useCallback((row: TaskComponentOutputRow, event: TaskComponentOutputChangeEvent) => {
      const outputKeys = getOutputMapKeysForRow({
        taskComponentId: row.task_component_id,
        briefingComponentId: row.briefing_component_id,
      })
      if (outputKeys.length === 0) return

      setComponentOutputs((prev) => {
        const next = new Map(prev)
        if (event === 'DELETE') {
          outputKeys.forEach((k) => next.delete(k))
        } else {
          outputKeys.forEach((k) => {
            if (shouldPreserveLocalOutput(k)) return
            next.set(
              k,
              buildOutputRecord(next.get(k), {
                content_text: row.content_text,
                resolved_content_json: normalizeOutputContentJson((row as any).resolved_content_json),
                content_json: normalizeOutputContentJson((row as any).content_json),
                updated_at: row.updated_at,
              })
            )
          })
        }
        return next
      })
      const hasContent = typeof row.content_text === 'string' && row.content_text.trim().length > 0
      let loadingKey: number | null = typeof row.briefing_component_id === 'number' ? row.briefing_component_id : null
      let clearedGenerating = false
      let clearedLoading = false
      const generatingKey = row.task_component_id ? getGeneratingKeyFromTaskComponentId(row.task_component_id as string) : null
      const wasGeneratingBeforeRealtime = !!(generatingKey && generatingComponentKeys.has(generatingKey))

      if (event !== 'DELETE' && row.task_component_id && hasContent) {
        setInFlightComponentGenerations((prev) => {
          if (!prev.has(row.task_component_id as string)) return prev
          const next = new Map(prev)
          next.delete(row.task_component_id as string)
          console.debug('[TaskContentTab] stream reconciled with persisted output', {
            taskComponentId: row.task_component_id,
            event,
          })
          return next
        })
        setGeneratingComponentKeys((prev) => {
          const hadKey = !!(generatingKey && prev.has(generatingKey))
          const next = new Set(prev)
          if (generatingKey) next.delete(generatingKey)
          console.log('[TaskContentTab] clear generating key', {
            taskComponentId: row.task_component_id,
            generatingKey,
            hadKeyBefore: hadKey,
            hasKeyAfter: !!(generatingKey && next.has(generatingKey)),
            returnedNewReference: next !== prev,
            hasContent,
          })
          return next
        })
        clearedGenerating = true
      }
      if (loadingKey == null && row.task_component_id) {
        const matched = components.find((c) => c.task_component_id === row.task_component_id)
        loadingKey = matched?.briefing_component_id ?? matched?.project_component_id ?? null
      }
      if (event !== 'DELETE' && loadingKey != null && hasContent) {
        const hadLoadingKey = loadingOutputsRef.current.has(loadingKey)
        loadingOutputsRef.current.delete(loadingKey)
        setLoadingOutputs((prev) => {
          const hadInState = prev.has(loadingKey as number)
          const next = new Set(prev)
          next.delete(loadingKey as number)
          console.log('[TaskContentTab] clear loading key', {
            loadingKey,
            hadInRefBefore: hadLoadingKey,
            hadInStateBefore: hadInState,
            hasInStateAfter: next.has(loadingKey as number),
            returnedNewReference: next !== prev,
            hasContent,
          })
          return next
        })
        if (loadingKey === MAIN_BRIEFING_COMPONENT_ID) setIsGeneratingMainOutput(false)
        clearedLoading = true
      }
      if (event !== 'DELETE' && hasContent && loadingKey != null && wasGeneratingBeforeRealtime) {
        setAutoExpandComponentId(loadingKey)
      }
      console.log('[TaskContentTab] realtime output processed', {
        event,
        outputKeys,
        taskComponentId: row.task_component_id ?? null,
        briefingComponentId: row.briefing_component_id ?? null,
        hasContent,
        clearedGenerating,
        clearedLoading,
      })
      debouncedReconcileComponentQueries()
    }, [components, debouncedReconcileComponentQueries, generatingComponentKeys, shouldPreserveLocalOutput]),
  })
  
  useEffect(() => {
    const seo = channelBootstrapQuery.data?.seo
    if (!selectedChannelId || !seo) return

    const eff = seo.effective
    const ov = seo.override
    const secRaw = ov?.secondary_keywords
    const secondary = Array.isArray(secRaw)
      ? secRaw.map((s) => String(s))
      : typeof secRaw === "string"
        ? parseKeywordTokens(secRaw)
        : []

    setSeoData({
      seo_required: !!(eff?.seo_required ?? false),
      seo_source: eff?.seo_source ?? null,
      primary_keyword: ov?.primary_keyword ?? null,
      secondary_keywords: secondary,
    })

    const variantSEO: CTTVariantSEO = {
      ctt_id: "",
      channel_id: selectedChannelId,
      language_id: languageId || 0,
      primary_keyword: ov?.primary_keyword ?? null,
      secondary_keywords: secRaw ?? null,
      seo_required_override: ov?.seo_required_override ?? null,
      updated_at: null,
      seo_required: !!(eff?.seo_required ?? false),
      seo_source: eff?.seo_source ?? null,
    }
    setVariantSEOData(variantSEO)
    hasHydratedSeoStateRef.current = true
  }, [channelBootstrapQuery.data?.seo, selectedChannelId, languageId])

  useEffect(() => {
    if (!channelBootstrapQuery.data?.seo) {
      hasHydratedSeoStateRef.current = false
    }
  }, [taskId, selectedChannelId, channelBootstrapQuery.data?.seo])

  useEffect(() => {
    if (!taskId || !selectedChannelId) {
      setPersistedTaskChannelSeoKeywords(null)
      return
    }
    let isCancelled = false
    const loadPersistedChannelSeoKeywords = async () => {
      const [seoResult, metricsResult] = await Promise.all([
        supabase
          .from("task_channel_seo")
          .select("primary_keyword, secondary_keywords")
          .eq("task_id", taskId)
          .eq("channel_id", selectedChannelId)
          .maybeSingle(),
        supabase.rpc("get_task_channel_keywords_with_metrics", {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
        }),
      ])
      if (isCancelled) return
      if (seoResult.error) {
        console.error("Failed to load task channel SEO keywords:", seoResult.error)
      }
      if (metricsResult.error) {
        console.error("Failed to load task channel keyword metrics:", metricsResult.error)
      }

      const seoRow = seoResult.data
      const primaryKeyword = typeof seoRow?.primary_keyword === "string" ? seoRow.primary_keyword.trim() : ""
      const secondaryFromSeo = Array.isArray(seoRow?.secondary_keywords)
        ? seoRow.secondary_keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
        : typeof seoRow?.secondary_keywords === "string"
          ? parseKeywordTokensFromRaw(seoRow.secondary_keywords)
          : []
      const keywordsFromMetrics = dedupeKeywordsCaseInsensitive(
        (Array.isArray(metricsResult.data) ? metricsResult.data : [])
          .map((row) => String((row as { keyword?: string | null }).keyword ?? "").trim())
          .filter(Boolean),
      )
      const mergedKeywords = keywordsFromMetrics.length > 0
        ? keywordsFromMetrics
        : dedupeKeywordsCaseInsensitive(primaryKeyword ? [primaryKeyword, ...secondaryFromSeo] : secondaryFromSeo)

      if (mergedKeywords.length === 0) {
        setPersistedTaskChannelSeoKeywords(null)
        return
      }

      const resolvedPrimary = primaryKeyword || mergedKeywords[0] || ""
      const resolvedSecondary = mergedKeywords.filter(
        (keyword) => keyword.toLowerCase() !== resolvedPrimary.toLowerCase(),
      )
      setPersistedTaskChannelSeoKeywords({
        primaryKeyword: resolvedPrimary,
        secondaryKeywords: resolvedSecondary,
      })
    }
    void loadPersistedChannelSeoKeywords()
    return () => {
      isCancelled = true
    }
  }, [taskId, selectedChannelId, supabase])
  
  // Add channel
  const handleAddChannel = async (channelId: number) => {
    const previousChannels = channels
    const previousAvailableChannels = availableChannels
    const previousSelectedChannelId = selectedChannelId

    try {
      const channelMeta = availableChannels.find((c) => c.channel_id === channelId) ?? null

      // Optimistic UI: add channel pill immediately
      if (channelMeta) {
        setChannels((prev) => {
          if (prev.some((c) => c.channel_id === channelId)) return prev
          return [...prev, channelMeta].sort((a, b) => a.name.localeCompare(b.name))
        })
        setAvailableChannels((prev) => prev.filter((c) => c.channel_id !== channelId))
      }

      // Insert into task_channels
      const { error: insertError } = await supabase
        .from('task_channels')
        .insert({
          task_id: taskId,
          channel_id: channelId
        })
      
      if (insertError) throw insertError

      // Select the newly added channel
      setSelectedChannelId(channelId)
      onChannelChange?.(channelId)
      
      // Ensure default briefing type components load immediately (no user toggle required)
      if (projectId && contentTypeId) {
        const { data, error } = await supabase.rpc('project_channel_briefing_types', {
          p_project_id: projectId,
          p_content_type_id: contentTypeId,
          p_channel_id: channelId
        })

        if (!error) {
          let effectiveId: number | null = null
          ;(data || []).forEach((row: any) => {
            if (row.effective_default_briefing_type_id && typeof row.effective_default_briefing_type_id === 'number') {
              effectiveId = row.effective_default_briefing_type_id
            }
          })

          if (effectiveId) {
            const { error: setBriefingError } = await supabase.rpc('tc_set_briefing_mode', {
              p_task_id: taskId,
              p_channel_id: channelId,
              p_briefing_type_id: effectiveId,
              p_disable_briefing: false
            })
            if (setBriefingError) throw setBriefingError
            await runBriefingGenerationPlan(channelId)
            setIsNoBriefing(false)
          }
        }
      }

      fetchAvailableChannels()
      await refreshAllComponentLists(channelId)
      
      toast({
        title: 'Channel added',
        description: 'Channel has been added and briefing initialized.'
      })
    } catch (err: any) {
      // Roll back optimistic UI
      setChannels(previousChannels)
      setAvailableChannels(previousAvailableChannels)
      setSelectedChannelId(previousSelectedChannelId)
      onChannelChange?.(previousSelectedChannelId)

      console.error('Failed to add channel:', err)
      toast({
        title: 'Failed to add channel',
        description: err.message,
        variant: 'destructive'
      })
    }
  }
  
  // Remove channel
  const handleRemoveChannel = async (channelId: number) => {
    const previousChannels = channels
    const previousSelectedChannelId = selectedChannelId

    try {
      setRemovingChannelIds((prev) => new Set(prev).add(channelId))

      const remainingChannels = channels.filter((c) => c.channel_id !== channelId)
      const nextActiveChannelId =
        selectedChannelId === channelId ? (remainingChannels[0]?.channel_id ?? null) : selectedChannelId

      // Optimistic UI: update channel pills immediately
      setChannels(remainingChannels)
      if (selectedChannelId === channelId) {
        setSelectedChannelId(nextActiveChannelId)
        onChannelChange?.(nextActiveChannelId)
      }

      const { error } = await supabase
        .from('task_channels')
        .delete()
        .eq('task_id', taskId)
        .eq('channel_id', channelId)
      
      if (error) throw error

      void fetchAvailableChannels(undefined, remainingChannels)

      toast({
        title: 'Channel removed',
        description: 'Channel has been removed.'
      })
    } catch (err: any) {
      // Roll back optimistic UI
      setChannels(previousChannels)
      setSelectedChannelId(previousSelectedChannelId)
      onChannelChange?.(previousSelectedChannelId)

      console.error('Failed to remove channel:', err)
      toast({
        title: 'Failed to remove channel',
        description: err.message,
        variant: 'destructive'
      })
    } finally {
      setRemovingChannelIds((prev) => {
        const next = new Set(prev)
        next.delete(channelId)
        return next
      })
    }
  }
  
  // Handle briefing type change
  const handleBriefingTypeChange = async (briefingTypeId: number | null) => {
    if (!selectedChannelId || briefingTypeId == null) return
    // Never run while bootstrap is hydrating: changing the briefing type is a user action only.
    if (isHydratingTaskChannelRef.current) return

    const channelId = selectedChannelId
    setOptimisticBriefing({
      channelId,
      explicitBriefingTypeId: briefingTypeId,
      disableBriefing: false,
    })
    setIsNoBriefing(false)

    try {
      const selectedOption = briefingTypeOptions.find((option) => option.id === briefingTypeId)
      await ensureTaskChannelSnapshotOnce({
        taskId,
        channelId: selectedChannelId,
        changeSource: "manual_before_edit",
        changeSummary: `Before changing briefing type: ${selectedOption?.title?.trim() || "Briefing"}`,
      })

      const didAddToChannel =
        !!selectedOption &&
        !!projectId &&
        !!contentTypeId &&
        (await ensureBriefingTypeAssignedToChannel({
          supabase,
          projectId,
          contentTypeId,
          channelId: selectedChannelId,
          option: selectedOption,
        }))

      if (didAddToChannel) {
        await fetchChannelBriefingTypes()
        await queryClient.invalidateQueries({ queryKey: ['project_channel_briefing_types', projectId] })
      }

      const { error } = await supabase.rpc('tc_set_briefing_mode', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: briefingTypeId,
        p_disable_briefing: false,
      })

      if (error) throw error

      setIsNoBriefing(false)

      // Changing the briefing type updates the selected type only. Components are re-hydrated from
      // task-channel-bootstrap; AI generation never runs here (only via the "Generate with AI" button).
      await queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(taskId, channelId)] })
      void refreshAllComponentLists(channelId)

      toast({
        title: 'Briefing type updated',
        description: 'Briefing type set. Use "Generate with AI" to generate components.',
      })
    } catch (err: any) {
      setOptimisticBriefing(null)
      void queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(taskId, channelId)] })
      console.error('Failed to update briefing type:', err)
      toast({
        title: 'Failed to update briefing type',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  /** Explicit AI generation for the current task-channel. The only path that calls generate_components_for_briefing. */
  const runGenerateWithAi = useCallback(
    async (channelId: number) => {
      setIsGeneratingWithAi(true)
      try {
        await saveChannelSnapshotBeforeAiEdit({
          taskId,
          channelId,
          changeSummary: "Before regenerate all",
        })
        await runBriefingGenerationPlan(channelId)
        await queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(taskId, channelId)] })
        void refreshAllComponentLists(channelId)
      } catch (err: any) {
        console.error('Failed to generate components with AI:', err)
        toast({
          title: 'Failed to generate with AI',
          description: err?.message ?? 'Unknown error',
          variant: 'destructive',
        })
      } finally {
        setIsGeneratingWithAi(false)
      }
    },
    [runBriefingGenerationPlan, queryClient, taskId, refreshAllComponentLists],
  )

  /**
   * Count of existing composed-output rows for the *currently selected* channel, sourced from
   * task-channel-bootstrap. Drives the "Generate with AI" replace-confirmation: existing generated
   * or edited content is represented as composed_output rows, so a non-empty list means generating
   * again could overwrite content and must be confirmed first.
   */
  const composedOutputCount = useMemo(() => {
    const data = channelBootstrapQuery.data
    if (!data || data.channel_id !== selectedChannelId) return 0
    return Array.isArray(data.composed_output) ? data.composed_output.length : 0
  }, [channelBootstrapQuery.data, selectedChannelId])

  /** Generate-with-AI button click: confirm first only when existing composed output could be replaced. */
  const handleGenerateWithAiClick = useCallback(() => {
    if (!selectedChannelId) return
    if (composedOutputCount > 0) {
      setConfirmGenerateWithAi({ channelId: selectedChannelId })
      return
    }
    void runGenerateWithAi(selectedChannelId)
  }, [selectedChannelId, composedOutputCount, runGenerateWithAi])

  const openChannelComponentVersionHistory = useCallback((filterTaskComponentId?: string | null) => {
    setComponentVersionHistoryFilterId(filterTaskComponentId?.trim() || null)
    setIsComponentVersionHistoryOpen(true)
  }, [])

  const handleOpenComponentVersionHistory = useCallback(
    (component: TaskChannelComponent, _outputRow: TaskComponentOutput | null) => {
      openChannelComponentVersionHistory(component.task_component_id ?? null)
    },
    [openChannelComponentVersionHistory],
  )

  const versionHistoryComponentOptions = useMemo(() => {
    return focusedSelectedComponents
      .map((component) => {
        const output = getOutputForComponent(componentOutputs, component)
        const outputId = output?.task_component_output_id
        if (!outputId) return null
        return {
          taskComponentId: component.task_component_id ?? null,
          taskComponentOutputId: outputId,
          title: getComponentOutputDisplayTitle(component),
          currentContentText: output?.content_text ?? null,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
  }, [componentOutputs, focusedSelectedComponents])

  const isAnyOutputSaving = useMemo(() => {
    for (const saving of isSavingOutput.values()) {
      if (saving) return true
    }
    return false
  }, [isSavingOutput])

  const channelLastSavedLabel = useMemo(() => {
    if (!focusedWorkspaceLatestUpdatedAt) return null
    return formatCompactRelativeTime(focusedWorkspaceLatestUpdatedAt)
  }, [focusedWorkspaceLatestUpdatedAt])

  const handleComponentVersionRestored = useCallback(
    (restored: RolledBackTaskComponentOutput) => {
      setComponentOutputs((prev) => {
        const next = new Map(prev)
        let patchedKey: string | null = null
        next.forEach((row, key) => {
          if (patchedKey != null || row.task_component_output_id !== restored.id) return
          patchedKey = key
          next.set(
            key,
            buildOutputRecord(row, {
              content_text: restored.content_text,
              content_json: (restored.content_json as OutputContentBlock[] | null) ?? null,
              content: (restored.content_json as OutputContentBlock[] | null) ?? null,
              resolved_content_json: (restored.content_json as OutputContentBlock[] | null) ?? null,
              updated_at: restored.updated_at,
            }),
          )
        })
        return next
      })
      if (selectedChannelId != null) {
        void queryClient.refetchQueries({
          queryKey: [...taskChannelBootstrapQueryKey(taskId, selectedChannelId)],
          type: "active",
        })
      }
    },
    [queryClient, selectedChannelId, taskId],
  )

  const handleChannelContentRestored = useCallback(() => {
    if (selectedChannelId == null) return
    void queryClient.refetchQueries({
      queryKey: [...taskChannelBootstrapQueryKey(taskId, selectedChannelId)],
      type: "active",
    })
    void refreshAllComponentLists(selectedChannelId)
  }, [queryClient, refreshAllComponentLists, selectedChannelId, taskId])

  /** Check pending title/description overrides and show confirm modal; called on blur of briefing title or description. */
  const maybeConfirmBriefingMetaUpdate = useCallback(
    (effectiveId: number) => {
      const active = briefingTypeOptions.find((t) => t.id === effectiveId)
      const oldTitle = active?.title ?? ''
      const oldDescription = active?.description ?? ''
      const newTitle = (briefingTitleOverrides[effectiveId] ?? oldTitle).trim()
      const newDescription = (briefingDescriptionOverrides[effectiveId] ?? oldDescription).trim()
      if (newTitle === oldTitle && newDescription === (oldDescription ?? '')) return
      setConfirmBriefingMetaUpdate({
        briefingTypeId: effectiveId,
        oldTitle,
        oldDescription: oldDescription ?? '',
        newTitle,
        newDescription,
      })
    },
    [briefingTypeOptions, briefingTitleOverrides, briefingDescriptionOverrides]
  )

  const handleConfirmBriefingMetaUpdate = useCallback(async () => {
    if (!projectId || !confirmBriefingMetaUpdate) return
    const { briefingTypeId, newTitle, newDescription } = confirmBriefingMetaUpdate
    try {
      const { error } = await supabase.rpc('pbt_update_meta', {
        p_project_id: projectId,
        p_briefing_type_id: briefingTypeId,
        p_custom_title: newTitle || null,
        p_custom_description: newDescription || null,
      })
      if (error) throw error
      setBriefingTypeOptions((prev) =>
        prev.map((t) =>
          t.id === briefingTypeId ? { ...t, title: newTitle, description: newDescription || null } : t
        )
      )
      setBriefingTitleOverrides((prev) => {
        const next = { ...prev }
        delete next[briefingTypeId]
        return next
      })
      setBriefingDescriptionOverrides((prev) => {
        const next = { ...prev }
        delete next[briefingTypeId]
        return next
      })
      setConfirmBriefingMetaUpdate(null)
      await fetchChannelBriefingTypes()
      queryClient.invalidateQueries({ queryKey: ['projectBriefings', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project_channel_briefing_types', projectId] })
      toast({ title: 'Briefing template updated', description: 'Title and description saved for the project.' })
    } catch (err: any) {
      console.error('Failed to update briefing meta:', err)
      toast({
        title: 'Failed to update briefing template',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      })
    }
  }, [projectId, confirmBriefingMetaUpdate, supabase, fetchChannelBriefingTypes, queryClient])

  const commitInlineBriefingTitle = useCallback(async () => {
    if (suppressInlineBriefingTitleCommitRef.current) {
      suppressInlineBriefingTitleCommitRef.current = false
      return
    }
    const id = inlineBriefingTitleEditId
    if (id == null || !projectId || !selectedChannelId) return
    const active = briefingTypeOptions.find((t) => t.id === id)
    const desc = (briefingDescriptionOverrides[id] ?? active?.description ?? '').trim()
    const newTitle = inlineBriefingTitleDraft.trim()
    const oldTitle = (active?.title ?? '').trim()
    if (newTitle === oldTitle) {
      setInlineBriefingTitleEditId(null)
      return
    }
    try {
      const { error } = await supabase.rpc('pbt_update_meta', {
        p_project_id: projectId,
        p_briefing_type_id: id,
        p_custom_title: newTitle || null,
        p_custom_description: desc || null,
      })
      if (error) throw error
      setBriefingTypeOptions((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title: newTitle, description: desc || null } : t)),
      )
      setBriefingTitleOverrides((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setInlineBriefingTitleEditId(null)
      await fetchChannelBriefingTypes()
      queryClient.invalidateQueries({ queryKey: ['projectBriefings', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project_channel_briefing_types', projectId] })
      queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(taskId, selectedChannelId)] })
      toast({ title: 'Briefing title updated' })
    } catch (err: any) {
      console.error('Failed to update briefing title:', err)
      toast({
        title: 'Failed to update briefing title',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      })
    }
  }, [
    inlineBriefingTitleEditId,
    inlineBriefingTitleDraft,
    projectId,
    selectedChannelId,
    briefingTypeOptions,
    briefingDescriptionOverrides,
    supabase,
    fetchChannelBriefingTypes,
    queryClient,
    taskId,
  ])

  const cancelInlineBriefingTitle = useCallback(() => {
    suppressInlineBriefingTitleCommitRef.current = true
    setInlineBriefingTitleEditId(null)
  }, [])

  // Handle clearing briefing (set to "No briefing" mode)
  const handleClearBriefing = async () => {
    if (!selectedChannelId) return

    const channelId = selectedChannelId
    setOptimisticBriefing({
      channelId,
      explicitBriefingTypeId: null,
      disableBriefing: true,
    })
    setSelectedBriefingTypeId(null)
    setIsNoBriefing(true)
    mainLoadedRef.current.delete(channelId)

    try {
      await ensureTaskChannelSnapshotOnce({
        taskId,
        channelId,
        changeSource: "manual_before_edit",
        changeSummary: "Before changing briefing type: No briefing",
      })

      const { error } = await supabase.rpc('tc_set_briefing_mode', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: null,
        p_disable_briefing: true,
      })

      if (error) throw error

      await queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(taskId, channelId)] })
      await refreshAllComponentLists(channelId)
      await fetchComponentOutput({ briefingComponentId: MAIN_BRIEFING_COMPONENT_ID })

      toast({
        title: 'Briefing cleared',
        description: 'Main content editor is now active.',
      })
    } catch (err: any) {
      setOptimisticBriefing(null)
      void queryClient.invalidateQueries({ queryKey: [...taskChannelBootstrapQueryKey(taskId, channelId)] })
      console.error('Failed to clear briefing:', err)
      toast({
        title: 'Failed to clear briefing',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  /** Create new briefing (pbt_create_custom → pcctb_add → tc_set_briefing), then refetch and select. */
  const createBriefingTitleRef = useRef(createBriefingTitle)
  const createBriefingDescriptionRef = useRef(createBriefingDescription)
  createBriefingTitleRef.current = createBriefingTitle
  createBriefingDescriptionRef.current = createBriefingDescription

  const handleCreateBriefingSubmit = useCallback(async () => {
    const title = createBriefingTitleRef.current.trim()
    if (!title) return
    if (!projectId || !contentTypeId || !selectedChannelId) {
      toast({ title: 'Missing context', description: 'Project, content type, and channel are required.', variant: 'destructive' })
      return
    }
    setIsCreatingBriefing(true)
    try {
      const desc = createBriefingDescriptionRef.current.trim() || null
      const { data: createData, error: createError } = await supabase.rpc('pbt_create_custom', {
        p_project_id: projectId,
        p_title: title,
        p_description: desc,
      })
      if (createError) throw createError
      const briefingTypeId = typeof createData === 'number' ? createData : (createData as any)?.briefing_type_id ?? (Array.isArray(createData) && createData[0] != null ? (createData[0] as any).id ?? (createData[0] as any).briefing_type_id : null)
      if (briefingTypeId == null || typeof briefingTypeId !== 'number') {
        throw new Error('Create briefing did not return a briefing type id')
      }

      const { error: setError } = await supabase.rpc('pcctb_add', {
        p_project_id: projectId,
        p_content_type_id: contentTypeId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: briefingTypeId,
      })
      if (setError) throw setError

      const { error: taskError } = await supabase.rpc('tc_set_briefing', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_briefing_type_id: briefingTypeId,
      })
      if (taskError) throw taskError
      await runBriefingGenerationPlan(selectedChannelId)

      await fetchChannelBriefingTypes()
      setIsNoBriefing(false)
      await refreshComponents()
      await refreshAvailableComponents()

      setIsCreateBriefingOpen(false)
      setCreateBriefingTitle('')
      setCreateBriefingDescription('')
      toast({
        title: 'Briefing created',
        description: 'New briefing is applied to this channel and task. Components list has been refreshed.',
      })
    } catch (err: any) {
      console.error('Failed to create briefing:', err)
      toast({
        title: 'Failed to create briefing',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsCreatingBriefing(false)
    }
  }, [
    projectId,
    contentTypeId,
    selectedChannelId,
    taskId,
    supabase,
    fetchChannelBriefingTypes,
    runBriefingGenerationPlan,
    refreshComponents,
    refreshAvailableComponents,
  ])

  const applyOptimisticComponentRemoval = useCallback((
    row: TaskChannelComponent,
    options?: { purgeFromBootstrap?: boolean },
  ): ComponentRemovalRollback | null => {
    const taskComponentId = row.task_component_id
    if (!taskComponentId || !selectedChannelId) return null

    const outputKeys = getOutputMapKeysForRow({
      taskComponentId,
      briefingComponentId: row.briefing_component_id,
    })
    const bootstrapKey = [...taskChannelBootstrapQueryKey(taskId, selectedChannelId)]
    const generatingKey = getGeneratingKeyFromTaskComponentId(taskComponentId)

    const rollback: ComponentRemovalRollback = {
      components: [...components],
      removedComponents: [...removedComponents],
      componentOutputs: new Map(componentOutputs),
      outputValues: outputKeys.map((key) => [key, outputValuesRef.current.get(key) ?? ""]),
      outputJsonValues: outputKeys.map((key) => [key, outputJsonValuesRef.current.get(key) ?? []]),
      inFlightComponentGenerations: new Map(inFlightComponentGenerations),
      generatingComponentKeys: new Set(generatingComponentKeys),
      finalComponentOutputPreviews: new Map(finalComponentOutputPreviews),
      bootstrapSnapshot: queryClient.getQueryData<TaskChannelBootstrapResponse>(bootstrapKey),
    }

    activeInteractiveStreamIdsRef.current.delete(taskComponentId)
    briefingStreamTaskComponentIdsRef.current.delete(taskComponentId)
    setGeneratingComponentKeys((prev) => {
      if (!prev.has(generatingKey)) return prev
      const next = new Set(prev)
      next.delete(generatingKey)
      return next
    })
    useComponentEditStreamStore.getState().clearStream(
      componentEditStreamKey(taskId, selectedChannelId, taskComponentId),
    )

    setComponents((prev) => prev.filter((component) => component.task_component_id !== taskComponentId))
    if (options?.purgeFromBootstrap) {
      setRemovedComponents((prev) => prev.filter((component) => component.task_component_id !== taskComponentId))
    }

    setComponentOutputs((prev) => {
      const next = new Map(prev)
      for (const key of outputKeys) {
        next.delete(key)
        outputValuesRef.current.delete(key)
        outputJsonValuesRef.current.delete(key)
      }
      return next
    })
    setInFlightComponentGenerations((prev) => {
      const next = new Map(prev)
      next.delete(taskComponentId)
      return next
    })
    setFinalComponentOutputPreviews((prev) => {
      const next = new Map(prev)
      next.delete(taskComponentId)
      return next
    })

    queryClient.setQueryData<TaskChannelBootstrapResponse | undefined>(bootstrapKey, (old) => {
      if (!old) return old
      return {
        ...old,
        components: options?.purgeFromBootstrap
          ? old.components.filter((component) => component.task_component_id !== taskComponentId)
          : old.components.map((component) =>
              component.task_component_id === taskComponentId
                ? { ...component, selected: false }
                : component,
            ),
        composed_output: old.composed_output.filter(
          (outputRow) => outputRow.task_component_id !== taskComponentId,
        ),
      }
    })

    const chatComponentId = searchParams.get("chatComponentId")
    const shouldClearAiSelection =
      chatComponentId === taskComponentId
      || lastSelectedAiTaskComponentIdRef.current === taskComponentId
    if (shouldClearAiSelection) {
      if (chatComponentId === taskComponentId) {
        const next = new URLSearchParams(searchParams.toString())
        next.delete("chatComponentId")
        shallowReplaceSearchParams(pathname, next, "component-removed")
      }
      lastSelectedAiTaskComponentIdRef.current = null
      onActiveFieldChange?.({
        fieldType: "task",
        label: "Task",
        instructions: null,
        selectedContextType: "task",
      })
    }

    return rollback
  }, [
    components,
    removedComponents,
    componentOutputs,
    inFlightComponentGenerations,
    generatingComponentKeys,
    finalComponentOutputPreviews,
    onActiveFieldChange,
    pathname,
    queryClient,
    searchParams,
    selectedChannelId,
    taskId,
  ])

  const restoreComponentRemovalRollback = useCallback((rollback: ComponentRemovalRollback | null) => {
    if (!rollback || !selectedChannelId) return

    setComponents(rollback.components)
    setRemovedComponents(rollback.removedComponents)
    setComponentOutputs(rollback.componentOutputs)
    for (const [key, value] of rollback.outputValues) {
      if (value) outputValuesRef.current.set(key, value)
      else outputValuesRef.current.delete(key)
    }
    for (const [key, value] of rollback.outputJsonValues) {
      if (value.length > 0) outputJsonValuesRef.current.set(key, value)
      else outputJsonValuesRef.current.delete(key)
    }
    setInFlightComponentGenerations(rollback.inFlightComponentGenerations)
    setGeneratingComponentKeys(rollback.generatingComponentKeys)
    setFinalComponentOutputPreviews(rollback.finalComponentOutputPreviews)

    const bootstrapKey = [...taskChannelBootstrapQueryKey(taskId, selectedChannelId)]
    queryClient.setQueryData(bootstrapKey, rollback.bootstrapSnapshot)
  }, [queryClient, selectedChannelId, taskId])

  // Toggle component selection via tcc_set_component (p_selected true/false). Per-row loading only; list keeps placeholderData.
  const handleToggleComponent = async (
    row: TaskChannelComponent,
    checked: boolean
  ) => {
    if (!selectedChannelId) return

    if (!row.task_component_id) {
      toast({
        title: 'Cannot update component',
        description: 'This component is missing a task row.',
        variant: 'destructive',
      })
      return
    }

    const rowKey = row.component_key ?? getComponentKeyForSelectedRow(row) ?? ''
    const rollback = !checked ? applyOptimisticComponentRemoval(row) : null
    setTogglingComponentKey(rowKey)
    try {
      await ensureTaskChannelSnapshotOnce({
        taskId,
        channelId: selectedChannelId,
        changeSource: "manual_before_edit",
        changeSummary: checked
          ? `Before adding component: ${getComponentOutputDisplayTitle(row)}`
          : `Before removing component: ${getComponentOutputDisplayTitle(row)}`,
      })

      const { error } = await supabase.rpc('tcc_set_component', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_task_component_id: row.task_component_id,
        p_briefing_component_id: row.briefing_component_id ?? null,
        p_project_component_id: row.project_component_id ?? null,
        p_selected: checked,
        p_position: row.position ?? null,
        p_custom_title: row.custom_title ?? row.title ?? null,
        p_custom_description: row.custom_description ?? row.description ?? null,
      })
      if (error) throw error

      if (checked) {
        await refreshAllComponentLists()

        const componentIdForOutput = row.briefing_component_id || row.project_component_id
        const outputKeyForRow = getOutputMapKeyFromComponent(row)
        const saveTargetForRow = getOutputSaveTargetForComponent(row)
        const fallbackBriefingId = saveTargetForRow?.mode === 'briefing' ? saveTargetForRow.briefingComponentId : null
        if (checked && componentIdForOutput && (!outputKeyForRow || !componentOutputs.has(outputKeyForRow)) && !loadingOutputs.has(componentIdForOutput)) {
          await fetchComponentOutput({
            taskComponentId: row.task_component_id ?? null,
            briefingComponentId: fallbackBriefingId,
          })
        }
      } else {
        void refreshAllComponentLists()
      }
    } catch (err: any) {
      if (!checked) {
        restoreComponentRemovalRollback(rollback)
      }
      console.error('Failed to toggle component:', err)
      toast({
        title: 'Failed to update component',
        description: err.message,
        variant: 'destructive'
      })
    } finally {
      setTogglingComponentKey(null)
    }
  }
  
  const [addingAvailableKeys, setAddingAvailableKeys] = useState<Set<string>>(new Set())
  const [isRefreshingAiSuggestions, setIsRefreshingAiSuggestions] = useState(false)

  const handleAddAvailableComponent = async (
    item: TaskChannelAvailableComponent,
    options?: {
      customTitle?: string
      customDescription?: string
    }
  ) => {
    if (!selectedChannelId) return

    const itemKey = item.component_key ?? item.key
    try {
      setAddingAvailableKeys((prev) => new Set(prev).add(itemKey))

      const resolvedAddTitle =
        (options?.customTitle ?? "").trim()
        || (item.custom_title ?? "").trim()
        || (item.title ?? "").trim()
        || "Component"
      await ensureTaskChannelSnapshotOnce({
        taskId,
        channelId: selectedChannelId,
        changeSource: "manual_before_edit",
        changeSummary: `Before adding component: ${resolvedAddTitle}`,
      })

      const isAiSuggestion = item.kind === 'ai_suggestion' || item.tag === 'AI suggestions' || itemKey.startsWith('ai:')
      if (isAiSuggestion) {
        const suggestionId = parseAiSuggestionIdFromKey(itemKey)
        if (!suggestionId) {
          toast({
            title: 'Could not accept suggestion',
            description: 'Missing suggestion id.',
            variant: 'destructive',
          })
          return
        }
        const { data: acceptedData, error } = await supabase.rpc('accept_task_channel_component_suggestion', {
          p_suggestion_id: suggestionId,
        })
        if (error) throw error
        const acceptedTaskComponentId = tryExtractTaskComponentId(acceptedData)
        const acceptedObj = acceptedData && typeof acceptedData === 'object' ? (acceptedData as Record<string, unknown>) : null
        const titleFromAcceptedData =
          sanitizeSuggestionTitle(
            typeof acceptedObj?.title === 'string'
              ? acceptedObj.title
              : typeof acceptedObj?.custom_title === 'string'
                ? acceptedObj.custom_title
                : typeof acceptedObj?.suggestion_title === 'string'
                  ? acceptedObj.suggestion_title
                  : null
          )
        const resolvedSuggestionTitle =
          (options?.customTitle ?? '').trim()
          || titleFromAcceptedData
          || sanitizeSuggestionTitle(item.custom_title)
          || sanitizeSuggestionTitle(item.title)
          || null
        const resolvedSuggestionDescription =
          (options?.customDescription ?? '').trim()
          || (item.custom_description ?? '').trim()
          || (item.description ?? '').trim()
          || null

        if (acceptedTaskComponentId) {
          const { error: saveEditedFieldError } = await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: acceptedTaskComponentId,
            p_briefing_component_id: item.briefing_component_id ?? null,
            p_project_component_id: item.project_component_id ?? null,
            p_selected: true,
            p_position: (item as { position?: number | null }).position ?? null,
            p_custom_title: resolvedSuggestionTitle,
            p_custom_description: resolvedSuggestionDescription,
          })
          if (saveEditedFieldError) throw saveEditedFieldError
          expandAddedTaskComponent(acceptedTaskComponentId)
        }
      } else if (item.tag === 'Removed from task') {
        // Re-enable existing row only; never insert.
        if (!item.task_component_id) {
          toast({
            title: 'Could not re-add component',
            description: 'Missing task row id.',
            variant: 'destructive',
          })
          return
        }
        const { error } = await supabase
          .from('task_channel_components')
          .update({ selected: true })
          .eq('id', item.task_component_id)
        if (error) throw error
      } else {
        // Insert typed component row (never ad-hoc). Require kind + component_id.
        const componentId = item.component_id ?? (item.kind === 'global' ? item.briefing_component_id : item.kind === 'project' ? item.project_component_id : null)
        if (item.kind === 'global' && typeof componentId === 'number') {
          const insertPayload = {
            task_id: taskId,
            channel_id: selectedChannelId,
            briefing_component_id: componentId,
            selected: true,
            // Marks manual FE-managed generation so DB trigger can skip background autopilot run.
            generation_source: 'interactive_stream',
            custom_title: item.custom_title ?? item.title ?? null,
            custom_description: item.custom_description ?? item.description ?? null,
          }
          console.debug('[TaskContentTab] interactive insert payload', insertPayload)
          const { data: insertedRow, error } = await supabase
            .from('task_channel_components')
            .insert(insertPayload)
            .select('id, task_id, channel_id')
            .single()
          if (error) {
            if (error.code === '23505') {
              const { error: updateErr } = await supabase
                .from('task_channel_components')
                .update({ selected: true })
                .eq('task_id', taskId)
                .eq('channel_id', selectedChannelId)
                .eq('briefing_component_id', componentId)
              if (updateErr) throw updateErr
            } else throw error
          } else if (insertedRow?.id) {
            console.debug('[TaskContentTab] inserted component row', insertedRow)
            console.debug('[TaskContentTab] component insert success', {
              taskComponentId: insertedRow.id,
              taskId: insertedRow.task_id,
              channelId: insertedRow.channel_id,
              generationSource: insertPayload.generation_source,
              source: 'available_global_add',
            })
            expandAddedTaskComponent(insertedRow.id)
          }
        } else if (item.kind === 'project' && typeof componentId === 'number') {
          const insertPayload = {
            task_id: taskId,
            channel_id: selectedChannelId,
            project_component_id: componentId,
            selected: true,
            // Marks manual FE-managed generation so DB trigger can skip background autopilot run.
            generation_source: 'interactive_stream',
            custom_title: item.custom_title ?? item.title ?? null,
            custom_description: item.custom_description ?? item.description ?? null,
          }
          console.debug('[TaskContentTab] interactive insert payload', insertPayload)
          const { data: insertedRow, error } = await supabase
            .from('task_channel_components')
            .insert(insertPayload)
            .select('id, task_id, channel_id')
            .single()
          if (error) {
            if (error.code === '23505') {
              const { error: updateErr } = await supabase
                .from('task_channel_components')
                .update({ selected: true })
                .eq('task_id', taskId)
                .eq('channel_id', selectedChannelId)
                .eq('project_component_id', componentId)
              if (updateErr) throw updateErr
            } else throw error
          } else if (insertedRow?.id) {
            console.debug('[TaskContentTab] inserted component row', insertedRow)
            console.debug('[TaskContentTab] component insert success', {
              taskComponentId: insertedRow.id,
              taskId: insertedRow.task_id,
              channelId: insertedRow.channel_id,
              generationSource: insertPayload.generation_source,
              source: 'available_project_add',
            })
            expandAddedTaskComponent(insertedRow.id)
          }
        } else {
          toast({
            title: 'Cannot add component',
            description: 'This component cannot be added (missing type or id).',
            variant: 'destructive',
          })
          return
        }
      }

      await refreshAllComponentLists()
    } catch (err: any) {
      console.error('Failed to add component:', err)
      toast({
        title: 'Failed to add component',
        description: err.message,
        variant: 'destructive',
      })
      await refreshAllComponentLists()
    } finally {
      setAddingAvailableKeys((prev) => {
        const next = new Set(prev)
        next.delete(itemKey)
        return next
      })
    }
  }

  const persistVirtualMainContent = useCallback(
    async (text: string) => {
      if (!selectedChannelId || materializeVirtualMainOnFirstSaveRef.current) {
        if (materializeVirtualMainOnFirstSaveRef.current) {
          debouncedSaveOutput(getLegacyBriefingOutputTarget(MAIN_BRIEFING_COMPONENT_ID))
        }
        return
      }
      materializeVirtualMainOnFirstSaveRef.current = true
      try {
        await ensureTaskChannelSnapshotOnce({
          taskId,
          channelId: selectedChannelId,
          changeSource: "manual_before_edit",
          changeSummary: "Before creating Main content component",
        })
        const { data: newTaskComponentData, error: addErr } = await supabase.rpc('tcc_add_ad_hoc_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_title: 'Main content',
          p_description: null,
          p_position: null,
          p_generation_source: 'interactive_stream',
        })
        if (addErr) throw addErr
        let taskComponentId = tryExtractTaskComponentId(newTaskComponentData)
        if (taskComponentId) {
          expandAddedTaskComponent(taskComponentId)
          const saveTarget = getOutputSaveTargetForComponent({
            task_component_id: taskComponentId,
            briefing_component_id: null,
            project_component_id: null,
            kind: 'task_ad_hoc',
            origin: 'task',
          })
          if (saveTarget) {
            outputValuesRef.current.set(saveTarget.outputKey, text)
            debouncedSaveOutput(saveTarget)
          }
        } else {
          debouncedSaveOutput(getLegacyBriefingOutputTarget(MAIN_BRIEFING_COMPONENT_ID))
        }
        await refreshAllComponentLists()
      } catch (error) {
        materializeVirtualMainOnFirstSaveRef.current = false
        console.error('Failed to materialize Main content component', error)
        debouncedSaveOutput(getLegacyBriefingOutputTarget(MAIN_BRIEFING_COMPONENT_ID))
      }
    },
    [
      debouncedSaveOutput,
      expandAddedTaskComponent,
      refreshAllComponentLists,
      selectedChannelId,
      supabase,
      taskId,
    ],
  )

  const handleCreateDropdownComponent = useCallback(
    async (rawTitle: string, rawInstructions?: string) => {
      if (!selectedChannelId) return
      const title = rawTitle.trim()
      if (!title) return
      try {
        setIsCreatingDropdownComponent(true)
        await ensureTaskChannelSnapshotOnce({
          taskId,
          channelId: selectedChannelId,
          changeSource: "manual_before_edit",
          changeSummary: `Before adding component: ${title}`,
        })
        const generationPrompt = (rawInstructions ?? '').trim() || null
        const { data: newTaskComponentData, error: addErr } = await supabase.rpc('tcc_add_ad_hoc_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_title: title,
          p_description: generationPrompt,
          p_position: null,
          p_generation_source: 'interactive_stream',
        })
        if (addErr) throw addErr

        let taskComponentId = tryExtractTaskComponentId(newTaskComponentData)
        const briefingComponentId = typeof newTaskComponentData === 'number' ? newTaskComponentData : null
        if (!taskComponentId && briefingComponentId != null) {
          const { data: createdTaskRow } = await supabase
            .from('task_channel_components')
            .select('id')
            .eq('task_id', taskId)
            .eq('channel_id', selectedChannelId)
            .eq('briefing_component_id', briefingComponentId)
            .order('position', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()
          taskComponentId = createdTaskRow?.id ?? null
        }

        if (taskComponentId) {
          // Structural add only: the component starts with empty output. Users fill it in later
          // (manually or via "Build with AI") from the component card.
          expandAddedTaskComponent(taskComponentId)
        }

        await refreshComponents()
        await refreshAvailableComponents()
        fetchAvailableChannels()
        setIsAddComponentDropdownOpen(false)
        toast({ title: 'Component added', description: 'Ad-hoc component added to this task.' })
      } catch (err: any) {
        console.error('Failed to add component:', err)
        toast({
          title: 'Failed to add component',
          description: err?.message ?? 'An error occurred',
          variant: 'destructive',
        })
      } finally {
        setIsCreatingDropdownComponent(false)
      }
    },
    [
      fetchAvailableChannels,
      refreshAvailableComponents,
      refreshComponents,
      selectedChannelId,
      expandAddedTaskComponent,
      supabase,
      taskId,
    ]
  )

  // Duplicate an existing component within the same task + channel. Copies title + instructions,
  // leaves the output empty, and never calls AI. The copy opens expanded and editable.
  const handleDuplicateComponent = useCallback(
    async (source: TaskChannelComponent) => {
      if (!selectedChannelId) return
      const sourceTitle = (source.custom_title || source.title || 'Component').trim() || 'Component'
      const sourceInstructions = (source.custom_description || source.description || '').trim() || null
      const newTitle = computeDuplicateComponentTitle(sourceTitle, components)
      try {
        await ensureTaskChannelSnapshotOnce({
          taskId,
          channelId: selectedChannelId,
          changeSource: 'manual_before_edit',
          changeSummary: `Before duplicating component: ${sourceTitle}`,
        })
        const desiredPosition = typeof source.position === 'number' ? source.position + 1 : null
        const { data: newTaskComponentData, error: addErr } = await supabase.rpc('tcc_add_ad_hoc_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_title: newTitle,
          p_description: sourceInstructions,
          p_position: desiredPosition,
          p_generation_source: 'interactive_stream',
        })
        if (addErr) throw addErr

        let taskComponentId = tryExtractTaskComponentId(newTaskComponentData)
        const briefingComponentId = typeof newTaskComponentData === 'number' ? newTaskComponentData : null
        if (!taskComponentId && briefingComponentId != null) {
          const { data: createdTaskRow } = await supabase
            .from('task_channel_components')
            .select('id')
            .eq('task_id', taskId)
            .eq('channel_id', selectedChannelId)
            .eq('briefing_component_id', briefingComponentId)
            .order('position', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()
          taskComponentId = createdTaskRow?.id ?? null
        }

        if (taskComponentId) {
          expandAddedTaskComponent(taskComponentId)
        }

        await refreshComponents()
        await refreshAvailableComponents()
        fetchAvailableChannels()
        toast({ title: 'Component duplicated', description: `Created "${newTitle}".` })
      } catch (err: any) {
        console.error('Failed to duplicate component:', err)
        toast({
          title: 'Failed to duplicate component',
          description: err?.message ?? 'An error occurred',
          variant: 'destructive',
        })
      }
    },
    [
      components,
      selectedChannelId,
      taskId,
      supabase,
      expandAddedTaskComponent,
      refreshComponents,
      refreshAvailableComponents,
      fetchAvailableChannels,
    ]
  )

  const handleConfirmSelectedAvailableComponents = useCallback(async () => {
    if (isBulkAddingDropdownComponents) return
    if (!selectedChannelId) return
    if (selectedComponentIds.size === 0) return
    const selectedRows = filteredAvailableComponents.filter((item) => {
      const key = item.component_key ?? item.key
      return selectedComponentIds.has(key)
    })
    if (selectedRows.length === 0) return

    await ensureTaskChannelSnapshotOnce({
      taskId,
      channelId: selectedChannelId,
      changeSource: "manual_before_edit",
      changeSummary: `Before adding ${selectedRows.length} component${selectedRows.length === 1 ? "" : "s"}`,
    })

    const bulkEligibleRows: TaskChannelAvailableComponent[] = []
    const fallbackRows: TaskChannelAvailableComponent[] = []

    for (const item of selectedRows) {
      const isAiSuggestion = item.kind === 'ai_suggestion' || item.tag === 'AI suggestions' || item.component_key.startsWith('ai:')
      const isAdHoc = item.kind === 'task_ad_hoc' || item.component_key.startsWith('t:')
      const hasBriefingId = typeof item.briefing_component_id === 'number'
      const hasProjectId = typeof item.project_component_id === 'number'
      const hasExactlyOneId = (hasBriefingId && !hasProjectId) || (!hasBriefingId && hasProjectId)
      if (isAiSuggestion || isAdHoc || !hasExactlyOneId) {
        fallbackRows.push(item)
        continue
      }
      bulkEligibleRows.push(item)
    }

    const PG_INT_MAX = 2147483647
    const validExistingPositions = components
      .map((row) => row.position)
      .filter((pos): pos is number => Number.isInteger(pos) && pos! > 0 && pos! <= PG_INT_MAX)
    const maxCurrentPosition = validExistingPositions.length > 0 ? Math.max(...validExistingPositions) : 0
    const neededSlots = Math.max(1, bulkEligibleRows.length)
    const overflowCapBase = PG_INT_MAX - (neededSlots - 1)
    const selectedCountBase = components.filter((row) => row.selected).length + 1
    let nextPositionBase = maxCurrentPosition + 1
    if (nextPositionBase > overflowCapBase) {
      nextPositionBase = Math.min(selectedCountBase, overflowCapBase)
    }
    if (!Number.isFinite(nextPositionBase) || nextPositionBase < 1) nextPositionBase = 1

    setIsBulkAddingDropdownComponents(true)
    try {
      if (bulkEligibleRows.length > 0) {
        const p_items = bulkEligibleRows
          .map((item, index) => {
            const hasBriefingId = typeof item.briefing_component_id === 'number'
            const hasProjectId = typeof item.project_component_id === 'number'
            if (hasBriefingId && hasProjectId) return null
            if (!hasBriefingId && !hasProjectId) return null
            return {
              briefing_component_id: hasBriefingId ? item.briefing_component_id : null,
              project_component_id: hasProjectId ? item.project_component_id : null,
              position: nextPositionBase + index,
            }
          })
          .filter((entry): entry is { briefing_component_id: number | null; project_component_id: number | null; position: number } => !!entry)

        const { data: bulkData, error: bulkErr } = await supabase.rpc('tcc_set_components_bulk', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_items,
        })
        if (bulkErr) throw bulkErr

        const uniqueInsertedIds = extractBulkInsertedTaskComponentIds(bulkData)
        console.log("[bulk] inserted ids", uniqueInsertedIds)
        if (uniqueInsertedIds.length > 0) {
          expandAddedTaskComponent(uniqueInsertedIds[0])
        }
      }

      for (const item of fallbackRows) {
        await handleAddAvailableComponent(item)
      }

      setSelectedComponentIds(new Set())
      setIsAddComponentDropdownOpen(false)
      void refreshAllComponentLists()
    } finally {
      setIsBulkAddingDropdownComponents(false)
    }
  }, [
    isBulkAddingDropdownComponents,
    selectedChannelId,
    selectedComponentIds,
    filteredAvailableComponents,
    components,
    supabase,
    taskId,
    expandAddedTaskComponent,
    handleAddAvailableComponent,
    refreshAllComponentLists,
  ])

  const toggleDropdownComponentSelection = useCallback((key: string) => {
    setSelectedComponentIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleAddComponentDropdownKeyDown = useCallback(async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (addComponentDropdownMode === 'create') {
      if (event.key === 'Escape') {
        event.preventDefault()
        setAddComponentDropdownMode('select')
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        await handleCreateDropdownComponent(
          addComponentSearchQuery,
          addComponentCreateInstructions
        )
      }
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAddComponentHighlightedIndex((prev) => {
        if (addComponentDropdownRowsCount <= 0) return 0
        return (prev + 1) % addComponentDropdownRowsCount
      })
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setAddComponentHighlightedIndex((prev) => {
        if (addComponentDropdownRowsCount <= 0) return 0
        return (prev - 1 + addComponentDropdownRowsCount) % addComponentDropdownRowsCount
      })
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsAddComponentDropdownOpen(false)
      return
    }
    if (event.key !== 'Enter') return

    event.preventDefault()
    const createRowIndex = shouldShowCreateNewComponentRow ? filteredAvailableComponents.length : -1
    if (shouldShowCreateNewComponentRow && addComponentHighlightedIndex === createRowIndex) {
      setAddComponentCreateInstructions('')
      setAddComponentDropdownMode('create')
      return
    }
    if (selectedComponentIds.size > 0) {
      await handleConfirmSelectedAvailableComponents()
      return
    }
    const highlightedItem = filteredAvailableComponents[addComponentHighlightedIndex]
    if (highlightedItem) {
      toggleDropdownComponentSelection(highlightedItem.component_key ?? highlightedItem.key)
      return
    }
    if (shouldShowCreateNewComponentRow) {
      setAddComponentCreateInstructions('')
      setAddComponentDropdownMode('create')
    }
  }, [
    addComponentDropdownMode,
    addComponentCreateInstructions,
    addComponentDropdownRowsCount,
    addComponentHighlightedIndex,
    addComponentSearchQuery,
    filteredAvailableComponents,
    handleConfirmSelectedAvailableComponents,
    handleCreateDropdownComponent,
    selectedComponentIds.size,
    shouldShowCreateNewComponentRow,
    toggleDropdownComponentSelection,
  ])

  const handleDismissAiSuggestion = useCallback(
    async (item: TaskChannelAvailableComponent) => {
      const itemKey = item.component_key ?? item.key
      const suggestionId = parseAiSuggestionIdFromKey(itemKey)
      if (!suggestionId) {
        toast({
          title: 'Could not dismiss suggestion',
          description: 'Missing suggestion id.',
          variant: 'destructive',
        })
        return
      }
      try {
        setAddingAvailableKeys((prev) => new Set(prev).add(itemKey))
        const { error } = await supabase.rpc('dismiss_task_channel_component_suggestion', {
          p_suggestion_id: suggestionId,
        })
        if (error) {
          if (error.code === '42883') {
            toast({
              title: 'Dismiss not available yet',
              description: 'Backend dismiss RPC is not deployed yet.',
            })
            return
          }
          throw error
        }
        await refreshAvailableComponents()
        toast({
          title: 'Suggestion dismissed',
        })
      } catch (err: any) {
        console.error('Failed to dismiss suggestion:', err)
        toast({
          title: 'Failed to dismiss suggestion',
          description: err?.message ?? 'Unknown error',
          variant: 'destructive',
        })
      } finally {
        setAddingAvailableKeys((prev) => {
          const next = new Set(prev)
          next.delete(itemKey)
          return next
        })
      }
    },
    [supabase, refreshAvailableComponents]
  )

  const handleRefreshAiSuggestions = useCallback(async () => {
    if (!selectedChannelId) return
    try {
      setIsRefreshingAiSuggestions(true)
      const { error } = await supabase.functions.invoke('ai-task-component-suggestions-run', {
        body: {
          task_id: taskId,
          channel_id: selectedChannelId,
          force: true,
        },
      })
      if (error) throw error
      await refreshAllComponentLists()
      toast({
        title: 'AI suggestions refreshed',
      })
    } catch (err: any) {
      console.error('Failed to refresh AI suggestions:', err)
      toast({
        title: 'Failed to refresh AI suggestions',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsRefreshingAiSuggestions(false)
    }
  }, [supabase, taskId, selectedChannelId, refreshAllComponentLists])

  // Remove component from template (used by both selected list and available list)
  const handleRemoveFromTemplate = async (
    componentBriefingId: number,
    componentScope: ComponentScope,
    projectComponentId?: number | null,
    keepInTask: boolean = true,
    component_key?: string
  ) => {
    const effectiveBtId = effectiveBriefingTypeId
    if (!projectId || !selectedChannelId || !effectiveBtId) return

    try {
      if (componentScope === 'project') {
        const { error } = await supabase.rpc('pbtc_remove', {
          p_project_id: projectId,
          p_briefing_type_id: effectiveBtId,
          p_component_id: projectComponentId || Math.abs(componentBriefingId)
        })

        if (error) throw error
      } else if (componentScope === 'channel' && contentTypeId) {
        // Determine p_component_id and p_is_project_component from component_key only: "p:" => true, "g:" => false
        const fromKey = component_key ? getChannelRemoveParamsFromKey(component_key) : null
        const p_component_id = fromKey?.p_component_id ?? projectComponentId ?? Math.abs(componentBriefingId)
        const p_is_project_component = fromKey != null ? fromKey.p_is_project_component : !!(projectComponentId != null)

        const { error } = await supabase.rpc('pcctbc_remove', {
          p_project_id: projectId,
          p_content_type_id: contentTypeId,
          p_channel_id: selectedChannelId,
          p_briefing_type_id: effectiveBtId,
          p_component_id: p_component_id,
          p_is_project_component: p_is_project_component
        })

        if (error) throw error
      }

      // If not keeping in task, remove from task as well
      if (!keepInTask) {
        const allTaskComponents = [...components, ...removedComponents]
        const taskRow = allTaskComponents.find((c) => {
          if (typeof projectComponentId === 'number') return c.project_component_id === projectComponentId
          return c.briefing_component_id === componentBriefingId
        })

        const { error: removeErr } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_task_component_id: taskRow?.task_component_id ?? null,
          p_briefing_component_id: typeof projectComponentId === 'number' ? null : componentBriefingId,
          p_project_component_id:
            typeof projectComponentId === 'number'
              ? projectComponentId
              : componentScope === 'project'
                ? componentBriefingId
                : null,
          p_selected: false,
          p_position: taskRow?.position ?? null,
          p_custom_title: taskRow?.custom_title || taskRow?.title || null,
          p_custom_description: taskRow?.custom_description || taskRow?.description || null,
        })

        if (removeErr) {
          console.warn('Failed to remove from task:', removeErr)
        }
      }

      await refreshComponents()
      await refreshAvailableComponents()
      invalidateTaskAllChannelsComponents(taskId)
      invalidateTaskAllChannelsAvailable(taskId)
      invalidateProjectTemplate(projectId!)

      toast({
        title: 'Removed from template',
        description: keepInTask ? 'Component removed from template but kept in this task.' : 'Component removed from template and task.'
      })
    } catch (err: any) {
      console.error('Failed to remove from template:', err)
      toast({
        title: 'Failed to remove from template',
        description: err.message,
        variant: 'destructive'
      })
    }
  }

  /** Apply available item's title/description to project briefing template via pbtc_update_all_channels_by_key. p_component_key must be from row (g:<id> or p:<id>). Used by handleSaveAvailableInstructions. */
  const applyAvailableToProjectTemplate = useCallback(
    async (
      item: { component_key?: string; position?: number | null },
      title: string,
      description: string,
      effectiveProjectId: number
    ) => {
      const briefingTypeId = effectiveBriefingTypeId
      if (!briefingTypeId) {
        toast({ title: 'Instructions saved', description: 'No briefing type; template not updated.', variant: 'destructive' })
        return
      }
      const p_component_key = item.component_key ?? ''
      if (!p_component_key.startsWith('p:') && !p_component_key.startsWith('g:')) {
        toast({ title: 'Cannot apply to template', description: 'Component key must be p:<id> or g:<id>.', variant: 'destructive' })
        return
      }
      const { error } = await supabase.rpc('pbtc_update_all_channels_by_key', {
        p_project_id: effectiveProjectId,
        p_briefing_type_id: briefingTypeId,
        p_component_key: p_component_key,
        p_position: item.position ?? null,
        p_custom_title: title || null,
        p_custom_description: description || null
      })
      if (error) {
        toast({ title: 'Instructions saved; template update failed', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Applied to project template', description: 'Component instructions and project briefing template updated for all channels.' })
      await refreshAllComponentLists()
      invalidateTaskAllChannelsAvailable(taskId)
      invalidateProjectTemplate(effectiveProjectId)
    },
    [taskId, effectiveBriefingTypeId, supabase, queryClient, refreshAllComponentLists, invalidateTaskAllChannelsAvailable, invalidateProjectTemplate]
  )

  /** Save instructions (custom_title/custom_description) for an AVAILABLE list item. Adds/restores the component to the task as selected=true so it moves to the Selected pile. Optionally applies to project template. */
  const handleSaveAvailableInstructions = useCallback(
    async (item: TaskChannelAvailableComponent, title: string, description: string, applyToProjectTemplate?: boolean) => {
      if (!selectedChannelId) return
      const effectiveProjectId = projectId ?? null
      try {
        const key = item.component_key ?? item.key ?? ''
        const isAiSuggestion = item.kind === 'ai_suggestion' || item.tag === 'AI suggestions' || key.startsWith('ai:')
        if (isAiSuggestion) {
          await handleAddAvailableComponent(item, {
            customTitle: title,
            customDescription: description,
          })
          toast({ title: 'Instructions saved', description: 'Suggestion accepted and added to task.' })
          return
        }

        // 1) "Removed from task" item: update existing row by task_component_id and set selected=true so it moves back to Selected pile
        if (item.task_component_id) {
          const { error } = await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: item.task_component_id,
            p_briefing_component_id: item.briefing_component_id ?? null,
            p_project_component_id: item.project_component_id ?? null,
            p_selected: true,
            p_position: (item as { position?: number | null }).position ?? null,
            p_custom_title: title || null,
            p_custom_description: description || null,
          })
          if (error) throw error
          await refreshAllComponentLists()
          if (applyToProjectTemplate && effectiveProjectId && (item.briefing_component_id ?? item.project_component_id)) {
            await applyAvailableToProjectTemplate(
              { component_key: item.component_key, position: (item as { position?: number | null }).position ?? null },
              title,
              description,
              effectiveProjectId
            )
          } else {
            toast({ title: 'Instructions saved', description: 'Component added to task.' })
          }
          return
        }

        // 2) Global or project component from Available (Recommended/System): upsert with selected=true so it is added to Selected pile
        const isGlobal = item.kind === 'global' || key.startsWith('g:')
        const isProject = item.kind === 'project' || key.startsWith('p:')

        let briefingId: number | null = null
        let projectComponentId: number | null = null
        if (isGlobal) {
          const num = item.briefing_component_id ?? item.component_id ?? parseIdFromComponentKey(key, 'g')
          if (num != null) briefingId = num
        }
        if (isProject) {
          const num = item.project_component_id ?? item.component_id ?? parseIdFromComponentKey(key, 'p')
          if (num != null) projectComponentId = num
        }

        // Never call with all three ids null (would insert new ad-hoc and create duplicate in "Removed from task")
        if (briefingId == null && projectComponentId == null) {
          toast({
            title: 'Cannot save',
            description: 'Select the component first to save instructions for this item.',
            variant: 'destructive',
          })
          return
        }

        const { error } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_task_component_id: null,
          p_briefing_component_id: briefingId ?? null,
          p_project_component_id: projectComponentId ?? null,
          p_selected: true,
          p_position: (item as { position?: number | null }).position ?? null,
          p_custom_title: title || null,
          p_custom_description: description || null,
        })
        if (error) throw error
        await refreshAllComponentLists()
        if (applyToProjectTemplate && effectiveProjectId && (briefingId ?? projectComponentId)) {
          await applyAvailableToProjectTemplate(
            { component_key: item.component_key, position: (item as { position?: number | null }).position ?? null },
            title,
            description,
            effectiveProjectId
          )
        } else {
          toast({ title: 'Instructions saved', description: 'Component added to task.' })
        }
      } catch (err: any) {
        console.error('Failed to save available component instructions:', err)
        toast({ title: 'Failed to save', description: err?.message ?? 'Unknown error', variant: 'destructive' })
      }
    },
    [taskId, selectedChannelId, projectId, supabase, refreshAllComponentLists, applyAvailableToProjectTemplate, handleAddAvailableComponent]
  )

  /** Remove from template for an AVAILABLE list item (kind global or project). Reuses pbtc_remove/pcctbc_remove; keeps task row if any. */
  const handleRemoveFromTemplateForAvailable = useCallback(
    async (item: TaskChannelAvailableComponent) => {
      const scope: ComponentScope = item.kind === 'project' ? 'project' : 'channel'
      const componentBriefingId = item.briefing_component_id ?? item.project_component_id ?? item.component_id ?? 0
      const projectComponentId = item.kind === 'project' ? (item.project_component_id ?? item.component_id ?? null) : null
      const component_key = item.component_key ?? item.key ?? ''
      await handleRemoveFromTemplate(componentBriefingId, scope, projectComponentId, true, component_key || undefined)
      await refreshAllComponentLists()
    },
    [handleRemoveFromTemplate, refreshAllComponentLists]
  )

  /** Delete an AVAILABLE list item. Uses component_key only: p: -> pbc_delete; t: -> tcc_delete_task_component; g: never. */
  const handleDeleteAvailable = useCallback(
    async (item: TaskChannelAvailableComponent) => {
      if (!projectId) return
      const key = item.component_key ?? item.key ?? ''
      const parsed = parseComponentKey(key)
      if (parsed.kind === 'global' || parsed.kind === 'unknown' || parsed.kind === 'ai_suggestion') {
        console.warn('Delete not supported for available component_key:', key, parsed)
        toast({ title: 'Cannot delete', description: 'This component cannot be deleted or the key could not be parsed.', variant: 'destructive' })
        return
      }
      try {
        if (parsed.kind === 'project') {
          const { error } = await supabase.rpc('pbc_delete_project_component', {
            p_project_id: projectId,
            p_project_component_id: parsed.projectComponentId,
          })
          if (error) throw error
          toast({ title: 'Component deleted', description: 'Project component removed from project.' })
          invalidateProjectTemplate(projectId)
        } else if (parsed.kind === 'task_ad_hoc') {
          const { error } = await supabase.rpc('tcc_delete_task_component', {
            p_task_component_id: parsed.taskComponentId,
          })
          if (error) throw error
          toast({ title: 'Component deleted', description: 'Ad-hoc component removed from task.' })
        }
        await refreshAllComponentLists()
        invalidateTaskAllChannelsComponents(taskId)
        invalidateTaskAllChannelsAvailable(taskId)
      } catch (err: any) {
        console.error('Failed to delete available component:', err)
        toast({ title: 'Failed to delete', description: err?.message ?? 'Unknown error', variant: 'destructive' })
      }
    },
    [projectId, supabase, refreshAllComponentLists, invalidateTaskAllChannelsComponents, invalidateTaskAllChannelsAvailable, invalidateProjectTemplate, taskId]
  )

  /** Save to project template (all channels). g:/p: use pbtc_add_all_channels_by_key; t: create project component then pbtc_add_project_all_channels then tcc_set_component. */
  const handleSaveToProjectAllChannels = useCallback(
    async (component: TaskChannelComponent) => {
      if (!projectId || !selectedChannelId) {
        toast({ title: 'Missing context', description: 'Project and channel are required.', variant: 'destructive' })
        return
      }
      const briefingTypeId = effectiveBriefingTypeId
      if (!briefingTypeId) {
        toast({ title: 'No briefing type', description: 'Select a briefing type for this channel first.', variant: 'destructive' })
        return
      }
      const title = (component.custom_title || component.title || '').trim()
      if (!title) {
        toast({ title: 'Missing title', description: 'Component must have a title.', variant: 'destructive' })
        return
      }
      const description = (component.custom_description || component.description || '').trim() || null
      const position = component.position ?? null

      const key = component.component_key ?? (component.project_component_id != null ? `p:${component.project_component_id}` : component.task_component_id ? `t:${component.task_component_id}` : component.briefing_component_id != null ? `g:${component.briefing_component_id}` : '')
      const isGlobalOrProjectByKey = key.startsWith('g:') || key.startsWith('p:')

      try {
        if (isGlobalOrProjectByKey) {
          // g: or p: → pbtc_add_all_channels_by_key (PBTC + PCCB for briefing type), then select in this task
          const { error: addErr } = await supabase.rpc('pbtc_add_all_channels_by_key', {
            p_project_id: projectId,
            p_briefing_type_id: briefingTypeId,
            p_component_key: key,
            p_position: position,
            p_custom_title: title,
            p_custom_description: description,
          })
          if (addErr) throw addErr
          const pId = key.startsWith('p:') ? parseIdFromComponentKey(key, 'p') : null
          const gId = key.startsWith('g:') ? parseIdFromComponentKey(key, 'g') : null
          const { error: setErr } = await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: null,
            p_briefing_component_id: gId ?? null,
            p_project_component_id: pId ?? null,
            p_selected: true,
            p_position: position ?? null,
            p_custom_title: title || null,
            p_custom_description: description || null,
          })
          if (setErr) throw setErr
          await refreshAllComponentLists()
          invalidateTaskAllChannelsComponents(taskId)
          invalidateTaskAllChannelsAvailable(taskId)
          invalidateProjectTemplate(projectId)
          toast({
            title: 'Saved to project template (all channels)',
            description: 'Component is in the project template (all channels) and selected in this task.',
          })
          return
        }

        // t: (task ad-hoc): create project component, add to all channels, then select
        let projectComponentId: number
        const isExistingProjectT = key.startsWith('p:') && component.project_component_id != null
        if (!isExistingProjectT) {
          if (!contentTypeId) {
            toast({ title: 'Missing context', description: 'Content type is required for ad-hoc.', variant: 'destructive' })
            return
          }
          const { data: created, error: createErr } = await supabase.rpc('create_project_component', {
            p_project_id: projectId,
            p_title: title,
            p_description: description,
          })
          if (createErr) throw createErr
          projectComponentId = created?.project_component_id ?? created?.id ?? created
          if (projectComponentId == null) throw new Error('Missing project_component_id')

          const { error: addErr } = await supabase.rpc('pbtc_add_project_all_channels', {
            p_project_id: projectId,
            p_briefing_type_id: briefingTypeId,
            p_project_component_id: Number(projectComponentId),
            p_position: position,
            p_custom_title: title,
            p_custom_description: description,
            p_content_type_id: contentTypeId,
            p_channel_id: selectedChannelId,
          })
          if (addErr) throw addErr

          const { error: selectAllErr } = await supabase.rpc('tc_select_project_component_all_task_channels', {
            p_task_id: taskId,
            p_project_component_id: Number(projectComponentId),
            p_custom_title: title,
            p_custom_description: description,
            p_position: position,
          })
          if (selectAllErr) {
            console.error('tc_select_project_component_all_task_channels failed:', selectAllErr)
            toast({
              title: 'Saved to project, but failed to apply to all task channels',
              description: selectAllErr.message ?? 'Unknown error',
              variant: 'destructive',
            })
            await refreshAllComponentLists()
            invalidateTaskAllChannelsComponents(taskId)
            invalidateTaskAllChannelsAvailable(taskId)
            invalidateProjectTemplate(projectId)
            return
          }
        } else {
          projectComponentId = component.project_component_id!
        }

        const { error: setErr } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_task_component_id: null,
          p_briefing_component_id: null,
          p_project_component_id: Number(projectComponentId),
          p_selected: true,
          p_position: position ?? null,
          p_custom_title: title || null,
          p_custom_description: description || null,
        })
        if (setErr) throw setErr

        if (component.task_component_id && !isExistingProjectT) {
          await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: component.task_component_id,
            p_briefing_component_id: null,
            p_project_component_id: null,
            p_selected: false,
            p_position: component.position ?? null,
            p_custom_title: component.custom_title || component.title || null,
            p_custom_description: component.custom_description || component.description || null,
          })
        }

        await refreshAllComponentLists()
        invalidateTaskAllChannelsComponents(taskId)
        invalidateTaskAllChannelsAvailable(taskId)
        invalidateProjectTemplate(projectId)
        toast({
          title: 'Saved to project template (all channels)',
          description: 'Component is in the project template (all channels) and selected in this task.',
        })
      } catch (err: any) {
        console.error('Failed to save to project briefing:', err)
        toast({
          title: 'Failed to save to project briefing',
          description: err?.message ?? 'Unknown error',
          variant: 'destructive',
        })
      }
    },
    [
      projectId,
      contentTypeId,
      selectedChannelId,
      taskId,
      effectiveBriefingTypeId,
      supabase,
      refreshAllComponentLists,
      invalidateTaskAllChannelsComponents,
      invalidateTaskAllChannelsAvailable,
      invalidateProjectTemplate,
    ]
  )

  /** Save to project template (all channels) for an AVAILABLE list item (p: or t:). Same flow as handleSaveToProjectAllChannels. */
  const handleSaveToProjectAllChannelsForAvailable = useCallback(
    async (item: TaskChannelAvailableComponent) => {
      if (!projectId || !selectedChannelId) {
        toast({ title: 'Missing context', description: 'Project and channel are required.', variant: 'destructive' })
        return
      }
      const briefingTypeId = effectiveBriefingTypeId
      if (!briefingTypeId) {
        toast({ title: 'No briefing type', description: 'Select a briefing type for this channel first.', variant: 'destructive' })
        return
      }
      const title = (item.custom_title ?? item.title ?? '').toString().trim()
      if (!title) {
        toast({ title: 'Missing title', description: 'Component must have a title.', variant: 'destructive' })
        return
      }
      const description = (item.custom_description ?? item.description ?? '').toString().trim() || null
      const position = (item as { position?: number | null }).position ?? null
      const key = item.component_key ?? ''
      const isGlobalOrProjectByKey = key.startsWith('g:') || key.startsWith('p:')
      const isExistingProject = key.startsWith('p:') && (item.project_component_id ?? item.component_id) != null

      try {
        if (isGlobalOrProjectByKey) {
          const { error: addErr } = await supabase.rpc('pbtc_add_all_channels_by_key', {
            p_project_id: projectId,
            p_briefing_type_id: briefingTypeId,
            p_component_key: key,
            p_position: position,
            p_custom_title: title,
            p_custom_description: description,
          })
          if (addErr) throw addErr
          const pId = key.startsWith('p:') ? parseIdFromComponentKey(key, 'p') : null
          const gId = key.startsWith('g:') ? parseIdFromComponentKey(key, 'g') : null
          const { error: setErr } = await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: null,
            p_briefing_component_id: gId ?? null,
            p_project_component_id: pId ?? null,
            p_selected: true,
            p_position: position ?? null,
            p_custom_title: title || null,
            p_custom_description: description || null,
          })
          if (setErr) throw setErr
          await refreshAllComponentLists()
          invalidateTaskAllChannelsComponents(taskId)
          invalidateTaskAllChannelsAvailable(taskId)
          invalidateProjectTemplate(projectId)
          toast({
            title: 'Saved to project template (all channels)',
            description: 'Component is in the project template (all channels) and selected in this task.',
          })
          return
        }

        let projectComponentId: number
        if (isExistingProject) {
          projectComponentId = Number(item.project_component_id ?? item.component_id!)
          const { error: addErr } = await supabase.rpc('pbtc_add_project_all_channels', {
            p_project_id: projectId,
            p_briefing_type_id: briefingTypeId,
            p_project_component_id: projectComponentId,
            p_position: position,
            p_custom_title: title,
            p_custom_description: description,
          })
          if (addErr) throw addErr
        } else {
          if (!contentTypeId) {
            toast({ title: 'Missing context', description: 'Content type is required for ad-hoc.', variant: 'destructive' })
            return
          }
          const { data: created, error: createErr } = await supabase.rpc('create_project_component', {
            p_project_id: projectId,
            p_title: title,
            p_description: description ?? '',
          })
          if (createErr) throw createErr
          projectComponentId = created?.project_component_id ?? created?.id ?? created
          if (projectComponentId == null) throw new Error('Missing project_component_id')

          const { error: addErr } = await supabase.rpc('pbtc_add_project_all_channels', {
            p_project_id: projectId,
            p_briefing_type_id: briefingTypeId,
            p_project_component_id: Number(projectComponentId),
            p_position: position,
            p_custom_title: title,
            p_custom_description: description,
            p_content_type_id: contentTypeId,
            p_channel_id: selectedChannelId,
          })
          if (addErr) throw addErr

          const { error: selectAllErr } = await supabase.rpc('tc_select_project_component_all_task_channels', {
            p_task_id: taskId,
            p_project_component_id: Number(projectComponentId),
            p_custom_title: title,
            p_custom_description: description,
            p_position: position,
          })
          if (selectAllErr) {
            console.error('tc_select_project_component_all_task_channels failed:', selectAllErr)
            toast({
              title: 'Saved to project, but failed to apply to all task channels',
              description: selectAllErr.message ?? 'Unknown error',
              variant: 'destructive',
            })
            await refreshAllComponentLists()
            invalidateTaskAllChannelsComponents(taskId)
            invalidateTaskAllChannelsAvailable(taskId)
            invalidateProjectTemplate(projectId)
            return
          }
        }

        const { error: setErr } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_task_component_id: null,
          p_briefing_component_id: null,
          p_project_component_id: Number(projectComponentId),
          p_selected: true,
          p_position: position ?? null,
          p_custom_title: title || null,
          p_custom_description: description || null,
        })
        if (setErr) throw setErr

        if (item.task_component_id && !isExistingProject) {
          await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: item.task_component_id,
            p_briefing_component_id: null,
            p_project_component_id: null,
            p_selected: false,
            p_position: position ?? null,
            p_custom_title: title || null,
            p_custom_description: description || null,
          })
        }

        await refreshAllComponentLists()
        invalidateTaskAllChannelsComponents(taskId)
        invalidateTaskAllChannelsAvailable(taskId)
        invalidateProjectTemplate(projectId)
        toast({
          title: 'Saved to project template (all channels)',
          description: 'Component is in the project template (all channels) and selected in this task.',
        })
      } catch (err: any) {
        console.error('Failed to save to project briefing (available):', err)
        toast({
          title: 'Failed to save to project briefing',
          description: err?.message ?? 'Unknown error',
          variant: 'destructive',
        })
      }
    },
    [
      projectId,
      contentTypeId,
      selectedChannelId,
      taskId,
      effectiveBriefingTypeId,
      supabase,
      refreshAllComponentLists,
      invalidateTaskAllChannelsComponents,
      invalidateTaskAllChannelsAvailable,
      invalidateProjectTemplate,
    ]
  )

  /** Save task ad-hoc component to Project × Channel briefing (channel-specific); then select in this task. */
  const handleSaveToProjectChannel = useCallback(
    async (component: TaskChannelComponent) => {
      if (!projectId || !contentTypeId || !selectedChannelId) {
        toast({ title: 'Missing context', description: 'Project, content type, and channel are required.', variant: 'destructive' })
        return
      }
      const briefingTypeId = effectiveBriefingTypeId
      if (!briefingTypeId) {
        toast({ title: 'No briefing type', description: 'Select a briefing type for this channel first.', variant: 'destructive' })
        return
      }
      const title = (component.custom_title || component.title || '').trim()
      if (!title) {
        toast({ title: 'Missing title', description: 'Component must have a title.', variant: 'destructive' })
        return
      }
      try {
        const description = (component.custom_description || component.description || '').trim() || null
        const position = component.position ?? null

        const { data: created, error: createErr } = await supabase.rpc('create_project_component', {
          p_project_id: projectId,
          p_title: title,
          p_description: description,
        })
        if (createErr) throw createErr
        const projectComponentId = created?.project_component_id ?? created?.id ?? created
        if (projectComponentId == null) throw new Error('Missing project_component_id')

        const { error: addErr } = await supabase.rpc('pcctbc_add_project', {
          p_project_id: projectId,
          p_content_type_id: contentTypeId,
          p_channel_id: selectedChannelId,
          p_briefing_type_id: briefingTypeId,
          p_project_component_id: Number(projectComponentId),
          p_position: null,
          p_custom_title: title,
          p_custom_description: description,
          p_purpose: null,
          p_guidance: null,
          p_suggested_word_count: null,
          p_subheads: null,
        })
        if (addErr) throw addErr

        const { error: setErr } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_task_component_id: null,
          p_briefing_component_id: null,
          p_project_component_id: Number(projectComponentId),
          p_selected: true,
          p_position: position ?? null,
          p_custom_title: title || null,
          p_custom_description: description || null,
        })
        if (setErr) throw setErr

        if (component.task_component_id) {
          await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: component.task_component_id,
            p_briefing_component_id: null,
            p_project_component_id: null,
            p_selected: false,
            p_position: component.position ?? null,
            p_custom_title: component.custom_title || component.title || null,
            p_custom_description: component.custom_description || component.description || null,
          })
        }

        await refreshComponents()
        await refreshAvailableComponents()
        toast({
          title: 'Saved to channel briefing',
          description: 'Component is in the project × channel template and selected in this task.',
        })
      } catch (err: any) {
        console.error('Failed to save to channel briefing:', err)
        toast({
          title: 'Failed to save to channel briefing',
          description: err?.message ?? 'Unknown error',
          variant: 'destructive',
        })
      }
    },
    [
      projectId,
      contentTypeId,
      selectedChannelId,
      taskId,
      effectiveBriefingTypeId,
      supabase,
      refreshComponents,
      refreshAvailableComponents,
    ]
  )

  /** Delete a selected component. Uses component_key only: p: -> pbc_delete_project_component; t: -> tcc_delete_task_component; g: never. */
  const handleDeleteSelectedComponent = useCallback(
    async (component: TaskChannelComponent) => {
      if (!projectId) return
      const key = component.component_key ?? (component.project_component_id != null ? `p:${component.project_component_id}` : component.task_component_id ? `t:${component.task_component_id}` : component.briefing_component_id != null ? `g:${component.briefing_component_id}` : '')
      const parsed = parseComponentKey(key)
      if (parsed.kind === 'global' || parsed.kind === 'unknown' || parsed.kind === 'ai_suggestion') {
        console.warn('Delete not supported for component_key:', key, parsed)
        toast({ title: 'Cannot delete', description: 'This component cannot be deleted or the key could not be parsed.', variant: 'destructive' })
        return
      }

      const rollback = applyOptimisticComponentRemoval(component, { purgeFromBootstrap: true })
      try {
        if (parsed.kind === 'project') {
          const { error } = await supabase.rpc('pbc_delete_project_component', {
            p_project_id: projectId,
            p_project_component_id: parsed.projectComponentId,
          })
          if (error) throw error
          toast({ title: 'Component deleted', description: 'Project component removed from project.' })
          invalidateProjectTemplate(projectId)
        } else if (parsed.kind === 'task_ad_hoc') {
          const { error } = await supabase.rpc('tcc_delete_task_component', {
            p_task_component_id: parsed.taskComponentId,
          })
          if (error) throw error
          toast({ title: 'Component deleted', description: 'Ad-hoc component removed.' })
        }
        void refreshAllComponentLists()
        invalidateTaskAllChannelsComponents(taskId)
        invalidateTaskAllChannelsAvailable(taskId)
      } catch (err: any) {
        restoreComponentRemovalRollback(rollback)
        console.error('Failed to delete component:', err)
        toast({
          title: 'Failed to delete component',
          description: err?.message ?? 'Unknown error',
          variant: 'destructive',
        })
      }
    },
    [
      projectId,
      supabase,
      refreshAllComponentLists,
      invalidateTaskAllChannelsComponents,
      invalidateTaskAllChannelsAvailable,
      invalidateProjectTemplate,
      taskId,
      applyOptimisticComponentRemoval,
      restoreComponentRemovalRollback,
    ]
  )

  // Edit component custom fields (task-only by default; optionally apply to project template)
  // Returns true when the save succeeded so the editor can track versioned save state without
  // greying out / disabling the card (typing must never be blocked while a save is in flight).
  const handleEditComponentCustom = async (
    taskComponentId: string | null,
    briefingComponentId: number | null,
    projectComponentId: number | null,
    title: string,
    description: string,
    componentScope?: ComponentScope,
    position?: number | null,
    applyToProjectTemplate?: boolean
  ): Promise<boolean> => {
    if (!selectedChannelId) {
      console.warn('Cannot edit component: no channel selected')
      return false
    }

    if (!taskComponentId) {
      console.warn('Cannot edit component: no task_component_id', {
        briefingComponentId,
        projectComponentId,
        title
      })
      toast({
        title: 'Cannot edit component',
        description: 'This component is not yet added to the task. Toggle it on first.',
        variant: 'destructive'
      })
      return false
    }

    try {
      const { error } = await supabase.rpc('tcc_set_component', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_task_component_id: taskComponentId,
        p_briefing_component_id: briefingComponentId ?? null,
        p_project_component_id: projectComponentId ?? null,
        p_selected: true,
        p_position: position ?? null,
        p_custom_title: title || null,
        p_custom_description: description || null,
      })

      if (error) throw error

      bumpAndInvalidateHomeSidebarRecent(queryClient, "tasks", {
        id: String(taskId),
        title: taskTitle?.trim() || `Task ${taskId}`,
      })

      await refreshComponents()

      // Optionally apply same title/description to project briefing template and propagate to all CT×channels (GLOBAL or PROJECT components only)
      if (applyToProjectTemplate && projectId && (briefingComponentId || projectComponentId)) {
        const briefingTypeId = effectiveBriefingTypeId
        if (briefingTypeId) {
          const p_component_key = projectComponentId != null ? `p:${projectComponentId}` : `g:${briefingComponentId!}`
          const { error: updateErr } = await supabase.rpc('pbtc_update_all_channels_by_key', {
            p_project_id: projectId,
            p_briefing_type_id: briefingTypeId,
            p_component_key,
            p_position: position ?? null,
            p_custom_title: title || null,
            p_custom_description: description || null
          })
          if (updateErr) {
            console.warn('Failed to apply to project template:', updateErr)
            toast({
              title: 'Task updated; template update failed',
              description: updateErr.message,
              variant: 'destructive'
            })
          } else {
            toast({
              title: 'Applied to project template',
              description: 'Task and project briefing template updated for all channels.'
            })
            await refreshAvailableComponents()
            await refreshComponents()
            invalidateTaskAllChannelsAvailable(taskId)
            invalidateProjectTemplate(projectId)
          }
        }
      }
      return true
    } catch (err: any) {
      console.error('Failed to update component custom fields:', err)
      toast({
        title: 'Failed to update component',
        description: err.message,
        variant: 'destructive'
      })
      return false
    }
  }

  /** Apply to project template from menu (selected card): use current component title/description, no edit form. Uses row.component_key from RPC. */
  const handleApplyToProjectTemplateFromMenu = useCallback(
    async (component: TaskChannelComponent) => {
      if (!projectId || !selectedChannelId) return
      const briefingTypeId = effectiveBriefingTypeId
      if (!briefingTypeId) return
      const p_component_key = component.component_key ?? ''
      if (!p_component_key.startsWith('p:') && !p_component_key.startsWith('g:')) {
        toast({ title: 'Cannot apply to template', description: 'Only global or project components can be applied to the template.', variant: 'destructive' })
        return
      }
      try {
        const { error } = await supabase.rpc('pbtc_update_all_channels_by_key', {
          p_project_id: projectId,
          p_briefing_type_id: briefingTypeId,
          p_component_key: p_component_key,
          p_position: component.position ?? null,
          p_custom_title: (component.custom_title ?? component.title) || null,
          p_custom_description: (component.custom_description ?? component.description) || null
        })
        if (error) throw error

        const { error: syncErr } = await supabase.rpc('tcc_sync_component_from_template_all_task_channels', {
          p_task_id: taskId,
          p_component_key: p_component_key,
          p_custom_title: (component.custom_title ?? component.title) || null,
          p_custom_description: (component.custom_description ?? component.description) || null
        })
        if (syncErr) {
          console.warn('tcc_sync_component_from_template_all_task_channels failed:', syncErr)
        }

        toast({ title: 'Applied to project template', description: 'Template updated for all channels.' })
        await refreshAllComponentLists()
        invalidateTaskAllChannelsComponents(taskId)
        invalidateTaskAllChannelsAvailable(taskId)
        invalidateProjectTemplate(projectId)
      } catch (err: any) {
        toast({ title: 'Failed to apply to template', description: err?.message ?? 'Unknown error', variant: 'destructive' })
      }
    },
    [
      projectId,
      selectedChannelId,
      effectiveBriefingTypeId,
      supabase,
      refreshAllComponentLists,
      taskId,
      invalidateTaskAllChannelsComponents,
      invalidateTaskAllChannelsAvailable,
      invalidateProjectTemplate,
    ]
  )

  /** Add this component to all channels in this task (selected in each). Uses row.component_key from RPC (g:/p:/t:). */
  const handleAddToAllChannelsInTask = useCallback(
    async (component: TaskChannelComponent) => {
      if (!selectedChannelId) return
      const p_component_key = component.component_key ?? ''
      if (!p_component_key) {
        toast({ title: 'Cannot add', description: 'Component has no key.', variant: 'destructive' })
        return
      }
      try {
        const { error } = await supabase.rpc('tcc_set_component_all_task_channels', {
          p_task_id: taskId,
          p_component_key,
          p_selected: true,
          p_position: component.position ?? null,
          p_custom_title: (component.custom_title ?? component.title) || null,
          p_custom_description: (component.custom_description ?? component.description) || null
        })
        if (error) throw error
        toast({ title: 'Added to all channels', description: 'Component is now selected in every channel for this task.' })
        await refreshAllComponentLists()
        invalidateTaskAllChannelsComponents(taskId)
        invalidateTaskAllChannelsAvailable(taskId)
      } catch (err: any) {
        toast({ title: 'Failed to add to all channels', description: err?.message ?? 'Unknown error', variant: 'destructive' })
      }
    },
    [taskId, selectedChannelId, supabase, refreshAllComponentLists, invalidateTaskAllChannelsComponents, invalidateTaskAllChannelsAvailable]
  )

  /** Add available-list component to all channels in this task. Uses row.component_key from RPC only (g:/p:/t:). */
  const handleAddToAllChannelsInTaskForAvailable = useCallback(
    async (item: TaskChannelAvailableComponent) => {
      if (!selectedChannelId) return
      const p_component_key = item.component_key ?? ''
      if (!p_component_key) {
        toast({ title: 'Cannot add', description: 'Component has no key.', variant: 'destructive' })
        return
      }
      try {
        const { error } = await supabase.rpc('tcc_set_component_all_task_channels', {
          p_task_id: taskId,
          p_component_key,
          p_selected: true,
          p_position: (item as { position?: number | null }).position ?? null,
          p_custom_title: (item.custom_title ?? item.title) || null,
          p_custom_description: (item.custom_description ?? item.description) || null
        })
        if (error) throw error
        toast({ title: 'Added to all channels', description: 'Component is now selected in every channel for this task.' })
        await refreshAllComponentLists()
        invalidateTaskAllChannelsComponents(taskId)
        invalidateTaskAllChannelsAvailable(taskId)
      } catch (err: any) {
        toast({ title: 'Failed to add to all channels', description: err?.message ?? 'Unknown error', variant: 'destructive' })
      }
    },
    [taskId, selectedChannelId, supabase, refreshAllComponentLists, invalidateTaskAllChannelsComponents, invalidateTaskAllChannelsAvailable]
  )

  /** Exclude available-list item from task (set selected=false; for "Removed from task" items). */
  const handleExcludeAvailableFromTask = useCallback(
    async (item: TaskChannelAvailableComponent) => {
      if (!selectedChannelId || !item.task_component_id) return

      const matchingRow =
        components.find((row) => row.task_component_id === item.task_component_id)
        ?? removedComponents.find((row) => row.task_component_id === item.task_component_id)
        ?? ({
          task_component_id: item.task_component_id,
          briefing_component_id: item.briefing_component_id ?? null,
          project_component_id: item.project_component_id ?? null,
          component_key: item.component_key,
          title: item.title,
          description: item.description,
          selected: false,
        } as TaskChannelComponent)

      const rollback = applyOptimisticComponentRemoval(matchingRow)
      try {
        const { error } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_task_component_id: item.task_component_id,
          p_briefing_component_id: item.briefing_component_id ?? null,
          p_project_component_id: item.project_component_id ?? null,
          p_selected: false,
          p_position: (item as { position?: number | null }).position ?? null,
          p_custom_title: (item.custom_title ?? item.title) || null,
          p_custom_description: (item.custom_description ?? item.description) || null,
        })
        if (error) throw error
        void refreshAllComponentLists()
      } catch (err: any) {
        restoreComponentRemovalRollback(rollback)
        toast({ title: 'Failed to exclude', description: err?.message ?? 'Unknown error', variant: 'destructive' })
      }
    },
    [
      taskId,
      selectedChannelId,
      supabase,
      refreshAllComponentLists,
      components,
      removedComponents,
      applyOptimisticComponentRemoval,
      restoreComponentRemovalRollback,
    ]
  )

  /** Reset component to template (clear custom title/description/position); keep selected state. */
  const handleResetToTemplate = useCallback(
    async (component: TaskChannelComponent) => {
      if (!selectedChannelId || !component.task_component_id) return
      try {
        const { error } = await supabase.rpc('tcc_set_component', {
          p_task_id: taskId,
          p_channel_id: selectedChannelId,
          p_task_component_id: component.task_component_id,
          p_briefing_component_id: component.briefing_component_id ?? null,
          p_project_component_id: component.project_component_id ?? null,
          p_selected: component.selected ?? true,
          p_position: null,
          p_custom_title: null,
          p_custom_description: null,
        })
        if (error) throw error
        toast({ title: 'Reset to template', description: 'Custom instructions cleared.' })
        await refreshAllComponentLists()
      } catch (err: any) {
        toast({ title: 'Failed to reset', description: err?.message ?? 'Unknown error', variant: 'destructive' })
      }
    },
    [taskId, selectedChannelId, supabase, refreshAllComponentLists]
  )
  
  // Edit component in template (project or channel scope)
  const handleEditInTemplate = async (
    componentBriefingId: number,
    title: string,
    description: string,
    componentScope: ComponentScope,
    projectComponentId?: number | null
  ) => {
    if (!projectId || !selectedChannelId || !effectiveBriefingTypeId) return

    try {
      if (componentScope === 'project') {
        // Edit in project briefing template
        const { error } = await supabase.rpc('pbtc_update', {
          p_project_id: projectId,
          p_briefing_type_id: effectiveBriefingTypeId,
          p_component_id: projectComponentId || Math.abs(componentBriefingId),
          p_title: title || null,
          p_description: description || null
        })
        
        if (error) throw error
      } else if (componentScope === 'channel' && contentTypeId) {
        // Edit in channel-specific template
        const { error } = await supabase.rpc('pcctbc_update', {
          p_project_id: projectId,
          p_content_type_id: contentTypeId,
          p_channel_id: selectedChannelId,
          p_component_id: projectComponentId || Math.abs(componentBriefingId),
          p_is_project_component: projectComponentId ? true : false,
          p_title: title || null,
          p_description: description || null
        })
        
        if (error) throw error
      }
      
      // Refresh components to get updated template values
      await refreshComponents()
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library:index', projectId] })

      toast({
        title: 'Template updated',
        description: 'Component template has been updated.'
      })
    } catch (err: any) {
      console.error('Failed to update template:', err)
      toast({
        title: 'Failed to update template',
        description: err.message,
        variant: 'destructive'
      })
    }
  }

  // Reorder components
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    
    if (!over || active.id === over.id || !selectedChannelId) return
    
    // IDs are either task_component_id (UUID) or temp-{id}
    const activeId = String(active.id)
    const overId = String(over.id)
    
    // Find components by matching the sortable ID (same as list key: component_key || task_component_id || temp-...)
    const oldIndex = components.findIndex(c => {
      const sortableId = c.task_component_id || c.component_key || `temp-${c.briefing_component_id ?? c.project_component_id ?? 'u'}`
      return sortableId === activeId
    })
    const newIndex = components.findIndex(c => {
      const sortableId = c.task_component_id || c.component_key || `temp-${c.briefing_component_id ?? c.project_component_id ?? 'u'}`
      return sortableId === overId
    })
    
    if (oldIndex === -1 || newIndex === -1) {
      console.warn('Could not find components for drag and drop', { activeId, overId, oldIndex, newIndex })
      return
    }
    
    // Optimistically update UI
    const newComponents = arrayMove(components, oldIndex, newIndex)
    setComponents(newComponents)
    
    // Build order array - use task_component_id for the RPC call
    const order = newComponents
      .filter(c => c.task_component_id) // Only include components that are in task_channel_components
      .map((c, idx) => ({
        task_component_id: c.task_component_id,
        position: idx
      }))
    
    if (order.length === 0) {
      console.warn('No components with task_component_id to reorder')
      return
    }
    
    try {
      await ensureTaskChannelSnapshotOnce({
        taskId,
        channelId: selectedChannelId,
        changeSource: "manual_before_edit",
        changeSummary: "Before reordering components",
      })

      const { error } = await supabase.rpc('tcc_reorder', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_order: order
      })
      
      if (error) throw error
      
      toast({
        title: 'Components reordered',
        description: 'Component order has been updated'
      })
    } catch (err: any) {
      console.error('Failed to reorder components:', err)
      toast({
        title: 'Failed to reorder',
        description: err.message,
        variant: 'destructive'
      })
      // Revert on error
      await refreshComponents()
    }
  }

  const handleMoveComponentByOffset = async (component: TaskChannelComponent, offset: -1 | 1) => {
    if (!selectedChannelId) return
    const sortableId = component.task_component_id || component.component_key || `temp-${component.briefing_component_id ?? component.project_component_id ?? 'u'}`
    const currentIndex = components.findIndex((c) => {
      const id = c.task_component_id || c.component_key || `temp-${c.briefing_component_id ?? c.project_component_id ?? 'u'}`
      return id === sortableId
    })
    if (currentIndex < 0) return
    const nextIndex = currentIndex + offset
    if (nextIndex < 0 || nextIndex >= components.length) return

    const reordered = arrayMove(components, currentIndex, nextIndex)
    setComponents(reordered)

    const order = reordered
      .filter((c) => c.task_component_id)
      .map((c, idx) => ({
        task_component_id: c.task_component_id,
        position: idx,
      }))

    if (order.length === 0) return

    try {
      await ensureTaskChannelSnapshotOnce({
        taskId,
        channelId: selectedChannelId,
        changeSource: "manual_before_edit",
        changeSummary: "Before reordering components",
      })

      const { error } = await supabase.rpc('tcc_reorder', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_order: order,
      })
      if (error) throw error
    } catch (err: any) {
      toast({
        title: 'Failed to reorder',
        description: err?.message ?? 'Could not update order',
        variant: 'destructive',
      })
      await refreshComponents()
    }
  }
  
  // Update keywords handler for SEOPanel
  const handleUpdateKeywords = async (payload: { primaryKeyword: string; secondaryKeywords: string; seoRequiredOverride?: boolean | null }) => {
    if (!selectedChannelId) return
    const previousSeoState = variantSEOData
    const previousPersistedKeywords = persistedTaskChannelSeoKeywords
    const primaryKeyword = payload.primaryKeyword.trim()
    const keywordsArray = parseKeywordTokens(payload.secondaryKeywords)

    // Optimistic FE update so keyword density is live while edits happen.
    setVariantSEOData((prev) => {
      const base: CTTVariantSEO = prev ?? {
        ctt_id: "",
        channel_id: selectedChannelId,
        language_id: languageId || 0,
        primary_keyword: null,
        secondary_keywords: null,
        seo_required_override: payload.seoRequiredOverride ?? null,
        updated_at: null,
        seo_required: true,
        seo_source: null,
      }
      return {
        ...base,
        primary_keyword: primaryKeyword || null,
        secondary_keywords: keywordsArray,
        seo_required_override: payload.seoRequiredOverride ?? base.seo_required_override ?? null,
      }
    })
    setPersistedTaskChannelSeoKeywords({
      primaryKeyword,
      secondaryKeywords: keywordsArray,
    })

    setIsUpdatingKeywords(true)
    try {
      const { error } = await supabase.rpc('tc_upsert_seo', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_required_override: payload.seoRequiredOverride ?? variantSEOData?.seo_required_override ?? null,
        p_primary_keyword: primaryKeyword || null,
        p_secondary_keywords: keywordsArray.length > 0 ? keywordsArray : null
      })
      
      if (error) throw error
      
      await refreshChannelBootstrap()
    } catch (err: any) {
      setVariantSEOData(previousSeoState)
      setPersistedTaskChannelSeoKeywords(previousPersistedKeywords)
      console.error('Failed to update keywords:', err)
      throw err
    } finally {
      setIsUpdatingKeywords(false)
    }
  }

  const handleAddChannelKeywords = useCallback(async (rawInput: string) => {
    const tokens = parseKeywordTokens(rawInput)
    if (tokens.length === 0) return

    const currentSecondary = Array.isArray(variantSEOData?.secondary_keywords)
      ? variantSEOData.secondary_keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
      : []
    const merged = dedupeKeywordsCaseInsensitive([...currentSecondary, ...tokens])
    await handleUpdateKeywords({
      primaryKeyword: variantSEOData?.primary_keyword ?? "",
      secondaryKeywords: merged.join(", "),
    })
  }, [parseKeywordTokens, variantSEOData?.secondary_keywords, variantSEOData?.primary_keyword, handleUpdateKeywords])

  const handleAddFocusedKeywords = useCallback(async () => {
    await handleAddChannelKeywords(focusedKeywordInput)
    setFocusedKeywordInput("")
  }, [focusedKeywordInput, handleAddChannelKeywords])

  const handleInsertFocusedComponent = useCallback(async () => {
    if (!selectedChannelId || focusedInsertPosition == null) return
    if (!focusedInsertTitle.trim() || isFocusedInsertSubmitting) return

    setIsFocusedInsertSubmitting(true)
    try {
      const generationPrompt = focusedInsertDescription.trim() || null
      const { data: newTaskComponentData, error: addErr } = await supabase.rpc('tcc_add_ad_hoc_component', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_title: focusedInsertTitle.trim(),
        p_description: generationPrompt,
        p_position: focusedInsertPosition,
        p_generation_source: 'interactive_stream',
      })
      if (addErr) throw addErr

      let taskComponentId = tryExtractTaskComponentId(newTaskComponentData)
      const briefingComponentId = typeof newTaskComponentData === 'number' ? newTaskComponentData : null
      if (!taskComponentId && briefingComponentId != null) {
        const { data: createdTaskRow } = await supabase
          .from('task_channel_components')
          .select('id')
          .eq('task_id', taskId)
          .eq('channel_id', selectedChannelId)
          .eq('briefing_component_id', briefingComponentId)
          .order('position', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        taskComponentId = createdTaskRow?.id ?? null
      }

      await refreshAllComponentLists()
      if (taskComponentId) expandAddedTaskComponent(taskComponentId)

      setFocusedInsertTitle('')
      setFocusedInsertDescription('')
      setFocusedInsertPosition(null)
      toast({ title: 'Component added', description: 'Component inserted into focused workspace.' })
    } catch (err: any) {
      console.error('Failed to insert focused component:', err)
      toast({
        title: 'Failed to add component',
        description: err?.message ?? 'An error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsFocusedInsertSubmitting(false)
    }
  }, [
    selectedChannelId,
    focusedInsertPosition,
    focusedInsertTitle,
    focusedInsertDescription,
    isFocusedInsertSubmitting,
    supabase,
    taskId,
    refreshAllComponentLists,
    expandAddedTaskComponent,
  ])

  const applyFocusedComponentOutputUpdate = useCallback((component: TaskChannelComponent, nextText: string) => {
    const saveTarget = getOutputSaveTargetForComponent(component)
    const outputKey = saveTarget?.outputKey ?? getOutputMapKeyFromComponent(component)
    if (!outputKey) return false
    outputValuesRef.current.set(outputKey, nextText)
    markOutputDirty(outputKey)
    const previousBlocks = getOutputBlocks(componentOutputsRef.current.get(outputKey) ?? null)
    outputJsonValuesRef.current.set(outputKey, mergeTextChangesIntoExistingBlocks(previousBlocks, nextText))
    setComponentOutputs((prev) => {
      const next = new Map(prev)
      const nextBlocks = outputJsonValuesRef.current.get(outputKey)
        ?? mergeTextChangesIntoExistingBlocks(getOutputBlocks(next.get(outputKey) ?? null), nextText)
      next.set(
        outputKey,
        buildOutputRecord(next.get(outputKey), {
          content_text: nextText,
          content_json: nextBlocks,
          updated_at: new Date().toISOString(),
        })
      )
      return next
    })
    if (saveTarget) debouncedSaveOutput(saveTarget)
    return true
  }, [getOutputSaveTargetForComponent, debouncedSaveOutput, markOutputDirty])

  const navigateFocusedSearchMatch = useCallback((direction: 'next' | 'prev') => {
    if (focusedSearchMatches.length === 0) return
    const base = focusedSearchActiveIndex
    const nextIdx = direction === 'next'
      ? (base + 1) % focusedSearchMatches.length
      : (base - 1 + focusedSearchMatches.length) % focusedSearchMatches.length
    setFocusedSearchActiveIndex(nextIdx)
    scrollToFocusedOutput(focusedSearchMatches[nextIdx].anchorId)
  }, [focusedSearchMatches, focusedSearchActiveIndex, scrollToFocusedOutput])

  const handleFocusedReplaceOne = useCallback(() => {
    if (focusedSearchMatches.length === 0) return
    const current = focusedSearchMatches[focusedSearchActiveIndex]
    if (!current) return
    const component = focusedComponentByCardKey.get(current.cardKey)
    if (!component) return
    const currentText = getResolvedOutputForComponent(component)?.content_text ?? ''
    const replaced = replaceFirstInsensitive(currentText, focusedSearchTerm, focusedReplaceTerm)
    if (!replaced.changed) return
    applyFocusedComponentOutputUpdate(component, replaced.value)
  }, [
    focusedSearchMatches,
    focusedSearchActiveIndex,
    focusedComponentByCardKey,
    getResolvedOutputForComponent,
    focusedSearchTerm,
    focusedReplaceTerm,
    applyFocusedComponentOutputUpdate,
  ])

  const handleFocusedReplaceAll = useCallback(() => {
    if (!focusedSearchTerm.trim()) return
    let changedAny = false
    focusedSelectedComponents.forEach((component) => {
      const currentText = getResolvedOutputForComponent(component)?.content_text ?? ''
      const replaced = replaceAllInsensitive(currentText, focusedSearchTerm, focusedReplaceTerm)
      if (!replaced.changed) return
      const updated = applyFocusedComponentOutputUpdate(component, replaced.value)
      if (updated) changedAny = true
    })
    if (changedAny) {
      toast({ title: 'Replace all applied', description: 'Focused outputs updated.' })
    }
  }, [
    focusedSearchTerm,
    focusedReplaceTerm,
    focusedSelectedComponents,
    getResolvedOutputForComponent,
    applyFocusedComponentOutputUpdate,
  ])

  const handleApplyLinkReplace = useCallback(async (normalizedUrl: string) => {
    const replacementRaw = linkReplaceInput.trim()
    const replacementNormalized = normalizeUrl(replacementRaw)
    if (!replacementRaw || !replacementNormalized.isValid || !replacementNormalized.normalizedUrl) {
      setLinkReplaceError('Enter a valid http(s) URL.')
      return
    }
    if (replacementNormalized.normalizedUrl === normalizedUrl) {
      setLinkReplaceError('New URL must be different from current URL.')
      return
    }

    const linkItem = sortedLinkSummaryItems.find((item) => item.normalizedUrl === normalizedUrl)
    if (!linkItem) {
      setLinkReplaceError('No affected links found.')
      return
    }

    setIsReplacingLink(true)
    setLinkReplaceError(null)
    try {
      let changedComponents = 0
      let replacedOccurrences = 0

      for (const componentRef of linkItem.components) {
        const component = selectedComponentByCardKey.get(componentRef.cardKey)
        if (!component) continue
        const currentText = getComponentOutputTextForLinkOperations(getResolvedOutputForComponent(component))
        if (!currentText.trim()) continue

        const replaced = replaceUrlTargetsInOutput(
          currentText,
          normalizedUrl,
          replacementNormalized.displayUrl
        )
        if (replaced.replacements <= 0) continue

        const updated = applyFocusedComponentOutputUpdate(component, replaced.value)
        if (!updated) continue

        changedComponents += 1
        replacedOccurrences += replaced.replacements
      }

      if (changedComponents === 0 || replacedOccurrences === 0) {
        setLinkReplaceError('No matching occurrences were found to replace.')
        return
      }

      setActiveLinkReplaceUrl(null)
      setLinkReplaceInput('')
      setLinkReplaceError(null)
      toast({
        title: 'Links replaced',
        description: `Updated ${replacedOccurrences} occurrence(s) across ${changedComponents} component(s).`,
      })
    } finally {
      setIsReplacingLink(false)
    }
  }, [
    linkReplaceInput,
    sortedLinkSummaryItems,
    selectedComponentByCardKey,
    getResolvedOutputForComponent,
    applyFocusedComponentOutputUpdate,
  ])
  
  // Toggle SEO required handler for SEOPanel
  const handleToggleSEORequired = async (
    seoRequired: boolean,
    options?: { primaryKeyword?: string | null; secondaryKeywords?: string[] | string | null },
  ) => {
    if (!selectedChannelId) return
    if (!hasHydratedSeoStateRef.current && !options) return

    setIsTogglingSEO(true)
    try {
      const currentKeywords = options?.secondaryKeywords ?? variantSEOData?.secondary_keywords
      const keywordsArray = Array.isArray(currentKeywords)
        ? currentKeywords.map((keyword) => String(keyword).trim()).filter(Boolean)
        : (typeof currentKeywords === 'string' ? parseKeywordTokens(currentKeywords) : [])
      const primaryKeyword = (options?.primaryKeyword ?? variantSEOData?.primary_keyword ?? '').trim()

      const { error } = await supabase.rpc('tc_upsert_seo', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_required_override: seoRequired,
        p_primary_keyword: primaryKeyword || null,
        p_secondary_keywords: keywordsArray.length > 0 ? keywordsArray : null
      })
      
      if (error) throw error
      
      await refreshChannelBootstrap()
    } catch (err: any) {
      console.error('Failed to toggle SEO required:', err)
      throw err
    } finally {
      setIsTogglingSEO(false)
    }
  }
  
  // Navigate to manage project briefings
  const handleManageTemplates = () => {
    if (!projectId) return
    router.push(`/projects/${projectId}`)
  }

  const openBriefingDropdown = useCallback(() => {
    setIsBriefingTypeRowActive(true)
    setIsBriefingDropdownOpen(true)
  }, [])

  const startInlineBriefingTitleEdit = useCallback(() => {
    const effectiveId = effectiveBriefingTypeId ?? null
    setIsBriefingTypeRowActive(true)
    setIsBriefingDropdownOpen(false)
    if (effectiveId == null) return
    const active = briefingTypeOptions.find((t) => t.id === effectiveId)
    setInlineBriefingTitleDraft((briefingTitleOverrides[effectiveId] ?? active?.title) ?? "")
    setInlineBriefingTitleEditId(effectiveId)
    window.setTimeout(() => {
      inlineBriefingTitleInputRef.current?.focus()
      inlineBriefingTitleInputRef.current?.select()
    }, 0)
  }, [effectiveBriefingTypeId, briefingTypeOptions, briefingTitleOverrides])
  
  function sanitizeFilename(value: string) {
    return value
      .trim()
      .replaceAll(/[\/\\?%*:|"<>]/g, '-')
      .replaceAll(/\s+/g, ' ')
      .slice(0, 160)
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleExportComponentsToWord = useCallback(async () => {
    if (isExporting) return
    if (!taskId) return

    setIsExporting(true)
    try {
      if (!accessToken) {
        toast({ title: 'Export failed', description: 'You need to be signed in to export.', variant: 'destructive' })
        return
      }

      const channelsToExport = channels
      if (channelsToExport.length === 0) {
        toast({ title: 'Nothing to export', description: 'This task has no channels.' })
        return
      }

      const taskMeta = {
        contentTypeTitle: contentTypeTitle ?? null,
        metaTitle: taskMetaTitle ?? null,
        metaDescription: taskMetaDescription ?? null,
        keyword: taskKeyword ?? null,
        slug: taskSlug ?? null,
      }

      const exportChannels = await Promise.all(
        channelsToExport.map(async (channel) => {
          const bootstrap = await fetchTaskChannelBootstrap(taskId, channel.channel_id, accessToken)
          const isActiveChannel = selectedChannelId === channel.channel_id
          const liveOverrides: TaskDocxExportLiveOverrides | undefined = isActiveChannel
            ? {
                componentOutputs: componentOutputsRef.current,
                outputTextByKey: outputValuesRef.current,
                outputJsonByKey: outputJsonValuesRef.current,
                inFlightGenerations: inFlightComponentGenerationsRef.current,
                finalPreviews: finalComponentOutputPreviews,
              }
            : undefined
          const liveComponents = isActiveChannel
            ? components.map((component) => ({
                task_component_id: component.task_component_id,
                briefing_component_id: component.briefing_component_id,
                project_component_id: component.project_component_id,
                title: component.title,
                custom_title: component.custom_title,
                selected: component.selected,
                position: component.position,
                kind: component.kind ?? null,
              }))
            : undefined

          const seoKeywords = [
            bootstrap.seo?.override?.primary_keyword,
            ...(
              Array.isArray(bootstrap.seo?.override?.secondary_keywords)
                ? bootstrap.seo?.override?.secondary_keywords
                : typeof bootstrap.seo?.override?.secondary_keywords === "string"
                  ? bootstrap.seo.override.secondary_keywords.split(/[;,]/)
                  : []
            ),
          ]
            .map((keyword) => (typeof keyword === "string" ? keyword.trim() : ""))
            .filter(Boolean)

          const keywordMetrics = await fetchChannelKeywordMetricsForExport(
            supabase,
            taskId,
            channel.channel_id,
            seoKeywords,
          )

          return {
            bootstrap,
            channelName: channel.name,
            liveComponents,
            liveOverrides,
            keywordMetrics,
          }
        })
      )

      const safeTaskTitle = taskTitle?.trim() || `Task ${taskId}`
      const exportModel = buildTaskDocxExportModel({
        taskTitle: safeTaskTitle,
        taskMeta,
        channels: exportChannels,
      })
      logTaskDocxExportDebug(exportModel)

      const nonEmpty = exportModel.channels.filter((channel) => channel.components.length > 0)
      if (nonEmpty.length === 0) {
        toast({ title: 'Nothing to export', description: 'No component outputs found across channels.' })
        return
      }

      const {
        Document,
        Packer,
        Paragraph,
        HeadingLevel,
        TextRun,
        Header,
        ExternalHyperlink,
        LevelFormat,
        AlignmentType,
        ImageRun,
      } = await import('docx')

      const numberingConfig = buildExportDocxNumberingConfig({ LevelFormat, AlignmentType })
      const logoParagraph = await buildDocxLogoParagraph(projectLogoUrl, { Paragraph, ImageRun })

      const appendSeoSection = (children: any[], seo: TaskDocxExportSeo | null) => {
        if (!seo) return
        const lines: Array<{ label: string; value: string }> = []
        if (seo.metaTitle) lines.push({ label: 'SEO title', value: seo.metaTitle })
        if (seo.metaDescription) lines.push({ label: 'Meta description', value: seo.metaDescription })
        if (seo.slug) lines.push({ label: 'Slug', value: seo.slug })
        if (seo.primaryKeyword && !seo.keywordRows.some((row) => row.keyword === seo.primaryKeyword)) {
          lines.push({ label: 'Focus keyword', value: seo.primaryKeyword })
        }
        if (seo.keyword && seo.keyword !== seo.primaryKeyword) {
          lines.push({ label: 'Keyword', value: seo.keyword })
        }
        const hasKeywordRows = seo.keywordRows.length > 0
        if (lines.length === 0 && !hasKeywordRows) return

        children.push(new Paragraph({ text: 'SEO', heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } }))
        for (const line of lines) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${line.label}: `, bold: true }),
                new TextRun({ text: line.value }),
              ],
              spacing: { after: 60 },
            })
          )
        }
        for (const row of seo.keywordRows) {
          const typeLabel = row.isPrimary ? 'Primary' : 'Secondary'
          const volumeLabel = formatExportMetricValue(row.searchVolume)
          const competitionLabel = formatExportMetricValue(row.competition)
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `${row.keyword}`, bold: true }),
                new TextRun({ text: ` (${typeLabel}) — Search volume: ${volumeLabel}, Competition: ${competitionLabel}` }),
              ],
              spacing: { after: 60 },
            })
          )
        }
      }

      const children: any[] = []
      children.push(new Paragraph({ text: safeTaskTitle, heading: HeadingLevel.HEADING_1, spacing: { after: 120 } }))

      if (exportModel.contentTypeTitle) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: exportModel.contentTypeTitle, italics: true })],
            spacing: { after: 120 },
          })
        )
      }

      for (const channel of nonEmpty) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: channel.channelName, bold: true })],
            spacing: { before: 240, after: 80 },
          })
        )

        appendSeoSection(children, channel.seo)

        for (const component of channel.components) {
          // Use the same canonical semantic HTML as the clipboard serializer so hyperlinks
          // (anchors, converted markdown links, and autolinked URLs) survive into the DOCX.
          const docxHtml = component.clipboardHtml || renderComponentToDocxHtml(component)
          children.push(
            ...htmlToDocxElements(docxHtml || '', {
              Paragraph,
              TextRun,
              HeadingLevel,
              ExternalHyperlink,
            }),
          )
        }
      }

      const doc = new Document({
        numbering: { config: numberingConfig },
        sections: [{
          properties: {},
          headers: logoParagraph
            ? { default: new Header({ children: [logoParagraph as never] }) }
            : undefined,
          children,
        }],
      })

      const blob = await Packer.toBlob(doc)
      const filename = `${sanitizeFilename(safeTaskTitle)} - components.docx`
      downloadBlob(blob, filename)
      toast({ title: 'Exported', description: 'Word document downloaded.' })
    } catch (err: any) {
      console.error('Failed to export components:', err)
      toast({
        title: 'Export failed',
        description: err?.message || 'An error occurred while exporting.',
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }, [
    channels,
    components,
    contentTypeTitle,
    finalComponentOutputPreviews,
    isExporting,
    accessToken,
    selectedChannelId,
    taskId,
    taskKeyword,
    taskMetaDescription,
    taskMetaTitle,
    taskSlug,
    taskTitle,
    projectLogoUrl,
    supabase,
  ])

  useEffect(() => {
    const onFocusOutputs = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId?: number; outputId?: string | null }>
      if (customEvent.detail?.taskId !== taskId) return
      const requestedOutputId =
        typeof customEvent.detail?.outputId === "string" && customEvent.detail.outputId.length > 0
          ? customEvent.detail.outputId
          : null
      if (requestedOutputId) setRequestedFocusedOutputId(requestedOutputId)
      enterFocusedAllOutputsMode()
    }
    const onNavigateCommentThread = (event: Event) => {
      const customEvent = event as CustomEvent<{
        taskId?: number
        threadId?: number | null
        outputId?: string | null
        attachmentId?: string | null
        anchorType?: string | null
        anchorStart?: number | null
        anchorEnd?: number | null
        anchorX?: number | null
        anchorY?: number | null
        anchorQuote?: string | null
      }>
      if (customEvent.detail?.taskId !== taskId) return
      const outputId =
        typeof customEvent.detail?.outputId === "string" && customEvent.detail.outputId.length > 0
          ? customEvent.detail.outputId
          : null
      if (outputId) setRequestedFocusedOutputId(outputId)
      setCommentNavigationTarget({
        taskId,
        threadId: Number.isFinite(Number(customEvent.detail?.threadId)) ? Number(customEvent.detail?.threadId) : null,
        outputId,
        attachmentId:
          typeof customEvent.detail?.attachmentId === "string" && customEvent.detail.attachmentId.length > 0
            ? customEvent.detail.attachmentId
            : null,
        anchorType: typeof customEvent.detail?.anchorType === "string" ? customEvent.detail.anchorType : null,
        anchorStart: Number.isFinite(Number(customEvent.detail?.anchorStart)) ? Number(customEvent.detail?.anchorStart) : null,
        anchorEnd: Number.isFinite(Number(customEvent.detail?.anchorEnd)) ? Number(customEvent.detail?.anchorEnd) : null,
        anchorX: Number.isFinite(Number(customEvent.detail?.anchorX)) ? Number(customEvent.detail?.anchorX) : null,
        anchorY: Number.isFinite(Number(customEvent.detail?.anchorY)) ? Number(customEvent.detail?.anchorY) : null,
        anchorQuote: typeof customEvent.detail?.anchorQuote === "string" ? customEvent.detail.anchorQuote : null,
        token: Date.now(),
      })
      enterFocusedAllOutputsMode()
    }
    const onDownloadOutputs = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId?: number }>
      if (customEvent.detail?.taskId !== taskId) return
      void handleExportComponentsToWord()
    }
    const onCopyOutputs = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId?: number }>
      console.log("[copy-content-event-received]", {
        eventTaskId: customEvent.detail?.taskId,
        taskId,
        channelId: selectedChannelId,
      })
      if (customEvent.detail?.taskId !== taskId) return
      void handleCopyAllChannelContent()
    }
    const onOpenContentHistory = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId?: number }>
      if (customEvent.detail?.taskId !== taskId) return
      if (selectedChannelId == null) {
        toast({
          title: "Select a channel",
          description: "Choose a channel before opening content history.",
        })
        return
      }
      setIsChannelContentHistoryOpen(true)
    }
    console.log("[copy-content-listener-registered]", { taskId, channelId: selectedChannelId })
    window.addEventListener("task-details:focus-outputs", onFocusOutputs as EventListener)
    window.addEventListener("task-details:navigate-comment-thread", onNavigateCommentThread as EventListener)
    window.addEventListener("task-details:download-outputs", onDownloadOutputs as EventListener)
    window.addEventListener("task-details:copy-outputs", onCopyOutputs as EventListener)
    window.addEventListener("task-details:open-content-history", onOpenContentHistory as EventListener)
    return () => {
      window.removeEventListener("task-details:focus-outputs", onFocusOutputs as EventListener)
      window.removeEventListener("task-details:navigate-comment-thread", onNavigateCommentThread as EventListener)
      window.removeEventListener("task-details:download-outputs", onDownloadOutputs as EventListener)
      window.removeEventListener("task-details:copy-outputs", onCopyOutputs as EventListener)
      window.removeEventListener("task-details:open-content-history", onOpenContentHistory as EventListener)
    }
  }, [
    enterFocusedAllOutputsMode,
    handleCopyAllChannelContent,
    handleExportComponentsToWord,
    selectedChannelId,
    taskId,
  ])

  const handleCopyFocusedShareLink = useCallback(async () => {
    try {
      const href = typeof window !== 'undefined' ? window.location.href : ''
      if (!href) return
      const url = new URL(href)
      if (focusedOutputCardKey === FOCUSED_ALL_SELECTED_OUTPUTS_KEY) {
        url.searchParams.set(FOCUS_OUTPUTS_URL_PARAM, "all")
      }
      await navigator.clipboard.writeText(url.toString())
      toast({ title: 'Link copied', description: 'Task link copied to clipboard.' })
    } catch (err: any) {
      toast({
        title: 'Copy failed',
        description: err?.message ?? 'Could not copy link.',
        variant: 'destructive',
      })
    }
  }, [focusedOutputCardKey])

  const exitFocusedAllOutputsToDetails = useCallback(() => {
    exitFocusedOutputMode()
    if (isSectionExpanded && onToggleSectionExpand) onToggleSectionExpand()
  }, [exitFocusedOutputMode, isSectionExpanded, onToggleSectionExpand])
  
  // Fetch AI threads for this task
  const fetchAiThreads = useCallback(async () => {
    if (!taskId) return
    
    setIsLoadingThreads(true)
    try {
      const { data, error } = await supabase
        .from('ai_threads')
        .select('id, title, last_message_at, created_at')
        .eq('task_id', taskId)
        .eq('scope', 'task')
        .eq('is_deleted', false)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (error) throw error
      setAiThreads(data || [])
    } catch (err: any) {
      console.error('Failed to fetch AI threads:', err)
    } finally {
      setIsLoadingThreads(false)
    }
  }, [supabase, taskId])
  
  // Add a single component to the task from structure review
  const handleApplyComponent = useCallback(async (component: ReviewedComponent) => {
    if (!selectedChannelId) {
      throw new Error('Please select a channel first')
    }
    
    try {
      await ensureTaskChannelSnapshotOnce({
        taskId,
        channelId: selectedChannelId,
        changeSource: "manual_before_edit",
        changeSummary: `Before adding component: ${component.title?.trim() || "Component"}`,
      })

      // Use the existing tcc_add_ad_hoc_component RPC to add the component
      const { data: newTaskComponentData, error: addErr } = await supabase.rpc('tcc_add_ad_hoc_component', {
        p_task_id: taskId,
        p_channel_id: selectedChannelId,
        p_title: component.title,
        p_description: component.description,
        p_position: null,
        p_generation_source: 'interactive_stream',
      })
      
      if (addErr) throw addErr
      
      let taskComponentId = tryExtractTaskComponentId(newTaskComponentData)
      const briefingComponentId = typeof newTaskComponentData === 'number' ? newTaskComponentData : null
      if (!taskComponentId && briefingComponentId != null) {
        const { data: createdTaskRow } = await supabase
          .from('task_channel_components')
          .select('id')
          .eq('task_id', taskId)
          .eq('channel_id', selectedChannelId)
          .eq('briefing_component_id', briefingComponentId)
          .order('position', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        taskComponentId = createdTaskRow?.id ?? null
      }

      if (!taskComponentId && !briefingComponentId) throw new Error('Failed to create component')
      
      // If there's output content, save it to task_component_outputs
      if (!isMeaningfullyEmptyHtml(component.output ?? '')) {
        const payload = taskComponentId
          ? {
              task_id: taskId,
              channel_id: selectedChannelId,
              task_component_id: taskComponentId,
              content_text: component.output ?? '',
              updated_at: new Date().toISOString(),
            }
          : {
              task_id: taskId,
              channel_id: selectedChannelId,
              briefing_component_id: briefingComponentId,
              content_text: component.output ?? '',
              updated_at: new Date().toISOString(),
            }
        const { error: outputErr } = await supabase
          .from('task_component_outputs')
          .upsert(payload, {
            onConflict: taskComponentId ? 'task_component_id' : 'task_id,channel_id,briefing_component_id'
          })
        
        if (outputErr) {
          console.warn('Failed to save component output:', outputErr)
          // Continue - component is created, just output didn't save
        }
      }
      
      // Refresh components list
      await refreshComponents()
      
    } catch (err: any) {
      console.error('Failed to add component to task:', err)
      throw err
    }
  }, [supabase, taskId, selectedChannelId, refreshComponents])
  
  // Add all selected components to the task
  const handleApplyAllComponents = useCallback(async (components: ReviewedComponent[]) => {
    if (!selectedChannelId) {
      throw new Error('Please select a channel first')
    }
    
    let successCount = 0
    const errors: string[] = []
    
    for (const component of components) {
      try {
        await handleApplyComponent(component)
        successCount++
      } catch (err: any) {
        errors.push(`${component.title}: ${err.message}`)
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Added ${successCount}/${components.length} components. Errors: ${errors.join('; ')}`)
    }
  }, [handleApplyComponent, selectedChannelId])
  
  const AI_BUILD_URL_KEYS = [
    "layout",
    "rightView",
    "taskAiOpen",
    "focus",
    "aiThreadId",
    "chatMode",
    "chatPreFill",
    "chatComponentId",
    "chatAutoRun",
    "activeChannelId",
  ] as const

  const syncAiPaneUrlForBuild = useCallback((args: {
    threadId: string
    composerContext?: {
      mode: "build_component" | "build_briefing"
      componentId?: string
      preFillMessage: string
      autoRun?: boolean
    }
  }) => {
    const current = new URLSearchParams(searchParams.toString())
    const next = preserveTaskDetailsFocusWhenOpeningAi(current)

    next.delete("chatMode")
    next.delete("chatPreFill")
    next.delete("chatComponentId")
    next.delete("chatAutoRun")
    next.delete("activeChannelId")

    if (current.get("aiThreadId") !== args.threadId) {
      next.set("aiThreadId", args.threadId)
    }

    if (args.composerContext) {
      next.set("chatMode", args.composerContext.mode)
      if (args.composerContext.componentId) {
        next.set("chatComponentId", args.composerContext.componentId)
      }
      next.set("chatPreFill", encodeURIComponent(args.composerContext.preFillMessage))
      next.set("chatAutoRun", args.composerContext.autoRun ? "true" : "false")
      next.set("activeChannelId", String(selectedChannelId))
    }

    const changed = AI_BUILD_URL_KEYS.some(
      (key) => (current.get(key) ?? "") !== (next.get(key) ?? ""),
    )
    if (!changed) return

    shallowReplaceSearchParams(pathname, next, "build-with-ai")
  }, [pathname, searchParams, selectedChannelId])

  const clearGeneratingForTaskComponentId = useCallback((taskComponentId: string) => {
    const key = getGeneratingKeyFromTaskComponentId(taskComponentId)
    setGeneratingComponentKeys((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [])

  // Open an existing AI thread
  const handleOpenThread = useCallback((threadId: string) => {
    syncAiPaneUrlForBuild({ threadId })
  }, [syncAiPaneUrlForBuild])

  // "Ask/Edit selected text with AI" — build selected_text_context from the highlighted output.
  const resolveComponentSelection = useCallback(
    (container: HTMLElement, range: Range): AiSelectedTextContext | null => {
      const parts = computeRangeTextParts(container, range)
      if (!parts.selected_text.trim()) return null
      const attr = (name: string) => container.getAttribute(name) || undefined
      const taskIdAttr = Number(attr("data-selection-task-id"))
      const channelIdAttr = Number(attr("data-selection-channel-id"))
      const componentId = attr("data-selection-component-id")
      const outputId = attr("data-selection-output-id")
      const componentTitle = attr("data-selection-component-title")
      const selectionTaskTitle = attr("data-selection-task-title")
      const channelName = attr("data-selection-channel-name")
      return {
        source_type: "component_output",
        selected_text: parts.selected_text,
        selection_before: parts.selection_before,
        selection_after: parts.selection_after,
        selection_start: parts.selection_start,
        selection_end: parts.selection_end,
        full_content_hash: computeFullContentHash(parts.full_text),
        ...(Number.isFinite(taskIdAttr) ? { task_id: taskIdAttr } : {}),
        ...(Number.isFinite(channelIdAttr) ? { channel_id: channelIdAttr } : {}),
        ...(componentId ? { component_id: componentId } : {}),
        ...(outputId ? { task_component_output_id: outputId } : {}),
        ...(componentTitle ? { component_title: componentTitle } : {}),
        ...(selectionTaskTitle ? { task_title: selectionTaskTitle } : {}),
        ...(channelName ? { channel_name: channelName } : {}),
      }
    },
    [],
  )

  const handleComponentSelectionAskAi = useCallback(
    async (context: AiSelectedTextContext) => {
      // Attach the selection immediately so the pane shows the chip as soon as it opens.
      setPendingTextSelection(context)
      const channelForThread = context.channel_id ?? selectedChannelId
      if (!channelForThread) return
      try {
        const { ensureAiThread } = await import("../../../features/ai-chat/ai-utils")
        const threadId = await ensureAiThread({ taskId, channelId: channelForThread })
        syncAiPaneUrlForBuild({ threadId })
      } catch (err) {
        console.error("[AskAiSelection] failed to open AI pane", err)
      }
    },
    [selectedChannelId, taskId, syncAiPaneUrlForBuild, setPendingTextSelection],
  )

  // Fixed "Add to chat" toolbar button: resolve the current DOM selection inside a component
  // output and attach it to the AI composer (same flow as the floating menu).
  const handleAskAiFromEditorSelection = useCallback(() => {
    if (typeof window === "undefined") return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    const anchorNode = range.commonAncestorContainer
    const anchorEl =
      anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as HTMLElement)
        : anchorNode.parentElement
    const container = anchorEl?.closest<HTMLElement>('[data-ai-selectable="component-output"]') ?? null
    if (!container) return
    const context = resolveComponentSelection(container, range)
    if (!context) return
    void handleComponentSelectionAskAi(context)
  }, [resolveComponentSelection, handleComponentSelectionAskAi])
  
  // AI build: per-component calls ai-chat directly; full briefing/main open composer prefill.
  const handleBuildWithAI = useCallback(async (componentId?: number | string) => {
    if (!selectedChannelId) {
      toast({
        title: 'Missing information',
        description: 'Please ensure a channel is selected',
        variant: 'destructive'
      })
      return
    }

    let trackedTaskComponentId: string | null = null

    // Mark target component(s) as generating so UI shows skeleton until stream content arrives
    if (componentId === 'main') {
      setIsGeneratingMainOutput(true)
    } else if (componentId !== undefined) {
      const allComponents = [...components, ...removedComponents]
      const comp = typeof componentId === 'string'
        ? allComponents.find((c) => c.task_component_id === componentId)
        : allComponents.find((c) => (c.briefing_component_id || c.project_component_id) === componentId)
      if (comp?.task_component_id) {
        trackedTaskComponentId = comp.task_component_id
        markGeneratingByTaskComponentId(comp.task_component_id, 'explicit_generate_component')
      }
    } else {
      const taskIds = components
        .filter((c) => c.selected && !!c.task_component_id)
        .map((c) => c.task_component_id as string)
      taskIds.forEach((id) => markGeneratingByTaskComponentId(id, 'explicit_generate_full_briefing'))
    }
    
    try {
      const { ensureAiThread } = await import('../../../features/ai-chat/ai-utils')
      const threadId = await ensureAiThread({ taskId, channelId: selectedChannelId })
      
      let preFillMessage = ''
      let mode: "build_component" | "build_briefing" | null = null
      let taskChannelComponentId: string | null = null
      let componentTitle: string | null = null
      
      if (componentId === 'main') {
        const taskName = taskTitle || `Task ${taskId}`
        const channelName = channels.find(c => c.channel_id === selectedChannelId)?.name || `Channel ${selectedChannelId}`
        const existing = componentOutputs.get(getOutputMapKeyFromBriefingId(MAIN_BRIEFING_COMPONENT_ID))?.content_text || ''

        preFillMessage = `Build the **Main content** for task **${taskName}** (channel: **${channelName}**).

Output requirements:
- Use clear structure with headings and paragraphs.
- Keep it ready to paste into the Main content editor.

${existing?.trim() ? `Current draft (for context, improve it):\n${existing}` : ''}`

        mode = "build_briefing"
      } else if (componentId) {
        const allComponents = [...components, ...removedComponents]
        let component =
          typeof componentId === 'string'
            ? allComponents.find(c => c.task_component_id === componentId)
            : allComponents.find(c => (c.briefing_component_id || c.project_component_id) === componentId)
        
        if (!component) {
          throw new Error('Component not found')
        }
        
        if (!component.task_component_id) {
          if (typeof componentId === 'string') {
            throw new Error('Component is missing an internal task id. Please refresh and try again.')
          }
          const { error } = await supabase.rpc('tcc_set_component', {
            p_task_id: taskId,
            p_channel_id: selectedChannelId,
            p_task_component_id: null,
            p_briefing_component_id: component.briefing_component_id ?? null,
            p_project_component_id: component.project_component_id ?? null,
            p_selected: true,
            p_position: component.position ?? null,
            p_custom_title: (component.custom_title ?? component.title) || null,
            p_custom_description: (component.custom_description ?? component.description) || null,
          })
          
          if (error) throw new Error(`Failed to add component to task: ${error.message}`)

          await queryClient.refetchQueries({
            queryKey: [...taskChannelBootstrapQueryKey(taskId, selectedChannelId)],
          })
          const refreshed = queryClient.getQueryData<TaskChannelBootstrapResponse>([
            ...taskChannelBootstrapQueryKey(taskId, selectedChannelId),
          ])
          const mapped = refreshed?.components
            ? mapBootstrapComponentRowsToActive(refreshed.components)
            : []
          const updatedComponent = mapped.find((c) =>
            typeof componentId === 'number'
              ? (c.briefing_component_id || c.project_component_id) === componentId
              : c.task_component_id === componentId,
          )

          if (!updatedComponent?.task_component_id) {
            throw new Error('Failed to add component to task. Please try again.')
          }

          component = updatedComponent
        }
        
        if (!component) {
          throw new Error('Component not found')
        }
        const taskName = taskTitle || `Task ${taskId}`
        componentTitle = component.custom_title || component.title
        const componentDescription = component.custom_description || component.description || ''
        
        preFillMessage = `Build the component **${componentTitle}** for task **${taskName}**.

Instructions:
${componentDescription}`
        
        mode = "build_component"
        taskChannelComponentId = component.task_component_id
        trackedTaskComponentId = component.task_component_id
      } else {
        const selectedComponents = components.filter(c => c.selected)
        
        if (selectedComponents.length === 0) {
          throw new Error('No components selected')
        }
        
        const taskName = taskTitle || `Task ${taskId}`
        const componentList = sortTaskChannelComponentsByPosition(selectedComponents)
          .map((c, idx) => {
            const title = c.custom_title || c.title
            const desc = c.custom_description || c.description || ''
            return `${idx + 1}. **${title}** --- ${desc}`
          })
          .join('\n')
        
        preFillMessage = `Build a full briefing for task **${taskName}** using structure:

${componentList}`
        
        mode = "build_briefing"
      }

      syncAiPaneUrlForBuild({ threadId })

      if (mode === "build_component" && taskChannelComponentId) {
        await startNewComponentGenerationLifecycle(
          taskChannelComponentId,
          'explicit_generate_component',
          {
            message: preFillMessage,
            componentLabel: componentTitle,
            autoRun: true,
          },
        )
        return
      }

      if (!mode) return

      syncAiPaneUrlForBuild({
        threadId,
        composerContext: {
          mode,
          componentId: taskChannelComponentId ?? undefined,
          preFillMessage,
          autoRun: false,
        },
      })
    } catch (err: any) {
      console.error('Failed to prepare AI chat:', err)
      if (trackedTaskComponentId) {
        clearGeneratingForTaskComponentId(trackedTaskComponentId)
        setComponents((prev) =>
          prev.map((row) => (
            row.task_component_id === trackedTaskComponentId
              ? { ...row, generationStatus: "error" }
              : row
          ))
        )
      }
      if (componentId === 'main') {
        setIsGeneratingMainOutput(false)
      }
      toast({
        title: 'Failed to open AI chat',
        description: err.message || 'Failed to prepare chat',
        variant: 'destructive'
      })
    }
  }, [
    selectedChannelId,
    components,
    removedComponents,
    channels,
    componentOutputs,
    taskId,
    taskTitle,
    supabase,
    queryClient,
    syncAiPaneUrlForBuild,
    startNewComponentGenerationLifecycle,
    markGeneratingByTaskComponentId,
    clearGeneratingForTaskComponentId,
  ])

  const handleQuickFiveStarReview = useCallback(async () => {
    try {
      const { error } = await submitTaskReview(supabase, {
        task_id: taskId,
        review_title: null,
        score_seo: 5,
        score_relevance: 5,
        score_grammar: 5,
        score_delays: 5,
        positive_feedback: null,
        negative_feedback: null,
      })

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('403')) {
          toast({
            title: 'Permission denied',
            description: 'You do not have permission to review this task.',
            variant: 'destructive',
          })
          return
        }
        throw error
      }

      toast({
        title: 'Review added',
        description: '5-star review submitted.',
      })

      queryClient.invalidateQueries({ queryKey: ['task', String(taskId)] })
    } catch (error: any) {
      toast({
        title: 'Failed to add review',
        description: error?.message || 'An error occurred while submitting your review.',
        variant: 'destructive',
      })
    }
  }, [supabase, taskId, queryClient])
  
  // Task-linked channels: bootstrap (task-details-bootstrap) or legacy DB fetch — never both on open.
  useEffect(() => {
    if (!canLoad) return
    const controller = new AbortController()
    const init = async () => {
      setIsLoading(true)
      setTaskChannelInitError(null)
      try {
        const initMode = resolveTaskChannelInitMode({
          skipInitialTaskChannelsFetch,
          bootstrapTaskChannels,
        })
        if (initMode.mode === 'bootstrap') {
          const list = initMode.channels
          setChannels(list)
          setSelectedChannelId((prev) => {
            let next: number | null = null
            if (list.length > 0) {
              next =
                preferredChannelId != null && list.some((c) => c.channel_id === preferredChannelId)
                  ? preferredChannelId
                  : prev != null && list.some((c) => c.channel_id === prev)
                  ? prev
                  : list[0].channel_id
            }
            if (next !== prev) {
              Promise.resolve().then(() => onChannelChange?.(next))
            }
            return next
          })
          return
        }
        await fetchTaskChannels(controller.signal)
      } finally {
        setIsLoading(false)
      }
    }
    void init()
    return () => controller.abort()
  }, [
    taskId,
    fetchTaskChannels,
    canLoad,
    skipInitialTaskChannelsFetch,
    bootstrapTaskChannels,
    onChannelChange,
    preferredChannelId,
  ])

  useEffect(() => {
    if (taskTitleProp) setTaskTitle(taskTitleProp)
  }, [taskTitleProp])

  useEffect(() => {
    const next = Array.isArray(taskSourceUrls) ? taskSourceUrls.join('\n') : (taskSourceUrls || "")
    setTaskSourceUrl(next)
  }, [taskSourceUrls])

  useEffect(() => {
    const onChannelsInvalidated = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: number | null; channelId?: number | null }>).detail
      if (!detail || detail.taskId == null || detail.taskId !== taskId) return
      void fetchTaskChannels().then((list) => {
        if (detail.channelId == null) return
        if (!list.some((row) => row.channel_id === detail.channelId)) return
        if (selectedChannelId !== detail.channelId) {
          setSelectedChannelId(detail.channelId)
          onChannelChange?.(detail.channelId)
        }
      })
    }
    window.addEventListener(TASK_CHANNELS_INVALIDATED_EVENT, onChannelsInvalidated as EventListener)
    return () => {
      window.removeEventListener(TASK_CHANNELS_INVALIDATED_EVENT, onChannelsInvalidated as EventListener)
    }
  }, [fetchTaskChannels, onChannelChange, selectedChannelId, taskId])

  useEffect(() => {
    return () => {
      queryClient.cancelQueries({ queryKey: ['task-channel-bootstrap', taskId] })
      queryClient.cancelQueries({ queryKey: ['task-channel-content', taskId] })
    }
  }, [queryClient, taskId])

  // Clear generating state when task or channel changes so we don't show stale "Generating content..." for another task/channel
  useEffect(() => {
    setGeneratingComponentKeys(new Set())
    setIsGeneratingMainOutput(false)
    setFocusedOutputCardKey(null)
  }, [taskId, selectedChannelId])

  useEffect(() => {
    const focusOutputsParam = searchParams.get(FOCUS_OUTPUTS_URL_PARAM)
    if (focusOutputsParam !== 'all') {
      suppressFocusOutputsUrlRestoreRef.current = false
    }
    if (focusOutputsParam !== 'all') return
    if (suppressFocusOutputsUrlRestoreRef.current) return
    if (focusedOutputCardKey === FOCUSED_ALL_SELECTED_OUTPUTS_KEY) return
    setFocusedOutputCardKey(FOCUSED_ALL_SELECTED_OUTPUTS_KEY)
    if (!isSectionExpanded && onToggleSectionExpand) onToggleSectionExpand()
  }, [searchParams, focusedOutputCardKey, isSectionExpanded, onToggleSectionExpand])
  
  // When selected channel changes, fetch related data
  useEffect(() => {
    if (!selectedChannelId) {
      setSelectedBriefingTypeId(null)
      setEffectiveDefaultBriefingTypeId(null)
      setIsNoBriefing(false)
      setBriefingTypeOptions([])
      setSeoData(null)
      setVariantSEOData(null)
      setPersistedTaskChannelSeoKeywords(null)
      return
    }

    let cancelled = false

    // Mark hydration in-flight so bootstrap-driven state updates can't trip save/generate logic.
    isHydratingTaskChannelRef.current = true

    setSelectedBriefingTypeId(null)
    setIsNoBriefing(false)
    setOptimisticBriefing(null)

    // NOTE: channel-scoped component/template clearing is intentionally NOT done here. It is owned
    // solely by the bootstrap components effect, which clears when no matching-channel data is
    // available yet and hydrates when it is. Clearing here would race that effect: when the new
    // channel's bootstrap payload is already cached, React Query returns it synchronously in this
    // same render, the components effect (defined earlier) hydrates first, and this effect would
    // then run and blank the freshly-hydrated list — the exact "switch back = empty" bug.

    // Clear SEO data for previous channel until fetch completes (avoids showing wrong task/channel keywords)
    setVariantSEOData(null)
    setSeoData(null)
    setPersistedTaskChannelSeoKeywords(null)

    // Clear mainLoadedRef for the new channel (only when channel changes, not on every rerun)
    mainLoadedRef.current.delete(selectedChannelId)

    // Immediately (re)fetch task-channel-bootstrap for the newly selected channel. Invalidate
    // (rather than remove) so the active query observer reliably refetches without aborting the
    // freshly-mounted request. Bootstrap is the source of truth and never triggers AI generation.
    const loadForChannel = () => {
      void queryClient.invalidateQueries({
        queryKey: [...taskChannelBootstrapQueryKey(taskId, selectedChannelId)],
      })
      void fetchChannelBriefingTypes()
    }

    loadForChannel()

    return () => {
      cancelled = true
    }
  }, [selectedChannelId, fetchChannelBriefingTypes, queryClient, taskId])

  // Failsafe: never leave the hydration guard stuck on if bootstrap settles (success or error).
  useEffect(() => {
    if (channelBootstrapQuery.isError || channelBootstrapQuery.isSuccess) {
      isHydratingTaskChannelRef.current = false
    }
  }, [channelBootstrapQuery.isError, channelBootstrapQuery.isSuccess, selectedChannelId])

  /** Briefing mode (`briefing_type_id`, `disable_briefing`) from `task-channel-bootstrap` — not `task_channel_briefings`. */
  useEffect(() => {
    if (!selectedChannelId) return
    if (!channelBootstrapQuery.isSuccess || !channelBootstrapQuery.data) return
    const boot = channelBootstrapQuery.data
    if (boot.channel_id !== selectedChannelId) return

    // Bootstrap data for the current channel has arrived; hydration is no longer in-flight.
    isHydratingTaskChannelRef.current = false

    const briefing = boot.briefing
    const disableBriefing = briefing?.disable_briefing ?? false
    const briefingTypeId = briefing?.briefing_type_id ?? null

    if (disableBriefing) {
      setSelectedBriefingTypeId(null)
      setIsNoBriefing(true)
      if (!mainLoadedRef.current.has(selectedChannelId)) {
        mainLoadedRef.current.add(selectedChannelId)
        void fetchComponentOutputRef.current({ briefingComponentId: MAIN_BRIEFING_COMPONENT_ID })
      }
      return
    }

    setIsNoBriefing(false)
    if (briefingTypeId != null) {
      setSelectedBriefingTypeId(briefingTypeId)
      return
    }

    setSelectedBriefingTypeId(null)
    const defaultId = effectiveDefaultBriefingTypeId
    if (!defaultId) {
      if (!mainLoadedRef.current.has(selectedChannelId)) {
        mainLoadedRef.current.add(selectedChannelId)
        void fetchComponentOutputRef.current({ briefingComponentId: MAIN_BRIEFING_COMPONENT_ID })
      }
    }
  }, [
    selectedChannelId,
    channelBootstrapQuery.isSuccess,
    channelBootstrapQuery.data,
    effectiveDefaultBriefingTypeId,
  ])
  
  // Fetch available channels when project/contentType changes
  useEffect(() => {
    if (!canLoad) return
    const controller = new AbortController()
    fetchAvailableChannels(controller.signal)
    return () => controller.abort()
  }, [projectId, contentTypeId, canLoad, fetchAvailableChannels])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className={isFocusedOutputMode ? "flex h-full min-h-0 flex-col gap-4" : "space-y-6"}>
      {/* Confirm Remove from template */}
      <AlertDialog open={!!confirmRemoveFromTemplate} onOpenChange={(open) => {
        if (!open) {
          setConfirmRemoveFromTemplate(null)
          document.body.style.pointerEvents = ''
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the component from the project briefing template. It can stay in this task if you keep it selected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemoveFromTemplate) {
                  handleRemoveFromTemplate(
                    confirmRemoveFromTemplate.componentBriefingId,
                    confirmRemoveFromTemplate.scope,
                    confirmRemoveFromTemplate.projectComponentId,
                    confirmRemoveFromTemplate.keepInTask,
                    confirmRemoveFromTemplate.component_key
                  )
                  setConfirmRemoveFromTemplate(null)
                  document.body.style.pointerEvents = ''
                }
              }}
            >
              Remove from template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Delete (selected component) */}
      <AlertDialog open={!!confirmDeleteSelected} onOpenChange={(open) => {
        if (!open) {
          setConfirmDeleteSelected(null)
          document.body.style.pointerEvents = ''
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete component?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteSelected?.project_component_id
                ? 'This will remove the project component from the project. It will be removed from all tasks and channels.'
                : 'This will remove the ad-hoc component from this task.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteSelected) {
                  handleDeleteSelectedComponent(confirmDeleteSelected)
                  setConfirmDeleteSelected(null)
                  document.body.style.pointerEvents = ''
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Delete (available component) */}
      <AlertDialog open={!!confirmDeleteAvailable} onOpenChange={(open) => {
        if (!open) {
          setConfirmDeleteAvailable(null)
          document.body.style.pointerEvents = ''
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete component?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteAvailable?.kind === 'project'
                ? 'This will remove the project component from the project.'
                : 'This will remove the ad-hoc component from this task.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteAvailable) {
                  handleDeleteAvailable(confirmDeleteAvailable)
                  setConfirmDeleteAvailable(null)
                  document.body.style.pointerEvents = ''
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm bulk delete */}
      <AlertDialog open={!!confirmBulkDelete} onOpenChange={(open) => {
        if (!open) {
          setConfirmBulkDelete(null)
          document.body.style.pointerEvents = ''
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected components?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulkDelete && (
                <>
                  This will delete {confirmBulkDelete.keys.length} component(s). This action cannot be undone.
                  {confirmBulkDelete.nonDeletableCount > 0 && (
                    <div className="mt-2 text-amber-600">
                      {confirmBulkDelete.nonDeletableCount} component(s) can&apos;t be deleted (global).
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmBulkDelete || confirmBulkDelete.keys.length === 0 || !projectId) {
                  setConfirmBulkDelete(null)
                  return
                }
                const concurrency = 3
                let done = 0
                let anyProjectDeleted = false
                for (let i = 0; i < confirmBulkDelete.keys.length; i += concurrency) {
                  const chunk = confirmBulkDelete.keys.slice(i, i + concurrency)
                  await Promise.all(
                    chunk.map(async (key) => {
                      const parsed = parseComponentKey(key)
                      if (parsed.kind === 'global' || parsed.kind === 'unknown') return
                      try {
                        if (parsed.kind === 'project' && parsed.projectComponentId != null) {
                          const { error } = await supabase.rpc('pbc_delete_project_component', {
                            p_project_id: projectId,
                            p_project_component_id: parsed.projectComponentId,
                          })
                          if (error) throw error
                          anyProjectDeleted = true
                          done++
                        } else if (parsed.kind === 'task_ad_hoc' && parsed.taskComponentId) {
                          const { error } = await supabase.rpc('tcc_delete_task_component', {
                            p_task_component_id: parsed.taskComponentId,
                          })
                          if (error) throw error
                          done++
                        }
                      } catch (err: any) {
                        console.error('Bulk delete item failed:', key, err)
                        toast({ title: 'Delete failed', description: err?.message ?? 'Unknown error', variant: 'destructive' })
                      }
                    })
                  )
                }
                await refreshAllComponentLists()
                invalidateTaskAllChannelsComponents(taskId)
                invalidateTaskAllChannelsAvailable(taskId)
                if (anyProjectDeleted) invalidateProjectTemplate(projectId)
                setBulkSelectedKeys(new Set())
                setIsMultiSelectMode(false)
                setConfirmBulkDelete(null)
                document.body.style.pointerEvents = ''
                const skipped = confirmBulkDelete.nonDeletableCount > 0 ? ` Skipped ${confirmBulkDelete.nonDeletableCount} global component(s).` : ''
                toast({ title: 'Bulk delete', description: `${done} component(s) deleted.${skipped}` })
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm bulk add to all channels */}
      <AlertDialog open={confirmBulkAddToAllChannels} onOpenChange={(open) => {
        if (!open) setConfirmBulkAddToAllChannels(false)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add to all channels in this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add the {bulkSelectedKeys.size} selected component(s) to all channels in this task.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const keys = Array.from(bulkSelectedKeys)
                const availableItems = (availableList ?? []) as TaskChannelAvailableComponent[]
                const concurrency = 3
                let done = 0
                for (let i = 0; i < keys.length; i += concurrency) {
                  const chunk = keys.slice(i, i + concurrency)
                  await Promise.all(
                    chunk.map(async (key) => {
                      const comp = components.find((c) => (getComponentKeyForSelectedRow(c) ?? c.component_key) === key)
                      if (comp) {
                        await handleAddToAllChannelsInTask(comp)
                        done++
                      } else {
                        const item = availableItems.find((it: TaskChannelAvailableComponent) => (it.component_key ?? it.key) === key)
                        if (item) {
                          await handleAddToAllChannelsInTaskForAvailable(item)
                          done++
                        }
                      }
                    })
                  )
                }
                await refreshAllComponentLists()
                setBulkSelectedKeys(new Set())
                setIsMultiSelectMode(false)
                setConfirmBulkAddToAllChannels(false)
                toast({ title: 'Bulk add to channels', description: `${done} component(s) added to all channels.` })
              }}
            >
              Add to all channels
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Overwrite project template (selected card): show diff then call pbtc_update + sync */}
      <AlertDialog open={!!confirmOverwriteTemplate} onOpenChange={(open) => {
        if (!open) {
          setConfirmOverwriteTemplate(null)
          document.body.style.pointerEvents = ''
        }
      }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite project template?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {confirmOverwriteTemplate && (() => {
                  const comp = confirmOverwriteTemplate
                  const componentKey = (getComponentKeyForSelectedRow(comp) || comp.component_key) ?? ''
                  const fromTemplate = availableTemplateByKey.get(componentKey)
                  const oldTitle = fromTemplate?.title ?? ''
                  const oldDesc = fromTemplate?.description ?? ''
                  const newTitle = (comp.custom_title ?? comp.title) ?? ''
                  const newDesc = (comp.custom_description ?? comp.description) ?? ''
                  return (
                    <>
                      <p className="text-gray-600">This will replace the template with the current card values.</p>
                      <div className="grid grid-cols-2 gap-4 rounded border border-gray-200 p-3 bg-gray-50/50">
                        <div>
                          <p className="font-medium text-gray-500 mb-1">Current in template</p>
                          <p className="font-medium text-gray-900">{oldTitle || '—'}</p>
                          <p className="text-gray-600 mt-1 whitespace-pre-wrap">{oldDesc || '—'}</p>
                        </div>
                        <div>
                          <p className="font-medium text-gray-500 mb-1">New (from card)</p>
                          <p className="font-medium text-gray-900">{newTitle || '—'}</p>
                          <p className="text-gray-600 mt-1 whitespace-pre-wrap">{newDesc || '—'}</p>
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmOverwriteTemplate) {
                  handleApplyToProjectTemplateFromMenu(confirmOverwriteTemplate)
                  setConfirmOverwriteTemplate(null)
                  document.body.style.pointerEvents = ''
                }
              }}
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm update briefing template meta (title/description) via pbt_update_meta */}
      <AlertDialog open={!!confirmBriefingMetaUpdate} onOpenChange={(open) => {
        if (!open) {
          setConfirmBriefingMetaUpdate(null)
          document.body.style.pointerEvents = ''
        }
      }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Update briefing template details?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p className="text-gray-600">
                  This updates the briefing title/description for the whole project, affecting all tasks that use this briefing type.
                </p>
                {confirmBriefingMetaUpdate && (
                  <div className="grid grid-cols-2 gap-4 rounded border border-gray-200 p-3 bg-gray-50/50">
                    <div>
                      <p className="font-medium text-gray-500 mb-1">Current</p>
                      <p className="font-medium text-gray-900">{confirmBriefingMetaUpdate.oldTitle || '—'}</p>
                      <p className="text-gray-600 mt-1 whitespace-pre-wrap text-xs">{confirmBriefingMetaUpdate.oldDescription || '—'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-500 mb-1">New</p>
                      <p className="font-medium text-gray-900">{confirmBriefingMetaUpdate.newTitle || '—'}</p>
                      <p className="text-gray-600 mt-1 whitespace-pre-wrap text-xs">{confirmBriefingMetaUpdate.newDescription || '—'}</p>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleConfirmBriefingMetaUpdate()
                document.body.style.pointerEvents = ''
              }}
            >
              Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm before regenerating AI content for the channel (only when content may be replaced) */}
      <AlertDialog open={!!confirmGenerateWithAi} onOpenChange={(open) => {
        if (!open) {
          setConfirmGenerateWithAi(null)
          document.body.style.pointerEvents = ''
        }
      }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing content?</AlertDialogTitle>
            <AlertDialogDescription>
              This task channel already has generated or edited content. Generating again may replace existing sections. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const channelId = confirmGenerateWithAi?.channelId ?? null
                setConfirmGenerateWithAi(null)
                document.body.style.pointerEvents = ''
                if (channelId != null) void runGenerateWithAi(channelId)
              }}
            >
              Generate and replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Content section title with channel pills row below */}
      {!isFocusedOutputMode ? (
      <div>
        <div className="mb-3 mt-6 space-y-2">
          <h3 className="text-base font-medium text-gray-900">Content</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {channels.map((channel) => (
              <span
                key={channel.channel_id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (removingChannelIds.has(channel.channel_id)) return
                  setSelectedChannelId(channel.channel_id)
                  onChannelChange?.(channel.channel_id)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedChannelId(channel.channel_id); onChannelChange?.(channel.channel_id); } }}
                className={`
                  inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-sm cursor-pointer
                  ${removingChannelIds.has(channel.channel_id) ? 'opacity-60 cursor-not-allowed' : ''}
                  ${selectedChannelId === channel.channel_id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 border-0'}
                `}
              >
                {channel.name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (removingChannelIds.has(channel.channel_id)) return
                    handleRemoveChannel(channel.channel_id)
                  }}
                  className="hover:text-red-600 p-0.5 -m-0.5"
                  disabled={removingChannelIds.has(channel.channel_id)}
                >
                  {removingChannelIds.has(channel.channel_id) ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <X className="w-2.5 h-2.5" />
                  )}
                </button>
              </span>
            ))}
            {/* Add-channel popover: lists channels to add, plus "Manage project channels" when a project is set. */}
            {(() => {
              const addableChannels = availableChannels.filter(
                (c) => !channels.some((t) => t.channel_id === c.channel_id),
              )
              const showAddChannel =
                channels.length === 0 || addableChannels.length > 0 || projectId != null
              if (!showAddChannel) return null
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" className="text-gray-600 hover:text-gray-900 h-7 px-2 text-sm">
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add Channel
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2">
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {addableChannels.length > 0 ? (
                        addableChannels.map((channel) => (
                          <button
                            key={channel.channel_id}
                            type="button"
                            className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                            onClick={() => {
                              handleAddChannel(channel.channel_id)
                            }}
                          >
                            {channel.name}
                          </button>
                        ))
                      ) : (
                        <p className="px-2 py-1.5 text-sm text-gray-500">
                          No channels available to add.
                        </p>
                      )}
                      {projectId ? (
                        <>
                          <div className="my-1 border-t border-gray-200" />
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
                            onClick={() => setIsManageChannelsOpen(true)}
                          >
                            Manage project channels
                          </button>
                        </>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
              )
            })()}
          </div>
        </div>
        {projectId ? (
          <Dialog open={isManageChannelsOpen} onOpenChange={setIsManageChannelsOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Manage project channels</DialogTitle>
              </DialogHeader>
              <ProjectChannelsManager
                projectId={projectId}
                variant="list"
                onChannelsChanged={() => {
                  void fetchAvailableChannels()
                }}
              />
            </DialogContent>
          </Dialog>
        ) : null}
        {taskChannelInitError ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {taskChannelInitError}
          </div>
        ) : null}
        {channelBootstrapErrorMessage ? (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Failed to load channel-specific content. {channelBootstrapErrorMessage}
          </div>
        ) : null}

        {/* Legacy briefing-type controls removed from Content tab (data kept in DB). */}
        {false && selectedChannelId && (
          <div className="mt-4 space-y-2">
            <Label className="text-sm font-normal text-gray-400 block text-left">Briefing type</Label>
            <div className="w-full min-w-0">
              <div className="relative w-full min-w-0">
                <div
                  ref={briefingDropdownTriggerRef}
                  className={`relative flex h-10 min-h-10 w-full min-w-0 items-center rounded-md border text-sm ${
                    isBriefingTypeRowActive ? "border-gray-300" : "border-gray-200"
                  } bg-white`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (inlineBriefingTitleEditId != null) return
                    setIsBriefingTypeRowActive(true)
                    setIsBriefingDropdownOpen((prev) => !prev)
                    setIsAddingBriefingInline(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      if (inlineBriefingTitleEditId != null) return
                      setIsBriefingTypeRowActive(true)
                      setIsBriefingDropdownOpen((prev) => !prev)
                    }
                    if (event.key === "Escape") {
                      setIsBriefingDropdownOpen(false)
                      setIsBriefingTypeRowActive(false)
                      setIsAddingBriefingInline(false)
                      cancelInlineBriefingTitle()
                    }
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-center pl-3 pr-24">
                    {inlineBriefingTitleEditId != null &&
                    effectiveBriefingTypeId != null &&
                    inlineBriefingTitleEditId === effectiveBriefingTypeId ? (
                      <Input
                        ref={inlineBriefingTitleInputRef}
                        value={inlineBriefingTitleDraft}
                        onChange={(e) => setInlineBriefingTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            skipNextInlineBriefingBlurCommitRef.current = true
                            void commitInlineBriefingTitle()
                            setInlineBriefingTitleEditId(null)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            skipNextInlineBriefingBlurCommitRef.current = true
                            cancelInlineBriefingTitle()
                            setIsBriefingDropdownOpen(false)
                            setIsBriefingTypeRowActive(false)
                          }
                        }}
                        onBlur={() => {
                          if (skipNextInlineBriefingBlurCommitRef.current) {
                            skipNextInlineBriefingBlurCommitRef.current = false
                            return
                          }
                          window.setTimeout(() => {
                            const activeElement = document.activeElement
                            if (activeElement instanceof Node && briefingDropdownContentRef.current?.contains(activeElement)) {
                              return
                            }
                            void commitInlineBriefingTitle()
                            setInlineBriefingTitleEditId(null)
                          }, 0)
                        }}
                        className="h-8 min-w-0 flex-1 border-gray-200 px-2 py-1 text-sm"
                        aria-label="Briefing title"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-900" title={displayBriefingRowTitle}>
                        {displayBriefingRowTitle}
                      </span>
                    )}
                  </div>

                  {!isNoBriefing && effectiveBriefingTypeId != null ? (
                    <button
                      type="button"
                      className="absolute right-16 inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        startInlineBriefingTitleEdit()
                      }}
                      aria-label="Edit briefing title"
                      title="Edit briefing title"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  ) : null}

                  {!isNoBriefing && dropdownExplicitBriefingTypeId != null ? (
                    <button
                      type="button"
                      className="absolute right-9 inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleClearBriefing()
                        setIsBriefingDropdownOpen(false)
                        setIsBriefingTypeRowActive(false)
                      }}
                      aria-label="Clear briefing"
                      title="Clear briefing"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="absolute right-0 inline-flex h-10 w-9 items-center justify-center text-gray-500 hover:text-gray-700"
                    aria-label={isBriefingDropdownOpen ? "Close briefing dropdown" : "Open briefing dropdown"}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setIsBriefingTypeRowActive(true)
                      setIsBriefingDropdownOpen((prev) => !prev)
                      setIsAddingBriefingInline(false)
                    }}
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${isBriefingDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {isBriefingDropdownOpen ? (
                  <div
                    ref={briefingDropdownContentRef}
                    className="absolute left-0 right-0 top-full z-50 mt-1 w-full rounded-md border border-gray-200 bg-white p-1 shadow-lg"
                  >
                    {isAddingBriefingInline ? (
                      <div className="space-y-2 px-2 py-2">
                        <Input
                          ref={addBriefingInlineInputRef}
                          value={createBriefingTitle}
                          onChange={(event) => setCreateBriefingTitle(event.target.value)}
                          placeholder="Create new briefing"
                          className="h-8 text-sm"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault()
                              void handleCreateBriefingSubmit()
                              setIsAddingBriefingInline(false)
                              setIsBriefingDropdownOpen(false)
                              setIsBriefingTypeRowActive(false)
                            }
                            if (event.key === "Escape") {
                              event.preventDefault()
                              setIsAddingBriefingInline(false)
                              setCreateBriefingTitle("")
                            }
                          }}
                          disabled={isCreatingBriefing}
                        />
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-auto">
                        {groupedBriefingTypeOptions.assigned.length > 0 ? (
                          <>
                            <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Assigned to this channel</div>
                            {groupedBriefingTypeOptions.assigned.map((type) => (
                              <button
                                key={type.id}
                                type="button"
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => {
                                  void handleBriefingTypeChange(type.id)
                                  setIsBriefingDropdownOpen(false)
                                  setIsBriefingTypeRowActive(false)
                                }}
                              >
                                <span className="truncate">{type.title}</span>
                                {type.isDefaultForChannel ? (
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                                    Default
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </>
                        ) : null}

                        {groupedBriefingTypeOptions.available.length > 0 ? (
                          <>
                            <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Available in project</div>
                            {groupedBriefingTypeOptions.available.map((type) => (
                              <button
                                key={type.id}
                                type="button"
                                className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                onClick={() => {
                                  void handleBriefingTypeChange(type.id)
                                  setIsBriefingDropdownOpen(false)
                                  setIsBriefingTypeRowActive(false)
                                }}
                              >
                                <span className="truncate">{type.title}</span>
                              </button>
                            ))}
                          </>
                        ) : null}

                        <button
                          type="button"
                          className="flex w-full items-center border-t border-gray-100 px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                          onClick={() => {
                            setIsAddingBriefingInline(true)
                            setCreateBriefingTitle("")
                            setCreateBriefingDescription("")
                          }}
                        >
                          + Create new briefing
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                          onClick={() => {
                            handleManageTemplates()
                            setIsBriefingDropdownOpen(false)
                            setIsBriefingTypeRowActive(false)
                          }}
                        >
                          Manage briefings
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
                          onClick={() => {
                            setIsImportTemplateOpen(true)
                            setIsBriefingDropdownOpen(false)
                            setIsBriefingTypeRowActive(false)
                          }}
                        >
                          Import template
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            {/* Briefing instruction controls removed from Content tab. */}
          </div>
        )}

      </div>
      ) : null}

      {selectedChannelId && projectId && (
        <Dialog open={isCreateBriefingOpen} onOpenChange={(open) => { if (!isCreatingBriefing) setIsCreateBriefingOpen(open) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create new briefing</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="create-briefing-title">Title (required)</Label>
                <Input
                  id="create-briefing-title"
                  value={createBriefingTitle}
                  onChange={(e) => setCreateBriefingTitle(e.target.value)}
                  placeholder="Briefing title"
                  disabled={isCreatingBriefing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-briefing-desc">Description (optional)</Label>
                <Textarea
                  id="create-briefing-desc"
                  value={createBriefingDescription}
                  onChange={(e) => setCreateBriefingDescription(e.target.value)}
                  placeholder="Briefing description"
                  rows={3}
                  disabled={isCreatingBriefing}
                  className="resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { if (!isCreatingBriefing) { setIsCreateBriefingOpen(false); setCreateBriefingTitle(''); setCreateBriefingDescription('') } }}
                disabled={isCreatingBriefing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateBriefingSubmit}
                disabled={isCreatingBriefing || !createBriefingTitle.trim()}
              >
                {isCreatingBriefing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creating…
                  </>
                ) : (
                  'Create and apply'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {selectedChannelId && projectId && (
        <Dialog open={isImportTemplateOpen} onOpenChange={setIsImportTemplateOpen}>
          <DialogContent className="w-[calc(100vw-2rem)] sm:w-full max-w-3xl max-h-[85vh] overflow-hidden p-0">
            <div className="flex flex-col h-full max-h-[85vh]">
              <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
                <DialogTitle>Import template (from source)</DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0 px-6 pb-6 overflow-auto">
                <StructureReviewPanel
                  taskId={taskId}
                  existingComponents={components}
                  onSuggestionsReceived={() => {}}
                  onApplyComponent={handleApplyComponent}
                  onApplyAll={handleApplyAllComponents}
                  initialSourceUrl={taskSourceUrl}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Virtual Main content — only when the content RPC reports no active concrete components. */}
      {selectedChannelId && fallbackMainRequired && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Label className="text-sm font-normal text-gray-400 block">Main content</Label>
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => void handleCopyMainContent()}
              disabled={isCopyingContent}
              title="Copy main content"
              aria-label="Copy main content"
            >
              {isCopyingContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              Copy content
            </button>
          </div>
          <div className="group relative border rounded-lg bg-white p-3">
            {loadingOutputs.has(MAIN_BRIEFING_COMPONENT_ID) || isGeneratingMainOutput ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                {isGeneratingMainOutput && (
                  <p className="text-xs text-gray-500">Generating content…</p>
                )}
              </div>
            ) : (
              <>
                <ResizableEditor
                  componentId={MAIN_BRIEFING_COMPONENT_ID}
                  editorWrapperClassName={COMPONENT_OUTPUT_EDITOR_CLASS}
                  value={componentOutputs.get(getOutputMapKeyFromBriefingId(MAIN_BRIEFING_COMPONENT_ID))?.content_text || ''}
                  onChange={(text) => {
                    const mainOutputKey = getOutputMapKeyFromBriefingId(MAIN_BRIEFING_COMPONENT_ID)
                    outputValuesRef.current.set(mainOutputKey, text)
                    markOutputDirty(mainOutputKey)
                    const previousBlocks = getOutputBlocks(componentOutputsRef.current.get(mainOutputKey) ?? null)
                    outputJsonValuesRef.current.set(mainOutputKey, mergeTextChangesIntoExistingBlocks(previousBlocks, text))
                    setComponentOutputs(prev => {
                      const newMap = new Map(prev)
                      const nextBlocks = outputJsonValuesRef.current.get(mainOutputKey)
                        ?? mergeTextChangesIntoExistingBlocks(getOutputBlocks(newMap.get(mainOutputKey) ?? null), text)
                      newMap.set(
                        mainOutputKey,
                        buildOutputRecord(newMap.get(mainOutputKey), {
                          content_text: text,
                          content_json: nextBlocks,
                          updated_at: new Date().toISOString(),
                        })
                      )
                      return newMap
                    })
                    void persistVirtualMainContent(text)
                  }}
                  toolbarId={`ql-toolbar-main-${taskId}-${selectedChannelId}`}
                  onFocus={() =>
                    onActiveFieldChange?.({
                      fieldType: "main_content_output",
                      label: "Main content",
                      entityId: MAIN_BRIEFING_COMPONENT_ID,
                      instructions: taskBuildInstructions || null,
                    })
                  }
                  footerLeft={null}
                  toolbarVisibility="always"
                  skipValueNormalization
                />
                {componentOutputs.get(getOutputMapKeyFromBriefingId(MAIN_BRIEFING_COMPONENT_ID))?.updated_at ? (
                  <div
                    className="px-1 text-xs text-gray-400"
                    title={new Date(componentOutputs.get(getOutputMapKeyFromBriefingId(MAIN_BRIEFING_COMPONENT_ID))!.updated_at as string).toLocaleString()}
                  >
                    Updated {formatRelativeTime(componentOutputs.get(getOutputMapKeyFromBriefingId(MAIN_BRIEFING_COMPONENT_ID))!.updated_at as string)}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}

      {/* Components panel — always available for an attached channel (briefing-independent). */}
      {selectedChannelId && (
        <div
          className={isFocusedOutputMode ? "flex min-h-0 flex-1 flex-col" : undefined}
        >
          {isFocusedSingleOutputMode ? (
          <div className="mb-2 flex items-center justify-end">
            <button
              type="button"
              onClick={exitFocusedOutputMode}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              title="Exit focused output mode"
              aria-label="Exit focused output mode"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>
          ) : null}
          {!isFocusedOutputMode && (() => {
            const selectedPileKeys = new Set(components.map((c) => (getComponentKeyForSelectedRow(c) ?? c.component_key) ?? '').filter(Boolean))
            const availableItems = (availableList ?? []) as TaskChannelAvailableComponent[]
            const availablePileKeys = new Set(availableItems.map((it: TaskChannelAvailableComponent) => it.component_key ?? it.key).filter(Boolean))
            const selectedCount = Array.from(bulkSelectedKeys).filter((k) => selectedPileKeys.has(k)).length
            const unselectedCount = Array.from(bulkSelectedKeys).filter((k) => availablePileKeys.has(k)).length
            const showAdd = unselectedCount > 0 && selectedCount === 0
            const showExclude = selectedCount > 0 && unselectedCount === 0
            const hasDeletableItems = Array.from(bulkSelectedKeys).some((k) => {
              const p = parseComponentKey(k)
              return p.kind === 'project' || p.kind === 'task_ad_hoc'
            })
            return (
              <>
                {bulkSelectedKeys.size > 0 && (
                  <div className="mb-2 flex w-full flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <span className="text-sm text-gray-600 mr-1">
                      {bulkSelectedKeys.size} selected
                    </span>
                    {showAdd && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const keys = Array.from(bulkSelectedKeys)
                          const availableItemsList = (availableList ?? []) as TaskChannelAvailableComponent[]
                          let done = 0
                          const concurrency = 3
                          for (let i = 0; i < keys.length; i += concurrency) {
                            const chunk = keys.slice(i, i + concurrency)
                            await Promise.all(
                              chunk.map(async (key) => {
                                const item = availableItemsList.find((it: TaskChannelAvailableComponent) => (it.component_key ?? it.key) === key)
                                if (item) {
                                  await handleAddAvailableComponent(item)
                                  done++
                                }
                              })
                            )
                          }
                          await refreshAllComponentLists()
                          setBulkSelectedKeys(new Set())
                          setIsMultiSelectMode(false)
                          toast({ title: 'Bulk add', description: `${done} component(s) added to task.` })
                        }}
                      >
                        Add to task
                      </Button>
                    )}
                    {showExclude && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const keys = Array.from(bulkSelectedKeys)
                          let done = 0
                          const concurrency = 3
                          for (let i = 0; i < keys.length; i += concurrency) {
                            const chunk = keys.slice(i, i + concurrency)
                            await Promise.all(
                              chunk.map(async (key) => {
                                const comp = components.find((c) => (getComponentKeyForSelectedRow(c) ?? c.component_key) === key)
                                if (comp) {
                                  await handleToggleComponent(comp, false)
                                  done++
                                }
                              })
                            )
                          }
                          await refreshAllComponentLists()
                          setBulkSelectedKeys(new Set())
                          setIsMultiSelectMode(false)
                          toast({ title: 'Bulk exclude', description: `${done} component(s) excluded from task.` })
                        }}
                      >
                        Exclude from task
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmBulkAddToAllChannels(true)}
                    >
                      Add to all channels (this task)
                    </Button>
                    {hasDeletableItems && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          const keys = Array.from(bulkSelectedKeys)
                          const nonDeletable = keys.filter((k) => parseComponentKey(k).kind === 'global')
                          const deletable = keys.filter((k) => parseComponentKey(k).kind !== 'global' && parseComponentKey(k).kind !== 'unknown')
                          setConfirmBulkDelete({ keys: deletable, nonDeletableCount: nonDeletable.length })
                        }}
                      >
                        Delete
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBulkSelectedKeys(new Set())}
                    >
                      Clear selection
                    </Button>
                  </div>
                )}
              </>
            )
          })()}
          {components.length === 0 ? null : (
            <div className={`${isFocusedOutputMode ? "flex min-h-0 flex-1 flex-col" : ""} transition-opacity`}>
              {isFocusedAllOutputsMode ? (
                <div className="-mx-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="space-y-4 px-4 pb-6">
                      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {channels.map((channel) => (
                              <span
                                key={channel.channel_id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (removingChannelIds.has(channel.channel_id)) return
                                  setSelectedChannelId(channel.channel_id)
                                  onChannelChange?.(channel.channel_id)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    if (removingChannelIds.has(channel.channel_id)) return
                                    setSelectedChannelId(channel.channel_id)
                                    onChannelChange?.(channel.channel_id)
                                  }
                                }}
                                className={`
                                  inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-sm cursor-pointer
                                  ${removingChannelIds.has(channel.channel_id) ? 'opacity-60 cursor-not-allowed' : ''}
                                  ${selectedChannelId === channel.channel_id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 border-0'}
                                `}
                              >
                                {channel.name}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (removingChannelIds.has(channel.channel_id)) return
                                    handleRemoveChannel(channel.channel_id)
                                  }}
                                  className="hover:text-red-600 p-0.5 -m-0.5"
                                  disabled={removingChannelIds.has(channel.channel_id)}
                                >
                                  {removingChannelIds.has(channel.channel_id) ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  ) : (
                                    <X className="w-2.5 h-2.5" />
                                  )}
                                </button>
                              </span>
                            ))}
                            {availableChannels.filter((c) => !channels.some((t) => t.channel_id === c.channel_id)).length > 0 && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-gray-600 hover:text-gray-900 h-7 w-7 px-0"
                                    title="Add channel"
                                    aria-label="Add channel"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2">
                                  <div className="space-y-1 max-h-60 overflow-y-auto">
                                    {availableChannels
                                      .filter((c) => !channels.some((t) => t.channel_id === c.channel_id))
                                      .map((channel) => (
                                        <button
                                          key={channel.channel_id}
                                          type="button"
                                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                                          onClick={() => {
                                            handleAddChannel(channel.channel_id)
                                          }}
                                        >
                                          {channel.name}
                                        </button>
                                      ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
                            <button
                              type="button"
                              className={FOCUSED_TOPBAR_COMPACT_BUTTON_CLASS}
                              onClick={() => setActiveFocusedPanel((prev) => (prev === "comments" ? null : "comments"))}
                            >
                              Comments {focusedCommentCount}
                            </button>
                            <button
                              type="button"
                              className={FOCUSED_TOPBAR_COMPACT_BUTTON_CLASS}
                              onClick={() => setActiveFocusedPanel((prev) => (prev === "seo" ? null : "seo"))}
                            >
                              SEO
                              {focusedHasSeoWarning ? <AlertTriangle className="ml-1 h-3.5 w-3.5 text-amber-500" /> : null}
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                                  aria-label="Focused mode actions"
                                  title="More actions"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => setIsFocusedSearchOpen((prev) => !prev)}>
                                  Find and replace
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setIsFocusedNavigatorOpen((prev) => !prev)}>
                                  Navigation
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void handleCopyFocusedShareLink()}>
                                  Copy link
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void handleExportComponentsToWord()}>
                                  Download Word
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <button
                              type="button"
                              onClick={exitFocusedAllOutputsToDetails}
                              className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                              title="Exit focused output mode"
                              aria-label="Exit focused output mode"
                            >
                              <Minimize2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2">
                          <CompactToolbar editor={focusedWorkspaceToolbarEditor} sticky={false} />
                        </div>
                        {isFocusedSearchOpen ? (
                          <div ref={focusedSearchPopoverRef} className="mt-2 rounded-md border border-gray-200 bg-white p-2 shadow-sm">
                            <div className="grid gap-2">
                              <Input
                                value={focusedSearchTerm}
                                onChange={(event) => setFocusedSearchTerm(event.target.value)}
                                placeholder="Search in focused outputs"
                                className="h-8 w-full text-xs"
                              />
                              <Input
                                value={focusedReplaceTerm}
                                onChange={(event) => setFocusedReplaceTerm(event.target.value)}
                                placeholder="Replace with"
                                className="h-8 w-full text-xs"
                              />
                              <div className="flex flex-wrap items-center gap-1">
                                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => navigateFocusedSearchMatch('prev')} disabled={focusedSearchMatches.length === 0}>Prev</Button>
                                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => navigateFocusedSearchMatch('next')} disabled={focusedSearchMatches.length === 0}>Next</Button>
                                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleFocusedReplaceOne} disabled={focusedSearchMatches.length === 0 || !focusedSearchTerm.trim()}>Replace</Button>
                                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleFocusedReplaceAll} disabled={!focusedSearchTerm.trim()}>Replace all</Button>
                                <span className="ml-auto text-[11px] text-gray-500">
                                  {focusedSearchMatches.length === 0
                                    ? 'No matches'
                                    : `${focusedSearchActiveIndex + 1}/${focusedSearchMatches.length}`}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {isFocusedNavigatorOpen ? (
                          <div ref={focusedNavigatorPopoverRef} className="mt-2 rounded-md border border-gray-200 bg-white p-1 shadow-sm">
                            <div className="max-h-60 overflow-y-auto">
                              {focusedNavigatorItems.map((item, idx) => (
                                <button
                                  key={item.cardKey}
                                  type="button"
                                  onClick={() => scrollToFocusedOutput(item.anchorId)}
                                  className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
                                  title={item.title}
                                >
                                  {idx + 1}. {item.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={focusedSelectedComponents.map(c => c.task_component_id || c.component_key || `temp-${c.briefing_component_id ?? c.project_component_id ?? 'u'}`)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-4">
                            {focusedSelectedComponents.map((component, idx) => {
                              const itemKey = getSelectedCardKey(component)
                              const sortableId = component.task_component_id || component.component_key || `temp-${component.briefing_component_id ?? component.project_component_id ?? 'u'}`
                              const resolvedOutput = getResolvedOutputForComponent(component)
                              const isStreamGenerating = !!(
                                component.task_component_id
                                && generatingComponentKeys.has(getGeneratingKeyFromTaskComponentId(component.task_component_id))
                              )
                              const componentTitle = (component.custom_title ?? component.title ?? '').trim() || `Component ${idx + 1}`
                              const insertPositionAfter = idx + 1
                              const componentToggleKey = (component.component_key ?? getComponentKeyForSelectedRow(component) ?? '')
                              const isFocusedCommentsTarget = focusedCommentsTargetCardKey === getSelectedCardKey(component)
                              const componentOutputId = resolvedOutput?.task_component_output_id ?? null
                              const componentOutputCommentThreads = componentOutputId
                                ? (outputCommentThreadsByOutputId.get(componentOutputId) ?? [])
                                : []
                              const focusedComponentCommentHighlights = (shouldRenderFocusedCommentHighlights && isFocusedCommentsTarget)
                                ? focusedBrowseThreads
                                    .map((thread) => {
                                      const start = thread.target.anchorStart
                                      const end = thread.target.anchorEnd
                                      if (start == null || end == null || end <= start) return null
                                      const latest = thread.previewComment ?? thread.latestComment ?? thread.firstComment ?? null
                                      return {
                                        id: thread.threadId,
                                        start,
                                        end,
                                        color: thread.resolvedAt ? "rgba(156, 163, 175, 0.22)" : "rgba(251, 191, 36, 0.24)",
                                        preview: {
                                          authorName: latest?.users?.full_name ?? latest?.users?.email ?? (thread.createdBy != null ? `User #${thread.createdBy}` : null),
                                          authorPhoto: latest?.users?.photo ?? null,
                                          createdAt: latest?.created_at ?? thread.createdAt ?? null,
                                          text: latest?.comment ?? thread.target.anchorQuote ?? null,
                                        },
                                      }
                                    })
                                    .filter(Boolean)
                                : []
                              return (
                                <React.Fragment key={itemKey}>
                                  <FocusedSortableWorkspaceItem
                                    sortableId={sortableId}
                                    anchorId={getFocusedOutputAnchorId(itemKey)}
                                    title={componentTitle}
                                    onExclude={() => void handleToggleComponent(component, false)}
                                    isExcluding={togglingComponentKey === componentToggleKey}
                                  >
                                    <FocusedOutputsWorkspaceItem
                                      component={component}
                                      output={resolvedOutput}
                                      taskId={taskId}
                                      channelId={selectedChannelId}
                                      isLoadingOutput={loadingOutputs.has(component.briefing_component_id || 0)}
                                      isGeneratingOutput={isStreamGenerating}
                                      onOutputChange={(text) => {
                                        const saveTarget = getOutputSaveTargetForComponent(component)
                                        const outputKey = saveTarget?.outputKey ?? getOutputMapKeyFromComponent(component)
                                        if (!outputKey) return
                                        outputValuesRef.current.set(outputKey, text)
                                        markOutputDirty(outputKey)
                                        const previousBlocks =
                                          outputJsonValuesRef.current.get(outputKey)
                                          ?? getOutputBlocks(componentOutputsRef.current.get(outputKey) ?? null)
                                        outputJsonValuesRef.current.set(outputKey, mergeTextChangesIntoExistingBlocks(previousBlocks, text))
                                        debouncedFlushOutputState(outputKey)
                                      }}
                                      onSaveOutput={() => {
                                        const saveTarget = getOutputSaveTargetForComponent(component)
                                        if (!saveTarget) return
                                        debouncedSaveOutput(saveTarget)
                                      }}
                                      onLoadOutput={() => {
                                        const saveTarget = getOutputSaveTargetForComponent(component)
                                        fetchComponentOutput({
                                          taskComponentId: component.task_component_id ?? null,
                                          briefingComponentId: saveTarget?.mode === 'briefing' ? saveTarget.briefingComponentId : null,
                                        })
                                      }}
                                      onBuildWithAI={handleBuildWithAI}
                                      onActiveFieldChange={handleActiveFieldChangeWrapped}
                                      highlightTerms={focusedWorkspaceHighlightTerms}
                                      commentHighlights={focusedComponentCommentHighlights as any}
                                      showCommentHighlights={shouldRenderFocusedCommentHighlights && isFocusedCommentsTarget}
                                      onCommentHighlightClick={(threadId) => {
                                        setFocusedCommentsActiveThreadId(Number(threadId))
                                        setActiveFocusedPanel("comments")
                                      }}
                                      onCommentAction={(selection) => {
                                        setFocusedCommentsTargetCardKey(getSelectedCardKey(component))
                                        setActiveFocusedPanel("comments")
                                        setFocusedInlineCommentDraft(selection)
                                        setFocusedInlineCommentText("")
                                        setFocusedInlinePendingParticipants(defaultCommentParticipants)
                                        setFocusedInlineRemovedParticipants([])
                                      }}
                                      onEditorFocus={setFocusedWorkspaceToolbarEditor}
                                      outputCommentThreads={componentOutputCommentThreads}
                                      renderCommentComposer={
                                        focusedInlineCommentDraft
                                        && focusedCommentsTargetCardKey === getSelectedCardKey(component) ? (
                                          <OutputCommentComposerPopover
                                            isOpen
                                            selectionDraft={focusedInlineCommentDraft}
                                            currentUserName={currentUserName}
                                            currentUserPhoto={(outputCommentUsers.find((u) => u.id === currentPublicUserId)?.photo) ?? null}
                                            currentUserId={currentPublicUserId}
                                            projectId={projectId}
                                            allProjectUsers={outputCommentUsers}
                                            commentText={focusedInlineCommentText}
                                            pendingParticipants={focusedInlinePendingParticipants}
                                            removedParticipants={focusedInlineRemovedParticipants}
                                            defaultParticipants={defaultCommentParticipants}
                                            isSubmitting={createFocusedOutputCommentThreadMutation.isPending}
                                            onCommentTextChange={setFocusedInlineCommentText}
                                            onPendingParticipantsChange={setFocusedInlinePendingParticipants}
                                            onRemovedParticipantsChange={setFocusedInlineRemovedParticipants}
                                            onCancel={() => {
                                              setFocusedInlineCommentDraft(null)
                                              setFocusedInlineCommentText("")
                                              setFocusedInlinePendingParticipants([])
                                              setFocusedInlineRemovedParticipants([])
                                            }}
                                            onSubmit={() => {
                                              void handleCreateFocusedInlineComment()
                                            }}
                                          />
                                        ) : null
                                      }
                                    />
                                  </FocusedSortableWorkspaceItem>

                                  {idx < focusedSelectedComponents.length - 1 ? (
                                    <div className="space-y-2">
                                      <div className="relative flex items-center justify-center py-1">
                                        <div className="h-px w-full bg-gray-200" />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setFocusedInsertPosition(insertPositionAfter)
                                            setFocusedInsertTitle('')
                                            setFocusedInsertDescription('')
                                          }}
                                          className="absolute inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
                                          aria-label="Add component between outputs"
                                          title="Add component"
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                      {focusedInsertPosition === insertPositionAfter ? (
                                        <div className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                          <Input
                                            value={focusedInsertTitle}
                                            onChange={(event) => setFocusedInsertTitle(event.target.value)}
                                            placeholder="Add component title"
                                            className="h-8 rounded-none border-0 border-b border-gray-200 px-0 text-sm shadow-none focus-visible:ring-0"
                                          />
                                          <Input
                                            value={focusedInsertDescription}
                                            onChange={(event) => setFocusedInsertDescription(event.target.value)}
                                            placeholder="Add instructions"
                                            className="h-8 rounded-none border-0 border-b border-gray-200 px-0 text-sm shadow-none focus-visible:ring-0"
                                          />
                                          <div className="flex items-center gap-1 pb-0.5">
                                            <Button
                                              type="button"
                                              size="sm"
                                              className="h-7 px-2 text-xs"
                                              disabled={!focusedInsertTitle.trim() || isFocusedInsertSubmitting}
                                              onClick={() => void handleInsertFocusedComponent()}
                                            >
                                              {isFocusedInsertSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              className="h-7 px-2 text-xs"
                                              disabled={isFocusedInsertSubmitting}
                                              onClick={() => {
                                                setFocusedInsertPosition(null)
                                                setFocusedInsertTitle('')
                                                setFocusedInsertDescription('')
                                              }}
                                            >
                                              Cancel
                                            </Button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </React.Fragment>
                              )
                            })}
                            <div className="space-y-2">
                              <div className="relative flex items-center justify-center py-1">
                                <div className="h-px w-full bg-gray-200" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFocusedInsertPosition(focusedSelectedComponents.length)
                                    setFocusedInsertTitle('')
                                    setFocusedInsertDescription('')
                                  }}
                                  className="absolute inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
                                  aria-label="Add component at end"
                                  title="Add component"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {focusedInsertPosition === focusedSelectedComponents.length ? (
                                <div className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                  <Input
                                    value={focusedInsertTitle}
                                    onChange={(event) => setFocusedInsertTitle(event.target.value)}
                                    placeholder="Add component title"
                                    className="h-8 rounded-none border-0 border-b border-gray-200 px-0 text-sm shadow-none focus-visible:ring-0"
                                  />
                                  <Input
                                    value={focusedInsertDescription}
                                    onChange={(event) => setFocusedInsertDescription(event.target.value)}
                                    placeholder="Add instructions"
                                    className="h-8 rounded-none border-0 border-b border-gray-200 px-0 text-sm shadow-none focus-visible:ring-0"
                                  />
                                  <div className="flex items-center gap-1 pb-0.5">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      disabled={!focusedInsertTitle.trim() || isFocusedInsertSubmitting}
                                      onClick={() => void handleInsertFocusedComponent()}
                                    >
                                      {isFocusedInsertSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs"
                                      disabled={isFocusedInsertSubmitting}
                                      onClick={() => {
                                        setFocusedInsertPosition(null)
                                        setFocusedInsertTitle('')
                                        setFocusedInsertDescription('')
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            {null}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  </div>
                  <div className={`shrink-0 border-t border-gray-200 px-4 py-3 ${activeFocusedPanel ? '' : 'hidden'}`}>
                    <div className="space-y-2">
                      {activeFocusedPanel === "seo" ? (
                        <div className="space-y-2 rounded-md bg-gray-50/40 p-2">
                          <div className="flex w-full items-center justify-between gap-2 py-0.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <Label className="text-xs font-medium text-gray-600">SEO</Label>
                              <span className="text-[11px] text-gray-500">
                                Hits: {focusedWorkspaceKeywordOccurrenceTotal.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setIsFocusedKeywordHighlightEnabled((prev) => !prev)
                                }}
                                className={`inline-flex h-6 items-center rounded px-2 text-[11px] transition-colors ${isFocusedKeywordHighlightEnabled ? 'bg-gray-100 text-gray-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                                title={isFocusedKeywordHighlightEnabled ? 'Disable keyword highlighting' : 'Enable keyword highlighting'}
                                aria-label={isFocusedKeywordHighlightEnabled ? 'Disable keyword highlighting' : 'Enable keyword highlighting'}
                              >
                                Coloring
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-600"
                                onClick={() => setActiveFocusedPanel(null)}
                                aria-label="Close SEO drawer"
                                title="Close"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="rounded-md border border-gray-200 bg-white p-2">
                            {focusedWorkspaceKeywordList.length === 0 ? (
                              <p className="text-xs text-gray-500">Add keywords in SEO settings to see occurrences.</p>
                            ) : focusedWorkspaceCombinedText.trim().length === 0 ? (
                              <p className="text-xs text-gray-500">No content for keyword analysis yet.</p>
                            ) : (
                              <table className="w-full min-w-0 border-collapse text-xs">
                                <tbody>
                                  {focusedWorkspaceKeywordOccurrences.map((row, idx) => {
                                    const density = focusedWorkspaceKeywordDensities.find((item) => item.keyword === row.keyword)?.density ?? 0
                                    return (
                                      <tr key={`${row.keyword}-${idx}`} className="border-b border-gray-100 last:border-b-0">
                                        <td className="max-w-[10rem] truncate py-1 pr-2">
                                          <span className="inline-flex items-center gap-2">
                                            <span aria-hidden className="inline-block h-4 w-1 rounded" style={{ backgroundColor: row.color }} />
                                            <span className="truncate">{row.keyword}</span>
                                          </span>
                                        </td>
                                        <td className="whitespace-nowrap py-1 pr-2 text-right font-medium text-gray-600">
                                          {row.occurrences.toLocaleString()}
                                        </td>
                                        <td className={`whitespace-nowrap py-1 text-right font-medium ${getDensityColor(density).color}`}>
                                          {density.toFixed(0)}%
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            )}
                            <div className="mt-2 flex items-center gap-1 border-t border-gray-100 pt-2">
                              <Input
                                value={focusedKeywordInput}
                                onChange={(event) => setFocusedKeywordInput(event.target.value)}
                                onKeyDown={async (event) => {
                                  if (event.key !== 'Enter') return
                                  event.preventDefault()
                                  if (isUpdatingKeywords) return
                                  await handleAddFocusedKeywords()
                                }}
                                placeholder="Add keywords: chips, semicondutores; IA"
                                className="h-7 w-[13rem] max-w-[46vw] text-xs"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={isUpdatingKeywords || parseKeywordTokens(focusedKeywordInput).length === 0}
                                onClick={() => void handleAddFocusedKeywords()}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                          {renderLinkSummarySection({
                            containerClassName: '',
                            useCountNavigator: true,
                            onNavigateToLinkComponent: (cardKey) => scrollToFocusedOutput(getFocusedOutputAnchorId(cardKey)),
                            enableReplace: true,
                          })}
                        </div>
                      ) : null}

                      {activeFocusedPanel === "comments" ? (
                        <div className="rounded-md bg-gray-50/40 p-2">
                          <div className="flex w-full items-center justify-between gap-2 py-0.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <Label className="text-xs font-medium text-gray-600">Comments</Label>
                              <span className="text-[11px] text-gray-500">
                                {focusedBrowseThreads.length} thread{focusedBrowseThreads.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-600"
                                onClick={() => setActiveFocusedPanel(null)}
                                aria-label="Close comments drawer"
                                title="Close"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setFocusedShowCommentHighlights((prev) => !prev)
                                }}
                              >
                                {focusedShowCommentHighlights ? "Hide highlights" : "Show highlights"}
                              </button>
                              <Select
                                value={commentsFilter}
                                onValueChange={(value) => setCommentsFilter(value as "open" | "resolved" | "all")}
                              >
                                <SelectTrigger className="h-7 w-[108px] text-xs" onClick={(event) => event.stopPropagation()}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">Open</SelectItem>
                                  <SelectItem value="resolved">Resolved</SelectItem>
                                  <SelectItem value="all">All</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2 pt-1">
                            {filteredFocusedBrowseThreads.length === 0 ? (
                              <div className="rounded border border-dashed bg-white px-3 py-2 text-xs text-gray-500">
                                No comments yet for this output.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {filteredFocusedBrowseThreads.map((thread) => {
                                  const isSelected = focusedCommentsActiveThreadId === thread.threadId
                                  return (
                                    <OutputCommentThreadCard
                                      key={`focused-thread-card-${thread.threadId}`}
                                      thread={thread}
                                      currentUserId={currentPublicUserId}
                                      currentUserName={currentUserName}
                                      onResolveToggle={() => {
                                        if (!currentPublicUserId) return
                                        if (thread.resolvedAt) {
                                          reopenFocusedOutputCommentThreadMutation.mutate({
                                            threadId: thread.threadId,
                                            createdBy: currentPublicUserId,
                                          })
                                        } else {
                                          resolveFocusedOutputCommentThreadMutation.mutate({
                                            threadId: thread.threadId,
                                            createdBy: currentPublicUserId,
                                          })
                                        }
                                      }}
                                      onReplyAdded={() => {
                                        refetchOutputCommentThreads()
                                      }}
                                      taskId={taskId}
                                      isExpanded={isSelected}
                                      showReplyInput={isSelected}
                                      isSelected={isSelected}
                                      onSelect={() => {
                                        setFocusedCommentsActiveThreadId(thread.threadId)
                                        setFocusedShowCommentHighlights(true)
                                      }}
                                      initialMessages={isSelected ? focusedActiveThreadMessages : undefined}
                                    />
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 px-2 text-xs text-gray-500">
                      {isAnyOutputSaving ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Saving…
                        </span>
                      ) : channelLastSavedLabel ? (
                        <button
                          type="button"
                          onClick={() => openChannelComponentVersionHistory(null)}
                          className="rounded px-0.5 tabular-nums transition-colors hover:text-gray-700"
                          title={
                            focusedWorkspaceLatestUpdatedAt
                              ? `${new Date(focusedWorkspaceLatestUpdatedAt).toLocaleString()} · Version history`
                              : "Version history"
                          }
                        >
                          Last saved {channelLastSavedLabel}
                        </button>
                      ) : (
                        <span>No updates yet</span>
                      )}
                      <span>Words: {focusedWorkspaceWordCount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                  {isAnyOutputSaving ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving…
                    </span>
                  ) : channelLastSavedLabel ? (
                    <button
                      type="button"
                      onClick={() => openChannelComponentVersionHistory(null)}
                      className="rounded px-0.5 text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-foreground"
                      title={
                        focusedWorkspaceLatestUpdatedAt
                          ? `${new Date(focusedWorkspaceLatestUpdatedAt).toLocaleString()} · Version history`
                          : "Version history"
                      }
                      aria-label="Open channel version history"
                    >
                      Last saved {channelLastSavedLabel}
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">No saves yet</span>
                  )}
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={focusedSelectedComponents.map(c => c.task_component_id || c.component_key || `temp-${c.briefing_component_id ?? c.project_component_id ?? 'u'}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className={isFocusedOutputMode ? "flex min-h-0 flex-1 flex-col" : "space-y-2"}>
                    {focusedSelectedComponents.map((component, idx) => {
                      const itemKey = getSelectedCardKey(component)
                      const cardDomId = getSelectedCardDomId(itemKey)
                      const sourceTags = [categoryForSelectedComponent(component)]
                      const streamedGeneration = component.task_component_id
                        ? inFlightComponentGenerations.get(component.task_component_id)
                        : undefined
                      const finalEventPreview = component.task_component_id
                        ? finalComponentOutputPreviews.get(component.task_component_id)
                        : undefined
                      const persistedOutput = getOutputForComponent(componentOutputs, component)
                      const persistedContent = persistedOutput?.content
                      const persistedContentJson = persistedOutput?.content_json
                      const hasPersistedContentBlocks = Array.isArray(persistedContent) && persistedContent.length > 0
                      const hasPersistedContentJsonBlocks = Array.isArray(persistedContentJson) && persistedContentJson.length > 0
                      const streamedBlocks =
                        Array.isArray(streamedGeneration?.previewBlocks) && streamedGeneration.previewBlocks.length > 0
                          ? streamedGeneration.previewBlocks
                          : null
                      const streamedText = streamedGeneration?.previewText ?? ""
                      const editStream = component.task_component_id
                        ? editStreamsForChannel.find(
                            (stream) => stream.componentId === component.task_component_id,
                          )
                        : undefined

                      let visibleSource:
                        | "final-component-output-event"
                        | "ai-pane-edit-stream"
                        | "stream-preview-blocks"
                        | "output.content"
                        | "output.content_json"
                        | "stream-preview-text"
                        | "output.content_text"
                        | "none" = "none"
                      let resolvedOutput: TaskComponentOutput | null = persistedOutput

                      const makeOutputShell = (): TaskComponentOutput => ({
                        content: null,
                        content_text: null,
                        resolved_content_json: null,
                        content_json: null,
                        attachment_map: null,
                        updated_at: null,
                        task_component_output_id: null,
                        attachments: [],
                        comment_thread_count: 0,
                        open_comment_thread_count: 0,
                      })

                      const persistedUpdatedAt = persistedOutput?.updated_at ?? null
                      const persistedOutputId = persistedOutput?.task_component_output_id ?? null
                      const persistedHasFreshFinalMatch =
                        !!finalEventPreview
                        && !!persistedOutputId
                        && !!finalEventPreview.taskComponentOutputId
                        && persistedOutputId === finalEventPreview.taskComponentOutputId
                        && hasPersistedContentBlocks
                        && isIsoNewerOrEqual(persistedUpdatedAt, finalEventPreview.updatedAt)

                      if (finalEventPreview && !persistedHasFreshFinalMatch) {
                        visibleSource = "final-component-output-event"
                        resolvedOutput = {
                          ...(persistedOutput ?? makeOutputShell()),
                          content: finalEventPreview.blocks,
                          content_json: finalEventPreview.blocks,
                          resolved_content_json: finalEventPreview.blocks,
                          content_text: contentBlocksToPlainText(finalEventPreview.blocks),
                          task_component_output_id:
                            finalEventPreview.taskComponentOutputId ?? (persistedOutput?.task_component_output_id ?? null),
                          updated_at: finalEventPreview.updatedAt,
                        }
                      } else if (
                        editStream
                        && isLiveComponentEditStream(editStream)
                        && (editStream.hasPreviewContent || editStream.isStreaming || editStream.phase === "started")
                      ) {
                        visibleSource = "ai-pane-edit-stream"
                        resolvedOutput = getResolvedOutputForComponent(component)
                      } else if (hasPersistedContentBlocks) {
                        visibleSource = "output.content"
                        resolvedOutput = persistedOutput
                      } else if (hasPersistedContentJsonBlocks) {
                        visibleSource = "output.content_json"
                        resolvedOutput = persistedOutput
                      } else if (streamedBlocks) {
                        visibleSource = "stream-preview-blocks"
                        resolvedOutput = {
                          ...(persistedOutput ?? makeOutputShell()),
                          content: streamedBlocks,
                          content_json: streamedBlocks,
                          resolved_content_json: streamedBlocks,
                          content_text: contentBlocksToPlainText(streamedBlocks),
                          updated_at: streamedGeneration?.updatedAt ?? persistedOutput?.updated_at ?? null,
                        }
                      } else if (streamedText.trim().length > 0) {
                        visibleSource = "stream-preview-text"
                        resolvedOutput = {
                          ...(persistedOutput ?? makeOutputShell()),
                          content_text: streamedText,
                          updated_at: streamedGeneration?.updatedAt ?? persistedOutput?.updated_at ?? null,
                        }
                      } else if ((persistedOutput?.content_text ?? "").trim().length > 0) {
                        visibleSource = "output.content_text"
                      }

                      const selectedBlocks = getOutputBlocks(resolvedOutput)
                      console.log("[visible component source]", {
                        componentId: component.task_component_id ?? null,
                        task_component_output_id: resolvedOutput?.task_component_output_id ?? null,
                        source: visibleSource,
                        blockOrder: selectedBlocks.map((block) => block.type),
                        hasAttachment: selectedBlocks.some((block) => block.type === "attachment"),
                      })
                      const componentOutputId = resolvedOutput?.task_component_output_id ?? null
                      const isCommentNavigationTarget =
                        !!commentNavigationTarget
                        && !!componentOutputId
                        && commentNavigationTarget.outputId === componentOutputId
                      const componentOutputCommentThreads = componentOutputId
                        ? (outputCommentThreadsByOutputId.get(componentOutputId) ?? [])
                        : []
                      const isStreamGenerating = streamedGeneration?.status === 'generating'
                      return (
                      <SortableComponentItem
                        key={itemKey}
                        cardKey={itemKey}
                        cardDomId={cardDomId}
                        isMenuOpen={openMenuSortableId === itemKey}
                        onMenuOpenChange={setOpenMenuSortableId}
                        isDirtyTemplate={dirtyTemplateKeys.has((getComponentKeyForSelectedRow(component) ?? component.component_key) ?? '')}
                        component={component}
                        sourceTags={sourceTags}
                        isSelected={component.selected}
                        onToggle={() => handleToggleComponent(component, !component.selected)}
                        isToggling={togglingComponentKey === (component.component_key ?? getComponentKeyForSelectedRow(component) ?? '')}
                        onEditCustom={(taskComponentId, briefingComponentId, projectComponentId, title, desc, scope, position, applyToProjectTemplate) =>
                          handleEditComponentCustom(
                            taskComponentId,
                            briefingComponentId,
                            projectComponentId,
                            title,
                            desc,
                            scope,
                            position,
                            applyToProjectTemplate
                          )
                        }
                        /* onEditCustom returns Promise<boolean> so the card can show non-blocking save status */
                        onReorder={(id, pos) => {}}
                        isEditing={editingComponentId === (component.task_component_id || component.component_key || `temp-${component.briefing_component_id ?? component.project_component_id ?? 'u'}`)}
                        onStartEdit={() => setEditingComponentId(component.task_component_id || component.component_key || `temp-${component.briefing_component_id ?? component.project_component_id ?? 'u'}`)}
                        onCancelEdit={() => {
                          setEditingComponentId(null)
                          // Reset to original values handled by useEffect in SortableComponentItem
                        }}
                        isEditingDescription={editingDescriptionComponentId === (component.task_component_id || component.component_key || `temp-${component.briefing_component_id ?? component.project_component_id ?? 'u'}`)}
                        onStartEditDescription={() => setEditingDescriptionComponentId(component.task_component_id || component.component_key || `temp-${component.briefing_component_id ?? component.project_component_id ?? 'u'}`)}
                        onCancelEditDescription={() => {
                          setEditingDescriptionComponentId(null)
                          // Don't update state here - the useEffect in SortableComponentItem will reset values from props
                        }}
                        output={resolvedOutput}
                        onOutputChange={(text) => {
                          const saveTarget = getOutputSaveTargetForComponent(component)
                          const outputKey = saveTarget?.outputKey ?? getOutputMapKeyFromComponent(component)
                          if (!outputKey) return
                          // Update refs immediately with latest value (autosave reads from these).
                          outputValuesRef.current.set(outputKey, text)
                          markOutputDirty(outputKey)
                          const previousBlocks =
                            outputJsonValuesRef.current.get(outputKey)
                            ?? getOutputBlocks(componentOutputsRef.current.get(outputKey) ?? null)
                          outputJsonValuesRef.current.set(outputKey, mergeTextChangesIntoExistingBlocks(previousBlocks, text))
                          // Debounce the heavy re-render; TipTap owns the DOM while focused so the UI stays live.
                          debouncedFlushOutputState(outputKey)
                        }}
                        onSaveOutput={() => {
                          const saveTarget = getOutputSaveTargetForComponent(component)
                          if (!saveTarget) return
                          debouncedSaveOutput(saveTarget)
                        }}
                        onPatchOutput={(patch) => {
                          const saveTarget = getOutputSaveTargetForComponent(component)
                          const outputKey = saveTarget?.outputKey ?? getOutputMapKeyFromComponent(component)
                          if (!outputKey) return
                          setComponentOutputs((prev) => {
                            const next = new Map(prev)
                            next.set(outputKey, buildOutputRecord(next.get(outputKey), patch))
                            return next
                          })
                        }}
                        onRequestOutputRefresh={() => {
                          void channelBootstrapQuery.refetch()
                        }}
                        onCancelPendingOutputAutosave={() => {
                          debouncedSaveOutput.cancel()
                        }}
                        onSetIsInsertingMedia={(value) => {
                          const saveTarget = getOutputSaveTargetForComponent(component)
                          const outputKey = saveTarget?.outputKey ?? getOutputMapKeyFromComponent(component)
                          if (!outputKey) return
                          if (value) mediaInsertOutputKeysRef.current.add(outputKey)
                          else mediaInsertOutputKeysRef.current.delete(outputKey)
                        }}
                        isLoadingOutput={loadingOutputs.has(component.briefing_component_id || 0)}
                        isGeneratingOutput={
                          (!!component.task_component_id && generatingComponentKeys.has(getGeneratingKeyFromTaskComponentId(component.task_component_id)))
                          || !!isStreamGenerating
                        }
                        onLoadOutput={() => {
                          const saveTarget = getOutputSaveTargetForComponent(component)
                          fetchComponentOutput({
                            taskComponentId: component.task_component_id ?? null,
                            briefingComponentId: saveTarget?.mode === 'briefing' ? saveTarget.briefingComponentId : null,
                          })
                        }}
                        projectId={projectId}
                        contentTypeId={contentTypeId}
                        channelId={selectedChannelId}
                        briefingTypeId={dropdownExplicitBriefingTypeId ?? undefined}
                        effectiveBriefingTypeId={effectiveBriefingTypeId ?? undefined}
                        onEditInTemplate={handleEditInTemplate}
                        onRemoveFromTemplate={handleRemoveFromTemplate}
                        onSaveToProjectAllChannels={handleSaveToProjectAllChannels}
                        onSaveToProjectChannel={handleSaveToProjectChannel}
                        onDeleteSelectedComponent={handleDeleteSelectedComponent}
                        onBuildWithAI={handleBuildWithAI}
                        onAskAiFromSelection={handleAskAiFromEditorSelection}
                        onOpenVersionHistory={() => {
                          const persistedOutput = getOutputForComponent(componentOutputs, component)
                          handleOpenComponentVersionHistory(component, persistedOutput)
                        }}
                        onActiveFieldChange={handleActiveFieldChangeWrapped}
                        onActivateComponentForExport={() => {
                          if (component.task_component_id) {
                            setActiveExportComponentId(component.task_component_id)
                          }
                        }}
                        onCopyContent={() => void handleCopyComponentContent(component)}
                        canCopyContent={canCopyComponentContent(component)}
                        onQuickFiveStar={handleQuickFiveStarReview}
                        onRequestFocusOutputPane={enterFocusedOutputMode}
                        onExitFocusOutputPane={exitFocusedOutputMode}
                        isOutputFocusedPane={isFocusedSingleOutputMode && focusedOutputCardKey === itemKey}
                        isAnyFocusedOutputMode={isFocusedOutputMode}
                        onFocusPrevOutput={isFocusedSingleOutputMode && focusedOutputIndex > 0 ? focusPrevOutput : undefined}
                        onFocusNextOutput={isFocusedSingleOutputMode && focusedOutputIndex >= 0 && focusedOutputIndex < focusedOutputOrder.length - 1 ? focusNextOutput : undefined}
                        focusedOutputPositionLabel={isFocusedSingleOutputMode ? focusedOutputPositionLabel : undefined}
                        autoExpandComponentId={autoExpandComponentId}
                        autoExpandTaskComponentId={autoExpandTaskComponentId}
                        autoExpandTaskComponentIds={autoExpandTaskComponentIds}
                        autoExpandOnlyAfterMountRef={didMountRef}
                        onAutoExpandConsumed={handleAutoExpandConsumed}
                        expandedTaskComponentIds={expandedTaskComponentIds}
                        onExpandedTaskComponentChange={handleExpandedTaskComponentChange}
                        onDuplicateComponent={handleDuplicateComponent}
                        componentKey={(getComponentKeyForSelectedRow(component) || component.component_key) ?? ''}
                        availableByKeyForTemplate={availableByKey}
                        getComponentKeyForSelectedRow={getComponentKeyForSelectedRow}
                        onApplyToProjectTemplate={setConfirmOverwriteTemplate}
                        onAddToAllChannelsInTask={handleAddToAllChannelsInTask}
                        onResetToTemplate={handleResetToTemplate}
                        onRequestRemoveFromTemplate={(c) => {
                          const key = c.component_key ?? getComponentKeyForSelectedRow(c) ?? ''
                          setConfirmRemoveFromTemplate({
                            componentBriefingId: c.briefing_component_id ?? c.project_component_id ?? 0,
                            scope: c.project_component_id != null ? 'project' : 'channel',
                            projectComponentId: c.project_component_id ?? undefined,
                            keepInTask: true,
                            component_key: key || undefined,
                          })
                        }}
                        onRequestDelete={setConfirmDeleteSelected}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < focusedSelectedComponents.length - 1}
                        onMoveUp={() => { void handleMoveComponentByOffset(component, -1) }}
                        onMoveDown={() => { void handleMoveComponentByOffset(component, 1) }}
                        isOutputSaving={(() => {
                          const saveTarget = getOutputSaveTargetForComponent(component)
                          const outputKey = saveTarget?.outputKey ?? getOutputMapKeyFromComponent(component)
                          return outputKey ? (isSavingOutput.get(outputKey) ?? false) : false
                        })()}
                        taskId={taskId}
                        taskTitle={taskTitle}
                        channelName={channels.find((channel) => channel.channel_id === selectedChannelId)?.name}
                        allUsersForOutputComments={outputCommentUsers}
                        defaultOutputCommentParticipants={defaultCommentParticipants}
                        currentPublicUserId={currentPublicUserId}
                        currentUserName={currentUserName ?? "You"}
                        outputCommentThreads={componentOutputCommentThreads}
                        commentNavigationTarget={isCommentNavigationTarget ? commentNavigationTarget : null}
                        isLoadingOutputCommentThreads={!!(componentOutputId && outputCommentThreadsBatchQuery.isFetching)}
                        onEnsureOutputCommentThreads={ensureOutputCommentThreads}
                        onRefetchOutputCommentThreads={refetchOutputCommentThreads}
                        bulkSelectKey={(((component.component_key ?? getComponentKeyForSelectedRow(component)) ?? '') || undefined)}
                        isBulkSelected={(() => { const k = (component.component_key ?? getComponentKeyForSelectedRow(component)) ?? ''; return !!k && bulkSelectedKeys.has(k) })()}
                        onBulkSelectToggle={() => {
                          const key = (component.component_key ?? getComponentKeyForSelectedRow(component)) ?? ''
                          if (!key) return
                          setBulkSelectedKeys((prev) => {
                            const next = new Set(prev)
                            if (next.has(key)) next.delete(key)
                            else next.add(key)
                            return next
                          })
                        }}
                        isMultiSelectMode={isMultiSelectMode}
                      />
                    ); })}

                  </div>
                  </SortableContext>
                </DndContext>
                </>
              )}
            </div>
          )}
          {!isFocusedOutputMode && recoverableOutputs.length > 0 ? (
            <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
              <div className="text-sm font-medium text-gray-900">Recover content</div>
              <p className="mt-0.5 text-xs text-gray-500">
                Legacy or orphaned output for this channel. Nothing is revived automatically.
              </p>
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                {recoverableOutputs.slice(0, 12).map((row) => {
                  const id = typeof row.id === "string" ? row.id : String(row.id ?? "")
                  const title =
                    (typeof row.title === "string" && row.title.trim())
                    || "Untitled output"
                  const snippet =
                    typeof row.content_text === "string"
                      ? row.content_text.replace(/\s+/g, " ").trim().slice(0, 120)
                      : ""
                  return (
                    <li key={id || title} className="rounded-md border border-gray-100 px-2 py-1.5">
                      <div className="text-xs font-medium text-gray-800">{title}</div>
                      {snippet ? (
                        <div className="mt-0.5 text-[11px] text-gray-500 line-clamp-2">{snippet}</div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {!isFocusedOutputMode && selectedChannelId && (
            <div className="space-y-2">
              <Popover
                open={isAddComponentDropdownOpen}
                onOpenChange={(nextOpen) => {
                  setIsAddComponentDropdownOpen(nextOpen)
                  if (nextOpen) {
                    setAddComponentDropdownMode('create')
                    setAddComponentSearchQuery('')
                    setAddComponentCreateInstructions('')
                  }
                }}
              >
                <PopoverTrigger asChild>
                  {components.length > 0 ? (
                    <AddComponentButton
                      onClick={() => {
                        if (!isAddComponentDropdownOpen) setIsAddComponentDropdownOpen(true)
                      }}
                    />
                  ) : (
                    <AddComponentEmptyState
                      onAdd={() => {
                        if (!isAddComponentDropdownOpen) setIsAddComponentDropdownOpen(true)
                      }}
                      description="Create a custom component or find a reusable one from your project library."
                    />
                  )}
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="w-[var(--radix-popover-trigger-width)] rounded-lg border border-gray-200 bg-white p-0 shadow-lg"
                >
                  {addComponentDropdownMode === 'create' ? (
                    <div className="space-y-3 p-3">
                      <div className="text-sm font-medium text-gray-900">Create custom component</div>
                      <Input
                        ref={addComponentCardInputRef}
                        value={addComponentSearchQuery}
                        onChange={(event) => setAddComponentSearchQuery(event.target.value)}
                        placeholder="Component title"
                        className="h-8 text-sm"
                      />
                      <Textarea
                        value={addComponentCreateInstructions}
                        onChange={(event) => setAddComponentCreateInstructions(event.target.value)}
                        placeholder="Description or instructions (optional)"
                        className="min-h-[72px] resize-y text-sm"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setAddComponentDropdownMode('select')
                            setAddComponentHighlightedIndex(0)
                          }}
                        >
                          Find a reusable component
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleCreateDropdownComponent(
                            addComponentSearchQuery,
                            addComponentCreateInstructions
                          )}
                          disabled={isCreatingDropdownComponent || !addComponentSearchQuery.trim()}
                        >
                          {isCreatingDropdownComponent ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                    <div className="border-b border-gray-100 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900">Find a reusable component</div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setAddComponentDropdownMode('create')}
                        >
                          Create custom
                        </Button>
                      </div>
                      <Input
                        ref={addComponentCardInputRef}
                        value={addComponentSearchQuery}
                        onChange={(event) => {
                          setAddComponentSearchQuery(event.target.value)
                          setAddComponentHighlightedIndex(0)
                        }}
                        onKeyDown={(event) => void handleAddComponentDropdownKeyDown(event)}
                        placeholder="Search project and system components"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {filteredAvailableComponents.map((item, idx) => {
                        const itemKey = item.component_key ?? item.key ?? `available-${idx}`
                        const isSelected = selectedComponentIds.has(itemKey)
                        const isHighlighted = addComponentHighlightedIndex === idx
                        const isAdding = addingAvailableKeys.has(itemKey)
                        const isDisabled = selectedKeySet.has(itemKey) || isAdding
                        const sourceTags = [categoryForAvailableComponent(item)]
                        return (
                          <button
                            key={itemKey}
                            type="button"
                            onClick={() => {
                              if (isDisabled) return
                              toggleDropdownComponentSelection(itemKey)
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                              isHighlighted ? 'bg-gray-50' : 'bg-white'
                            } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                            disabled={isDisabled}
                          >
                            <Checkbox checked={isSelected} className="h-4 w-4" />
                            <span className="min-w-0 flex-1 truncate text-gray-700">
                              {item.custom_title || item.title}
                            </span>
                            <ComponentSourceTags tags={sourceTags} keyPrefix={`add-dropdown-${itemKey}`} />
                          </button>
                        )
                      })}
                      {filteredAvailableComponents.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500">
                          No matching reusable components.
                        </div>
                      )}
                    </div>
                    <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-white/80">
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        onClick={() => void handleConfirmSelectedAvailableComponents()}
                        disabled={selectedComponentIds.size === 0 || isBulkAddingDropdownComponents}
                      >
                        {isBulkAddingDropdownComponents ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          `Add ${selectedComponentIds.size} component${selectedComponentIds.size === 1 ? '' : 's'}`
                        )}
                      </Button>
                    </div>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}

        </div>
      )}

      {selectedChannelId ? (
        <div className="mt-6 space-y-4 border-t border-gray-200 pt-4">
          {renderLinkSummarySection({ enableReplace: true })}
          <SEOPanel
            variantSEO={variantSEOData}
            isLoading={false}
            onUpdateKeywords={handleUpdateKeywords}
            onToggleSEORequired={handleToggleSEORequired}
            isUpdatingKeywords={isUpdatingKeywords}
            isTogglingSEO={isTogglingSEO}
            cttId={null}
            channelId={selectedChannelId}
            languageId={languageId || null}
            variantId={null}
            variantBriefingTypeId={null}
            taskId={taskId}
            componentOutputTexts={Array.from(componentOutputs.values()).map((o) => o.content_text ?? '')}
            taskChannelSeo={channelBootstrapQuery.data?.seo ?? null}
            selectedKeyword={selectedChannelKeyword}
            onSelectedKeywordChange={setSelectedChannelKeyword}
          />
        </div>
      ) : null}

      <ComponentOutputVersionHistoryDialog
        open={isComponentVersionHistoryOpen}
        onOpenChange={(open) => {
          setIsComponentVersionHistoryOpen(open)
          if (!open) setComponentVersionHistoryFilterId(null)
        }}
        taskId={taskId}
        channelId={selectedChannelId}
        channelLabel={channels.find((channel) => channel.channel_id === selectedChannelId)?.name}
        componentOptions={versionHistoryComponentOptions}
        initialFilterTaskComponentId={componentVersionHistoryFilterId}
        onBeforeRestore={async (version) => {
          if (!selectedChannelId) return
          const title =
            versionHistoryComponentOptions.find(
              (option) =>
                option.taskComponentId === version.task_component_id
                || option.taskComponentOutputId === version.task_component_output_id,
            )?.title ?? "component"
          await ensureTaskChannelSnapshotOnce({
            taskId,
            channelId: selectedChannelId,
            changeSource: "manual_before_edit",
            changeSummary: `Before restoring component version: ${title}`,
          })
        }}
        onRestored={handleComponentVersionRestored}
      />

      {selectedChannelId ? (
        <TaskChannelContentHistoryDialog
          open={isChannelContentHistoryOpen}
          onOpenChange={setIsChannelContentHistoryOpen}
          taskId={taskId}
          channelId={selectedChannelId}
          channelLabel={channels.find((channel) => channel.channel_id === selectedChannelId)?.name}
          onRestored={handleChannelContentRestored}
        />
      ) : null}

    </div>
  )
}

