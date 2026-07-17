import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { invokeEdgeFunctionFetch } from "@/lib/edge-functions"
import type { TaskListEditBootstrapResponse } from "@/lib/types/task-list-edit-bootstrap"
import type { FilterOptions } from "./filters"

const TASK_LIST_EDIT_BOOTSTRAP_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/task-list-edit-bootstrap`

export async function fetchTaskListEditBootstrap(accessToken: string): Promise<TaskListEditBootstrapResponse> {
  void accessToken
  const supabase = createClientComponentClient()
  const res = await invokeEdgeFunctionFetch({
    supabase,
    url: TASK_LIST_EDIT_BOOTSTRAP_URL,
    debugLabel: "task-list-edit-bootstrap",
    init: {
      method: "POST",
    },
    headers: {},
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(text || `task-list-edit-bootstrap failed: ${res.status}`)
  }
  return (await res.json()) as TaskListEditBootstrapResponse
}

/** Same shape as legacy `getFilterOptions` (statuses empty; merged later with task-edit-fields). */
export function taskListEditBootstrapToFilterOptions(data: TaskListEditBootstrapResponse): FilterOptions {
  const users = (data.users ?? [])
    .filter((u) => u.id && u.full_name)
    .map((u) => ({ value: String(u.id), label: u.full_name }))

  const projects = (data.projects ?? [])
    .filter((p) => p.id && p.name)
    .map((p) => ({
      value: String(p.id),
      label: p.name,
      active: p.active ?? undefined,
      color: p.color ?? null,
      logo: p.logo ?? null,
    }))

  const contentTypes = (data.content_types ?? [])
    .filter((t) => t.id && t.title)
    .map((t) => ({ value: String(t.id), label: t.title }))

  const productionTypes = (data.production_types ?? [])
    .filter((t) => t.id && t.title)
    .map((t) => ({ value: String(t.id), label: t.title }))

  const languages = (data.languages ?? [])
    .filter((l) => l.id && l.code && l.long_name)
    .map((l) => ({
      value: String(l.id),
      label: `${l.long_name} (${l.code})`,
    }))

  const channels = (data.channels ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }))

  return {
    users,
    statuses: [],
    projects,
    contentTypes,
    productionTypes,
    languages,
    channels,
  }
}
