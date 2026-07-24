"use client"

import { Search } from "lucide-react"
import { UserAvatar } from "@/components/UserAvatar"
import { cn, formatCompactDateDisplay } from "@/lib/utils"
import {
  getGlobalSearchEntityLabel,
  type GlobalSearchDocument,
  type GlobalSearchDisplayPayload,
} from "../../lib/global-search-types"
import { getPublicAssetUrl } from "../../../utils/storage"

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

function LeftVisual({
  payload,
  isProject = false,
}: {
  payload: GlobalSearchDisplayPayload
  isProject?: boolean
}) {
  const left = payload.left
  const label = left?.label ?? payload.title
  const photoUrl = getPublicAssetUrl(left?.photo ?? payload.photo)
  const logoUrl = getPublicAssetUrl(left?.logo ?? payload.logo)
  const color = left?.color ?? payload.color

  if (photoUrl) {
    return <UserAvatar name={label} photoUrl={photoUrl} size="sm" />
  }

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={label}
        className="h-9 w-9 rounded-lg border border-gray-200 object-cover"
      />
    )
  }

  // Projects without a logo get a minimal, lightweight color dot. It stays centered within the same
  // footprint as the logo so text alignment and row height remain consistent across project rows.
  if (isProject) {
    return (
      <div className="flex h-9 w-9 items-center justify-center">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color || "#d1d5db" }}
          aria-hidden="true"
        />
      </div>
    )
  }

  if (color) {
    return (
      <div
        className="h-9 w-9 rounded-lg"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
    )
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
      <Search className="h-4 w-4" />
    </div>
  )
}

function ProjectMarker({ payload }: { payload: GlobalSearchDisplayPayload }) {
  const logoUrl = getPublicAssetUrl(payload.left?.logo ?? payload.logo)
  const color = payload.left?.color ?? payload.color
  const projectName = payload.left?.label?.trim() || "Project"

  if (logoUrl) {
    return (
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
  const previewTitle = isMention ? payload.preview?.trim() || "New mention" : payload.title
  const previewSubtitle = isMention ? payload.title : payload.subtitle
  const taskDateValue = isTask ? resolveTaskDateValue(payload, item.raw, sectionType) : null
  const taskDateLabel = isTask ? formatCompactDateDisplay(taskDateValue) || null : null
  const taskDateOverdue = isTask ? isTaskDateOverdue(payload, sectionType) : false
  const aiDateLabel = isAiThread
    ? formatRelativeTime(getMetaValueByLabel(payload, "last_message_at") ?? getMetaValueByLabel(payload, "created_at"))
    : null
  const showLeftVisual = !(isTask || isMention || isAiThread || (isPreview && (isMention || isTask)))
  const mentionSenderAvatar = isMention
    ? (payload.avatars?.[0] ?? null)
    : null
  const showMeta = !isPreview && !isUser
  const showBadges = !isPreview
  // Tasks use the compact row layout (marker + title | avatar + date) — never subtitle/meta text.
  // Users: name + avatar only (hide email subtitle).
  const showSubtitle = !(isPreview && isProject) && !isProject && !isMention && !isTask && !isUser
  // Home: hide thread participant stacks; mentions show sender on the left instead.
  const showRightAvatarStack = !(isMention || isTask || isUser || (isPreview && isAiThread))

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
          <span className="block min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
            {previewTitle}
          </span>
        </div>
        <div className="ml-2 flex shrink-0 items-center justify-end gap-2">
          <TaskAssigneeAvatar payload={payload} raw={item.raw} />
          {taskDateLabel ? (
            <span
              className={cn(
                "whitespace-nowrap text-xs",
                taskDateOverdue ? "font-medium text-red-600" : "text-gray-500",
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
        "flex w-full items-center gap-3 px-4 text-left transition hover:bg-gray-50",
        isProject ? "py-1.5" : "py-2",
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
          <LeftVisual payload={payload} isProject={isProject} />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        {isPreview ? (
          <div className="mb-1">
            <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-600">
              {getGlobalSearchEntityLabel(item.entity_type)}
            </span>
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          {isUnread ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden="true" /> : null}
          <div
            className={cn(
              "truncate text-sm text-gray-900",
              isMention ? "font-normal" : "font-medium",
              isUnread && !isMention && "font-semibold",
            )}
          >
            {previewTitle}
          </div>
          {mentionDateLabel ? <div className="shrink-0 whitespace-nowrap text-xs text-gray-500">{mentionDateLabel}</div> : null}
        </div>
        {isAiThread ? (
          <div className="mt-0.5 truncate text-xs text-gray-500">
            {payload.preview?.trim() || "No messages yet"}
          </div>
        ) : showSubtitle && previewSubtitle ? (
          <div className="truncate text-xs text-gray-500">{previewSubtitle}</div>
        ) : null}
        {payload.preview && !isMention && !isAiThread && !isProject && (!isMention || !isPreview) ? (
          <div className="mt-1 line-clamp-1 text-xs text-gray-500">{payload.preview}</div>
        ) : null}
        {showBadges && !isAiThread ? <BadgesLine payload={payload} /> : null}
        {showMeta && !isAiThread ? (
          <div className="mt-1">
            <MetaLine payload={payload} />
          </div>
        ) : null}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {showRightAvatarStack ? (
          <AvatarStack payload={payload} raw={item.raw} max={isProject || isAiThread ? 5 : 3} />
        ) : null}
        {isAiThread && aiDateLabel ? <span className="whitespace-nowrap text-xs text-gray-500">{aiDateLabel}</span> : null}
      </div>
    </button>
  )
}
