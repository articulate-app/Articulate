import type { QueryClient } from "@tanstack/react-query"
import type { TaskChannelBootstrapResponse } from "../../app/lib/types/task-channel-bootstrap"
import { normalizeDiffPlainText } from "../tasks/utils/component-content-diff"

function taskChannelBootstrapQueryKey(taskId: number, channelId: number) {
  return ["task-channel-bootstrap", taskId, channelId] as const
}

function rowMatches(args: {
  row: Record<string, unknown>
  taskComponentOutputId?: string | null
  componentId: string
}): boolean {
  const rowOutputId =
    typeof args.row.task_component_output_id === "string" ? args.row.task_component_output_id : null
  const rowTaskComponentId =
    typeof args.row.task_component_id === "string" ? args.row.task_component_id : null
  if (args.taskComponentOutputId && rowOutputId === args.taskComponentOutputId) return true
  if (rowTaskComponentId && rowTaskComponentId === args.componentId) return true
  return false
}

export function resolveComponentOutputPlainTextFromQueryCache(
  queryClient: QueryClient,
  args: {
    taskId: number
    channelId: number
    componentId: string
    taskComponentOutputId?: string | null
  },
): string {
  const bootstrap = queryClient.getQueryData<TaskChannelBootstrapResponse>([
    ...taskChannelBootstrapQueryKey(args.taskId, args.channelId),
  ])
  const rows = bootstrap?.composed_output ?? []
  const match = rows.find((row) =>
    rowMatches({
      row: row as unknown as Record<string, unknown>,
      taskComponentOutputId: args.taskComponentOutputId,
      componentId: args.componentId,
    }),
  ) as Record<string, unknown> | undefined

  if (!match) return ""

  if (typeof match.content_text === "string" && match.content_text.trim()) {
    return normalizeDiffPlainText(match.content_text)
  }

  const blocks = match.content ?? match.resolved_content_json ?? match.content_json
  if (Array.isArray(blocks)) {
    const paragraphText = blocks
      .filter((block) => block && typeof block === "object")
      .map((block) => {
        const row = block as { type?: string; text?: string }
        if (row.type === "paragraph" || row.type === "text") {
          return typeof row.text === "string" ? row.text : ""
        }
        return ""
      })
      .join("\n")
      .trim()
    if (paragraphText) return normalizeDiffPlainText(paragraphText)
  }

  return ""
}

export function resolveComponentTitleFromQueryCache(
  queryClient: QueryClient,
  args: {
    taskId: number
    channelId: number
    componentId: string
    taskComponentOutputId?: string | null
  },
): string {
  const bootstrap = queryClient.getQueryData<TaskChannelBootstrapResponse>([
    ...taskChannelBootstrapQueryKey(args.taskId, args.channelId),
  ])
  const components = bootstrap?.components ?? []
  const componentMatch = components.find(
    (row) => row.task_component_id === args.componentId,
  )

  if (componentMatch) {
    const title = componentMatch.title?.trim() ?? ""
    const templateTitle = componentMatch.template_title?.trim() ?? ""
    const projectTemplateTitle = componentMatch.project_template_title?.trim() ?? ""
    if (title) return title
    if (templateTitle) return templateTitle
    if (projectTemplateTitle) return projectTemplateTitle
  }

  const rows = bootstrap?.composed_output ?? []
  const match = rows.find((row) =>
    rowMatches({
      row: row as unknown as Record<string, unknown>,
      taskComponentOutputId: args.taskComponentOutputId,
      componentId: args.componentId,
    }),
  ) as Record<string, unknown> | undefined

  if (match) {
    const title = typeof match.title === "string" ? match.title.trim() : ""
    if (title) return title
  }

  return ""
}

export function resolveComponentOutputUpdatedAtFromQueryCache(
  queryClient: QueryClient,
  args: {
    taskId: number
    channelId: number
    componentId: string
    taskComponentOutputId?: string | null
  },
): string | null {
  const bootstrap = queryClient.getQueryData<TaskChannelBootstrapResponse>([
    ...taskChannelBootstrapQueryKey(args.taskId, args.channelId),
  ])
  const rows = bootstrap?.composed_output ?? []
  const match = rows.find((row) =>
    rowMatches({
      row: row as unknown as Record<string, unknown>,
      taskComponentOutputId: args.taskComponentOutputId,
      componentId: args.componentId,
    }),
  ) as Record<string, unknown> | undefined

  if (!match) return null

  const updatedAt = match.updated_at
  if (typeof updatedAt === "string" && updatedAt.trim()) {
    return updatedAt.trim()
  }
  return null
}
