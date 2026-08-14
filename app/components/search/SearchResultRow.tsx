"use client"

import { useState, type ReactNode } from "react"
import { AtSign, Bot, FileText, Folder, FolderKanban, ListTodo, Search, User, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { UserAvatar } from "@/components/UserAvatar"
import { cn, formatCompactDateDisplay } from "@/lib/utils"
import { getImageUrl } from "../../lib/public-media"
import {
  type GlobalSearchDocument,
  type GlobalSearchDisplayPayload,
  type GlobalSearchItemEntityType,
} from "../../lib/global-search-types"
import { getPublicAssetUrl } from "../../../utils/storage"

function resolveAssetUrl(value: string | null | undefined): string | null {
  return getImageUrl(value) ?? getPublicAssetUrl(value)
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

const ENTITY_TYPE_ICONS: Partial<Record<GlobalSearchItemEntityType, LucideIcon>> = {
  task: ListTodo,
  project: FolderKanban,
  mention: AtSign,
  user: User,
  team: Users,
  ai_thread: Bot,
  artifact: FileText,
}

const GENERIC_AI_THREAD_TITLES = new Set([
  "task chat",
  "project chat",
  "chat",
  "ai chat",
  "new chat",
  "untitled",
  "autopilot",
])

function cleanAiSnippet(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value
    .replace(/[*_`#>\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return null
  return cleaned.length > 120 ? `${cleaned.slice(0, 117).trimEnd()}…` : cleaned
}

function isGenericAiThreadTitle(title: string | null | undefined): boolean {
  const normalized = title?.trim().toLowerCase() ?? ""
  return !normalized || GENERIC_AI_THREAD_TITLES.has(normalized)
}

function resolveAiThreadTitle(payload: GlobalSearchDisplayPayload): string {
  const title = payload.title?.trim() || ""
  if (!isGenericAiThreadTitle(title)) return title
  return cleanAiSnippet(payload.preview) || title || "AI chat"
}

function EntityTypeIcon({
  entityType,
  className,
}: {
  entityType: GlobalSearchItemEntityType
  className?: string
}) {
  const Icon = ENTITY_TYPE_ICONS[entityType] ?? Search
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </div>
  )
}

function getPayload(item: GlobalSearchDocument): GlobalSearchDisplayPayload {
  return item.display_payload ?? { title: item.title }
}

function getMetaValueByLabel(payload: GlobalSearchDisplayPayload, label: string): string | null {
  for (const entry of payload.meta ?? []) {
    if ((entry.label?.trim() ?? "").toLowerCase() === label.toLowerCase()) {
      return entry.value?.trim() ?? null
    }
  }
  return null
}

function getMetaBooleanByLabel(payload: GlobalSearchDisplayPayload, label: string): boolean {
  return getMetaValueByLabel(payload, label) === "true"
}

function getMentionDisplayDate(payload: GlobalSearchDisplayPayload): string | null {
  return getMetaValueByLabel(payload, "created_at") ?? getMetaValueByLabel(payload, "last_message_at")
}

function formatRelativeTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const diffMs = date.getTime() - Date.now()
  const absSeconds = Math.abs(Math.round(diffMs / 1000))
  if (absSeconds < 60) return "just now"

  const divisions: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
    { unit: "year", seconds: 60 * 60 * 24 * 365 },
    { unit: "month", seconds: 60 * 60 * 24 * 30 },
    { unit: "week", seconds: 60 * 60 * 24 * 7 },
    { unit: "day", seconds: 60 * 60 * 24 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
  ]

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  for (const { unit, seconds } of divisions) {
    if (absSeconds >= seconds) {
      return formatter.format(Math.round(diffMs / 1000 / seconds), unit)
    }
  }

  return "just now"
}

function formatCompactDateForMention(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date)
}

function isPublicationTaskSection(sectionType?: string): boolean {
  return Boolean(sectionType && /publication/.test(sectionType))
}

function resolveTaskDateValue(
  payload: GlobalSearchDisplayPayload,
  raw: Record<string, unknown>,
  sectionType?: string,
): string | null {
  const preferPublication = isPublicationTaskSection(sectionType)
  const delivery =
    getMetaValueByLabel(payload, "delivery_date") ??
    (typeof raw.delivery_date === "string" ? raw.delivery_date : null)
  const publication =
    getMetaValueByLabel(payload, "publication_date") ??
    (typeof raw.publication_date === "string" ? raw.publication_date : null)
  if (preferPublication) return publication ?? delivery
  return delivery ?? publication
}

function isTaskDateOverdue(
  payload: GlobalSearchDisplayPayload,
  sectionType?: string,
): boolean {
  if (isPublicationTaskSection(sectionType)) {
    return getMetaBooleanByLabel(payload, "is_publication_overdue")
  }
  return getMetaBooleanByLabel(payload, "is_overdue") || Boolean(sectionType && /overdue/.test(sectionType))
}

function getFacetAvatars(raw: Record<string, unknown>): Array<{ id: string; name: string | null; photo: string | null }> {
  const payload = raw.facet_payload
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return []
  const avatarSource = (payload as Record<string, unknown>).avatars
  if (!Array.isArray(avatarSource)) return []
  return avatarSource
    .map((entry, index) => {
      if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return null
      const row = entry as Record<string, unknown>
      const name = typeof row.name === "string" ? row.name : null
      const photo = typeof row.photo === "string" ? row.photo : null
      return {
        id: `${String(row.id ?? `facet:${index}`)}`,
        name,
        photo,
      }
    })
    .filter(Boolean) as Array<{ id: string; name: string | null; photo: string | null }>
}

export function LeftVisual({
  payload,
  raw,
  isProject = false,
  isUser = false,
  compact = false,
}: {
  payload: GlobalSearchDisplayPayload
  raw?: Record<string, unknown>
  isProject?: boolean
  isUser?: boolean
  compact?: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const left = payload.left
  const rawLeft = raw && typeof raw.left === "object" && raw.left && !Array.isArray(raw.left)
    ? (raw.left as Record<string, unknown>)
    : null
  const label =
    firstNonEmptyString(left?.label, payload.title, raw?.title, raw?.full_name, raw?.name) ?? "Untitled"
  const photoPath = firstNonEmptyString(
    left?.photo,
    payload.photo,
    rawLeft?.photo,
    raw?.photo,
    raw?.user_photo,
  )
  const logoPath = firstNonEmptyString(
    left?.logo,
    payload.logo,
    rawLeft?.logo,
    raw?.logo,
    raw?.project_logo,
  )
  const color =
    firstNonEmptyString(left?.color, payload.color, rawLeft?.color, raw?.color, raw?.project_color) ??
    null
  const photoUrl = resolveAssetUrl(photoPath)
  const logoUrl = resolveAssetUrl(logoPath)
  const boxClass = compact ? "h-5 w-5" : "h-9 w-9"
  const radiusClass = compact ? "rounded-md" : "rounded-lg"

  // Users: photo first, then initials avatar.
  if (isUser) {
    return <UserAvatar name={label} photoUrl={imageFailed ? null : photoUrl} size="xs" />
  }

  // Projects: folder icon tinted with project color (bordered square, no logos).
  if (isProject) {
    const folderColor = color || "#9ca3af"
    return (
      <span
        title={label}
        className={cn(
          boxClass,
          radiusClass,
          "inline-flex shrink-0 items-center justify-center border border-gray-200 bg-white",
        )}
      >
        <Folder
          className={cn(compact ? "h-3 w-3" : "h-4 w-4")}
          style={{ color: folderColor }}
          strokeWidth={1.75}
          aria-hidden
        />
      </span>
    )
  }

  if (photoUrl && !imageFailed) {
    return <UserAvatar name={label} photoUrl={photoUrl} size="xs" />
  }

  if (logoUrl && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={label}
        onError={() => setImageFailed(true)}
        className={cn(boxClass, radiusClass, "shrink-0 border border-gray-200 object-cover")}
      />
    )
  }

  if (color) {
    return (
      <span
        className={cn(boxClass, "inline-block shrink-0", radiusClass)}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
    )
  }

  return <UserAvatar name={label} photoUrl={null} size="xs" />
}

function ProjectMarker({ payload }: { payload: GlobalSearchDisplayPayload }) {
  const logoUrl = resolveAssetUrl(payload.left?.logo ?? payload.logo)
  const color = payload.left?.color ?? payload.color
  const projectName = payload.left?.label?.trim() || "Project"

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        title={projectName}
        className="h-4 w-4 shrink-0 rounded-sm object-cover"
        aria-hidden="true"
      />
    )
  }

  if (color) {
    return (
      <span
        title={projectName}
        className="inline-flex h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
    )
  }

  return (
    <span
      title={projectName}
      className="inline-flex h-3 w-3 shrink-0 rounded-full bg-gray-300"
      aria-hidden="true"
    />
  )
}

function resolveResultAvatars(
  payload: GlobalSearchDisplayPayload,
  raw: Record<string, unknown>,
): Array<{ id: string | number | null; name: string | null; photo: string | null }> {
  const payloadAvatars = (payload.avatars ?? []).map((avatar) => ({
    id: avatar.id ?? null,
    name: avatar.name ?? null,
    photo: getPublicAssetUrl(avatar.photo ?? null),
  }))
  if (payloadAvatars.length > 0) return payloadAvatars

  const facetAvatars = getFacetAvatars(raw).map((avatar) => ({
    id: avatar.id,
    name: avatar.name,
    photo: getPublicAssetUrl(avatar.photo ?? null),
  }))
  if (facetAvatars.length > 0) return facetAvatars

  return (payload.watcher_photos ?? []).map((photo, index) => ({
    id: `watcher:${index}`,
    name: null,
    photo: getPublicAssetUrl(photo),
  }))
}

function AvatarStack({ payload, raw, max = 3 }: { payload: GlobalSearchDisplayPayload; raw: Record<string, unknown>; max?: number }) {
  const allAvatars = resolveResultAvatars(payload, raw)
  const avatars = allAvatars.slice(0, max)
  const extraCount = Math.max(0, allAvatars.length - max)
  if (avatars.length === 0) return null

  return (
    <div className="flex items-center pl-2">
      {avatars.map((avatar, index) => (
        <div key={`${avatar.id ?? avatar.name ?? index}`} className={index === 0 ? "" : "-ml-2"}>
          <UserAvatar name={avatar.name ?? null} photoUrl={avatar.photo} size="xs" />
        </div>
      ))}
      {extraCount > 0 ? (
        <div className="-ml-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-gray-100 px-1 text-[10px] font-medium text-gray-600">
          +{extraCount}
        </div>
      ) : null}
    </div>
  )
}

function TaskAssigneeAvatar({ payload, raw }: { payload: GlobalSearchDisplayPayload; raw: Record<string, unknown> }) {
  const assignee = resolveResultAvatars(payload, raw)[0]
  if (!assignee) return null
  return (
    <UserAvatar
      name={assignee.name ?? null}
      photoUrl={assignee.photo}
      size="xs"
      className="!h-5 !w-5 !min-h-5 !min-w-5"
    />
  )
}

function MetaLine({ payload }: { payload: GlobalSearchDisplayPayload }) {
  const metaItems = (payload.meta ?? [])
    .map((entry) => {
      const label = entry.label?.trim()
      const value = entry.value?.trim()
      if (label && ["is_unread", "is_seen", "created_at", "last_message_at"].includes(label.toLowerCase())) return null
      if (!label && !value) return null
      if (label && value) return `${label}: ${value}`
      return label ?? value ?? null
    })
    .filter(Boolean) as string[]

  if (metaItems.length === 0) return null
  return <div className="truncate text-xs text-gray-500">{metaItems.join(" • ")}</div>
}

function BadgesLine({ payload }: { payload: GlobalSearchDisplayPayload }) {
  const badges = (payload.badges ?? []).filter((badge) => badge.label?.trim())
  if (badges.length === 0) return null

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((badge, index) => (
        <span
          key={`${badge.label}:${index}`}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: badge.color ? `${badge.color}22` : "#f3f4f6",
            color: badge.color ?? "#374151",
          }}
        >
          {badge.label}
        </span>
      ))}
    </div>
  )
}

function PreviewLeftSlot({ children }: { children: ReactNode }) {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center">{children}</div>
}

export function SearchResultRow({
  item,
  onSelect,
  className,
  variant = "default",
  sectionType,
}: {
  item: GlobalSearchDocument
  onSelect: (item: GlobalSearchDocument) => void
  className?: string
  variant?: "default" | "preview"
  sectionType?: string
}) {
  const payload = getPayload(item)
  const isMention = item.entity_type === "mention"
  const isTask = item.entity_type === "task"
  const isProject = item.entity_type === "project"
  const isUser = item.entity_type === "user"
  const isAiThread = item.entity_type === "ai_thread"
  const isPreview = variant === "preview"
  const isUnread = isMention && getMetaBooleanByLabel(payload, "is_unread")
  const mentionDateLabel = isMention ? formatCompactDateForMention(getMentionDisplayDate(payload)) : null
  const aiTitle = isAiThread ? resolveAiThreadTitle(payload) : null
  const previewTitle = isAiThread
    ? aiTitle!
    : isMention
      ? payload.preview?.trim() || "New mention"
      : payload.title
  const previewSubtitle = isMention ? payload.title : payload.subtitle
  const taskDateValue = isTask ? resolveTaskDateValue(payload, item.raw, sectionType) : null
  const taskDateLabel = isTask ? formatCompactDateDisplay(taskDateValue) || null : null
  const taskDateOverdue = isTask ? isTaskDateOverdue(payload, sectionType) : false
  const aiDateLabel = isAiThread
    ? formatRelativeTime(getMetaValueByLabel(payload, "last_message_at") ?? getMetaValueByLabel(payload, "created_at"))
    : null
  // Simple lists: projects/users show logo/photo (color/avatar fallback). Mentions keep sender avatar.
  const showLeftVisual = isProject || isUser
  const showTypeIcon = isPreview && !showLeftVisual && !isMention && !isTask
  const mentionSenderAvatar = isMention
    ? (payload.avatars?.[0] ?? null)
    : null
  const showMeta = false
  const showBadges = false
  // Tasks use the compact row layout (marker + title | avatar + date) — never subtitle/meta text.
  // Users: name only (hide email subtitle).
  // AI chats: title only (or response snippet when the title is generic).
  const showSubtitle = false
  // Keep lists quiet — no watcher stacks on the right.
  const showRightAvatarStack = false

  if (isPreview) {
    const previewLeft = isTask ? (
      <PreviewLeftSlot>
        <ProjectMarker payload={payload} />
      </PreviewLeftSlot>
    ) : isMention ? (
      <PreviewLeftSlot>
        <UserAvatar
          name={mentionSenderAvatar?.name ?? payload.title ?? null}
          photoUrl={getPublicAssetUrl(mentionSenderAvatar?.photo ?? null)}
          size="xs"
        />
      </PreviewLeftSlot>
    ) : showLeftVisual ? (
      <PreviewLeftSlot>
        <LeftVisual
          payload={payload}
          raw={item.raw}
          isProject={isProject}
          isUser={isUser}
          compact
        />
      </PreviewLeftSlot>
    ) : (
      <EntityTypeIcon entityType={item.entity_type} className="h-8 w-8" />
    )

    return (
      <button
        type="button"
        onClick={() => onSelect(item)}
        className={cn(
          "relative flex h-10 w-full items-center px-3 text-left transition hover:bg-gray-50",
          isAiThread ? "gap-4" : "gap-3",
          className,
        )}
      >
        {previewLeft}
        <div className="min-w-0 flex-1">
          <div className={cn("flex min-w-0 items-center", isAiThread ? "gap-4" : "gap-2")}>
            <div className="min-w-0 flex-1 truncate text-sm font-normal text-gray-900">
              {previewTitle}
            </div>
            {isUnread ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
                aria-label="Unread"
                title="Unread"
              />
            ) : null}
            {isTask && taskDateLabel ? (
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap text-xs font-normal",
                  taskDateOverdue ? "text-red-600" : "text-gray-500",
                )}
              >
                {taskDateLabel}
              </span>
            ) : null}
            {mentionDateLabel ? (
              <div className="shrink-0 whitespace-nowrap text-xs font-normal text-gray-500">{mentionDateLabel}</div>
            ) : null}
            {isAiThread && aiDateLabel ? (
              <span className="w-14 shrink-0 truncate text-right text-xs font-normal text-gray-500">
                {aiDateLabel}
              </span>
            ) : null}
          </div>
        </div>
        {isTask ? (
          <div className="shrink-0">
            <TaskAssigneeAvatar payload={payload} raw={item.raw} />
          </div>
        ) : null}
      </button>
    )
  }

  if (isTask) {
    return (
      <button
        type="button"
        onClick={() => onSelect(item)}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-2 text-left transition hover:bg-gray-50",
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ProjectMarker payload={payload} />
          <span className="block min-w-0 flex-1 truncate text-xs font-normal text-gray-900">
            {previewTitle}
          </span>
        </div>
        <div className="ml-2 flex shrink-0 items-center justify-end gap-2">
          <TaskAssigneeAvatar payload={payload} raw={item.raw} />
          {taskDateLabel ? (
            <span
              className={cn(
                "whitespace-nowrap text-[11px] font-normal",
                taskDateOverdue ? "text-red-600" : "text-gray-500",
              )}
            >
              {taskDateLabel}
            </span>
          ) : null}
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        "relative flex h-8 w-full items-center px-3 text-left transition hover:bg-gray-50",
        isAiThread ? "gap-4" : "gap-2",
        className,
      )}
    >
      {isMention ? (
        <div className="shrink-0">
          <UserAvatar
            name={mentionSenderAvatar?.name ?? payload.title ?? null}
            photoUrl={getPublicAssetUrl(mentionSenderAvatar?.photo ?? null)}
            size="xs"
          />
        </div>
      ) : showLeftVisual ? (
        <div className="shrink-0">
          <LeftVisual
            payload={payload}
            raw={item.raw}
            isProject={isProject}
            isUser={isUser}
            compact
          />
        </div>
      ) : showTypeIcon ? (
        <EntityTypeIcon entityType={item.entity_type} className="h-5 w-5 rounded-md" />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-sm font-normal text-gray-900">
            {previewTitle}
          </div>
          {mentionDateLabel ? (
            <div className="shrink-0 whitespace-nowrap pl-2 text-sm font-normal text-gray-500">
              {mentionDateLabel}
            </div>
          ) : null}
          {isUnread ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
              aria-label="Unread"
              title="Unread"
            />
          ) : null}
        </div>
        {showSubtitle && previewSubtitle ? (
          <div className="truncate text-[11px] text-gray-500">{previewSubtitle}</div>
        ) : null}
        {showBadges && !isAiThread ? <BadgesLine payload={payload} /> : null}
        {showMeta && !isAiThread ? (
          <div className="mt-1">
            <MetaLine payload={payload} />
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showRightAvatarStack ? (
          <AvatarStack payload={payload} raw={item.raw} max={isProject || isAiThread ? 5 : 3} />
        ) : null}
        {isAiThread && aiDateLabel ? (
          <span className="w-14 shrink-0 truncate text-right text-sm font-normal text-gray-500">
            {aiDateLabel}
          </span>
        ) : null}
      </div>
    </button>
  )
}
