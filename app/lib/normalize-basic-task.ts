/** Normalize a task row / partial task into the flat shape TaskDetails bootstrap expects for seeding. */
export function normalizeBasicTask(task: unknown): Record<string, unknown> | undefined {
  if (!task || typeof task !== "object") return undefined
  const t = task as Record<string, unknown>
  const projects = t.projects as Record<string, unknown> | null | undefined
  const assignedUser = t.assigned_user as Record<string, unknown> | null | undefined
  const users = t.users as Record<string, unknown> | null | undefined
  const projectStatuses = t.project_statuses as Record<string, unknown> | null | undefined

  return {
    id: t.id,
    title: t.title,
    assigned_to_id: t.assigned_to_id ?? assignedUser?.id ?? users?.id,
    assigned_to_name: t.assigned_to_name ?? assignedUser?.full_name ?? users?.full_name,
    content_type_id: t.content_type_id,
    content_type_title: t.content_type_title,
    production_type_id: t.production_type_id,
    production_type_title: t.production_type_title,
    language_id: t.language_id,
    language_code: t.language_code,
    delivery_date: t.delivery_date,
    publication_date: t.publication_date,
    project_id_int: t.project_id_int ?? (typeof t.project_id === "number" ? t.project_id : undefined) ?? projects?.id,
    project_name: t.project_name ?? projects?.name,
    project_color: t.project_color ?? projects?.color,
    project_status_id: t.project_status_id ?? projectStatuses?.id,
    project_status_name: t.project_status_name ?? projectStatuses?.name,
    project_status_color: t.project_status_color ?? projectStatuses?.color,
    parent_task_id_int: t.parent_task_id_int,
    briefing: t.briefing ?? null,
    notes: t.notes ?? null,
    copy_post: t.copy_post ?? null,
    meta_title: t.meta_title ?? null,
    meta_description: t.meta_description ?? null,
    keyword: t.keyword ?? null,
    channel_names: t.channel_names,
    attachments: t.attachments ?? [],
    task_channels: t.task_channels ?? [],
    subtasks: t.subtasks ?? [],
    thread_id: t.thread_id ?? null,
    mentions: t.mentions ?? [],
    watchers: t.watchers ?? [],
    task_watchers: t.task_watchers ?? [],
    eligible_task_watchers: t.eligible_task_watchers ?? [],
    related_ideas: t.related_ideas ?? [],
    project_watchers: t.project_watchers ?? [],
    review_data: t.review_data ?? null,
    assigned_user: t.assigned_user ?? null,
    projects: t.projects ?? null,
    project_statuses: t.project_statuses ?? null,
  }
}
