import type { QueryClient } from "@tanstack/react-query"
import type {
  GlobalSearchDisplayPayload,
  GlobalSearchDocument,
} from "./global-search-types"
import { normalizeBasicTask } from "./normalize-basic-task"
import type { ProjectOverview } from "./services/projects-briefing"
import type { UserProfile } from "./services/users"
import type { TeamProfile } from "./services/teams"

export type EntityPreviewPartial = { __partial?: true }

function getMetaValue(
  payload: GlobalSearchDisplayPayload | null | undefined,
  label: string,
): string | null {
  for (const entry of payload?.meta ?? []) {
    if ((entry.label?.trim() ?? "").toLowerCase() === label.toLowerCase()) {
      return entry.value?.trim() ?? null
    }
  }
  return null
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isSuggestionRow(raw: Record<string, unknown>): boolean {
  return (
    raw.kind === "suggestion" ||
    raw.itemKind === "suggestion" ||
    raw.type === "suggestion" ||
    raw.entity_type === "suggestion" ||
    (typeof raw.board_item_id === "string" && raw.board_item_id.startsWith("suggestion:"))
  )
}

export function mergePreviewWithFull<T extends Record<string, unknown>>(
  preview: Partial<T> | null | undefined,
  full: T | null | undefined,
): Partial<T> | T | null | undefined {
  if (!full) return preview ?? null
  if (!preview) return full
  return { ...preview, ...full }
}

export function globalSearchDocumentToTaskPreview(
  item: GlobalSearchDocument,
): Record<string, unknown> | undefined {
  if (item.entity_type !== "task") return undefined

  const payload = item.display_payload
  const raw = item.raw
  const id =
    optionalNumber(raw.id) ??
    optionalNumber(raw.task_id) ??
    optionalNumber(item.entity_id) ??
    optionalNumber(item.task_id)
  if (id == null) return undefined

  const assignee = payload?.avatars?.[0]
  const statusBadge = payload?.badges?.[0]
  const projectName =
    payload?.subtitle?.trim() ||
    getMetaValue(payload, "project") ||
    (typeof raw.project_name === "string" ? raw.project_name : null)

  const merged: Record<string, unknown> = {
    ...raw,
    id,
    title: payload?.title ?? item.title ?? raw.title ?? "Untitled",
    project_name: projectName,
    project_color: payload?.left?.color ?? payload?.color ?? raw.project_color,
    project_id_int:
      item.project_id ??
      optionalNumber(raw.project_id) ??
      optionalNumber(raw.project_id_int),
    delivery_date:
      getMetaValue(payload, "delivery_date") ??
      (typeof raw.delivery_date === "string" ? raw.delivery_date : null),
    publication_date:
      getMetaValue(payload, "publication_date") ??
      (typeof raw.publication_date === "string" ? raw.publication_date : null),
    assigned_to_name:
      assignee?.name ??
      getMetaValue(payload, "assignee") ??
      (typeof raw.assigned_to_name === "string" ? raw.assigned_to_name : null),
    assigned_to_id: assignee?.id ?? raw.assigned_to_id,
    assigned_user: assignee
      ? {
          id: assignee.id,
          full_name: assignee.name,
          photo: assignee.photo,
        }
      : raw.assigned_user,
    project_status_name: statusBadge?.label ?? getMetaValue(payload, "status"),
    project_status_color: statusBadge?.color,
    briefing: payload?.preview ?? raw.briefing ?? null,
    __partial: true,
  }

  return normalizeBasicTask(merged) ?? merged
}

export function globalSearchDocumentToSuggestionPreview(
  item: GlobalSearchDocument,
): Record<string, unknown> | undefined {
  if (item.entity_type !== "task" || !isSuggestionRow(item.raw)) return undefined

  const payload = item.display_payload
  const raw = item.raw
  const id =
    optionalNumber(raw.suggestion_id) ??
    optionalNumber(raw.suggestionId) ??
    optionalNumber(raw.id) ??
    optionalNumber(item.entity_id)
  if (id == null) return undefined

  return {
    ...raw,
    id,
    kind: "suggestion",
    entity_type: "suggestion",
    proposed_title: payload?.title ?? item.title ?? raw.proposed_title,
    title: payload?.title ?? item.title ?? raw.title,
    project_name:
      payload?.subtitle?.trim() ||
      getMetaValue(payload, "project") ||
      raw.project_name,
    project_color: payload?.left?.color ?? payload?.color ?? raw.project_color,
    project_id: item.project_id ?? raw.project_id,
    delivery_date:
      getMetaValue(payload, "delivery_date") ??
      getMetaValue(payload, "publication_date") ??
      raw.delivery_date,
    briefing: payload?.preview ?? raw.briefing,
    __partial: true,
  }
}

export function globalSearchDocumentToRowPayload(
  item: GlobalSearchDocument,
): Record<string, unknown> {
  const suggestionPreview = globalSearchDocumentToSuggestionPreview(item)
  if (suggestionPreview) return suggestionPreview

  if (item.entity_type === "task") {
    const taskPreview = globalSearchDocumentToTaskPreview(item)
    if (taskPreview) {
      return { ...item.raw, ...taskPreview, id: taskPreview.id ?? item.entity_id }
    }
  }

  return {
    ...item.raw,
    id: item.entity_id ?? item.raw.id,
    title: item.display_payload?.title ?? item.title,
  }
}

export function globalSearchDocumentToProjectPreview(
  item: GlobalSearchDocument,
): Partial<ProjectOverview> & EntityPreviewPartial | null {
  if (item.entity_type !== "project" && item.entity_type !== "project_briefing") return null

  const payload = item.display_payload
  const projectId =
    item.project_id ??
    optionalNumber(item.entity_id) ??
    optionalNumber(item.raw.project_id) ??
    optionalNumber(item.raw.id)
  if (projectId == null) return null

  return {
    project_id: projectId,
    name: payload?.title ?? item.title ?? "Project",
    logo: payload?.logo ?? payload?.left?.logo ?? null,
    color: payload?.color ?? payload?.left?.color ?? null,
    description: payload?.preview ?? payload?.subtitle ?? null,
    goal: null,
    target_audience: null,
    editorial_line: null,
    start_date: null,
    end_date: null,
    project_url: null,
    created_at: "",
    team_id: null,
    team_name: payload?.subtitle ?? null,
    creation_mode: null,
    ai_autorun_days_before: null,
    __partial: true,
  }
}

export function globalSearchDocumentToUserPreview(
  item: GlobalSearchDocument,
): Partial<UserProfile> & EntityPreviewPartial | null {
  if (item.entity_type !== "user") return null

  const payload = item.display_payload
  const userId = optionalNumber(item.entity_id) ?? optionalNumber(item.raw.user_id) ?? optionalNumber(item.raw.id)
  if (userId == null) return null

  return {
    user_id: userId,
    full_name: payload?.title ?? item.title ?? null,
    photo: payload?.photo ?? payload?.left?.photo ?? null,
    auth_email: payload?.subtitle ?? getMetaValue(payload, "email") ?? "",
    brand: null,
    phone: null,
    start_date: null,
    end_date: null,
    send_invoices: null,
    send_content: null,
    send_inspiration: null,
    send_reports: null,
    active: null,
    created_at: "",
    updated_at: "",
    auth_user_id: "",
    __partial: true,
  }
}

export function globalSearchDocumentToTeamPreview(
  item: GlobalSearchDocument,
): Partial<TeamProfile> & EntityPreviewPartial | null {
  if (item.entity_type !== "team") return null

  const payload = item.display_payload
  const teamId = optionalNumber(item.entity_id) ?? optionalNumber(item.raw.team_id) ?? optionalNumber(item.raw.id)
  if (teamId == null) return null

  const title = payload?.title ?? item.title ?? "Team"
  return {
    team_id: teamId,
    title,
    full_name: payload?.subtitle?.trim() || title,
    description: payload?.preview ?? null,
    logo: payload?.logo ?? payload?.left?.logo ?? null,
    billing_business_name: null,
    billing_vat_number: null,
    billing_address_line1: null,
    billing_address_line2: null,
    billing_city: null,
    billing_postcode: null,
    billing_region: null,
    billing_country_code: null,
    invoice_provider_name: null,
    created_at: "",
    updated_at: "",
    active: null,
    member_count: 0,
    project_count: 0,
    __partial: true,
  }
}

export function globalSearchDocumentToThreadPreview(item: GlobalSearchDocument): {
  id: number
  title: string | null
  project_id: number | null
  task_id: number | null
  __partial: true
} | null {
  if (item.entity_type !== "mention") return null

  const payload = item.display_payload
  const threadId =
    item.thread_id ??
    optionalNumber(item.raw.thread_id) ??
    optionalNumber(item.raw.threadId) ??
    optionalNumber(item.entity_id)
  if (threadId == null) return null

  return {
    id: threadId,
    title: payload?.title ?? item.title ?? null,
    project_id: item.project_id ?? optionalNumber(item.raw.project_id),
    task_id: item.task_id ?? optionalNumber(item.raw.task_id),
    __partial: true,
  }
}

function seedTaskPreview(
  queryClient: QueryClient,
  item: GlobalSearchDocument,
  accessToken?: string | null,
) {
  const suggestionPreview = globalSearchDocumentToSuggestionPreview(item)
  if (suggestionPreview?.id != null) {
    queryClient.setQueryData(["task-suggestion", String(suggestionPreview.id)], (old: unknown) =>
      old ?? suggestionPreview,
    )
    return
  }

  const preview = globalSearchDocumentToTaskPreview(item)
  if (!preview || accessToken == null) return

  const taskId = String(preview.id ?? item.entity_id)
  queryClient.setQueryData(["task", taskId, accessToken], (old: Record<string, unknown> | undefined) => {
    if (!old) return { ...preview, __partial: true }
    if (!old.__partial) return old
    return { ...old, ...preview, __partial: true }
  })
}

function seedPartialQuery<T>(
  queryClient: QueryClient,
  queryKey: unknown[],
  preview: (Partial<T> & EntityPreviewPartial) | null,
) {
  if (!preview) return
  queryClient.setQueryData(queryKey, (old: unknown) => {
    if (!old) return preview
    return mergePreviewWithFull(old as Partial<T>, preview as Partial<T>)
  })
}

/** Seed React Query caches with list-level data before detail panes mount. */
export function seedEntityPreviewFromSearchDocument(
  queryClient: QueryClient,
  item: GlobalSearchDocument,
  options?: { accessToken?: string | null },
) {
  switch (item.entity_type) {
    case "task":
      seedTaskPreview(queryClient, item, options?.accessToken)
      return
    case "project":
    case "project_briefing": {
      const projectId =
        item.project_id ??
        optionalNumber(item.entity_id) ??
        optionalNumber(item.raw.project_id)
      if (projectId == null) return
      seedPartialQuery(
        queryClient,
        ["project-overview", projectId],
        globalSearchDocumentToProjectPreview(item),
      )
      return
    }
    case "user":
      seedPartialQuery(
        queryClient,
        ["user-profile", Number(item.entity_id)],
        globalSearchDocumentToUserPreview(item),
      )
      return
    case "team":
      seedPartialQuery(
        queryClient,
        ["team-profile", Number(item.entity_id)],
        globalSearchDocumentToTeamPreview(item),
      )
      return
    case "mention": {
      const preview = globalSearchDocumentToThreadPreview(item)
      if (!preview) return
      queryClient.setQueryData(["global-search-thread", preview.id], (old: unknown) => old ?? preview)
      return
    }
    default:
      return
  }
}

/** Convenience entry point for Home-origin navigation. */
export function openEntityFromHome(
  queryClient: QueryClient,
  item: GlobalSearchDocument,
  options?: { accessToken?: string | null },
) {
  seedEntityPreviewFromSearchDocument(queryClient, item, options)
  return globalSearchDocumentToRowPayload(item)
}
