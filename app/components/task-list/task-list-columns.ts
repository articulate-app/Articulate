// Task list columns and types for both flat and grouped views
// Centralized here for consistency and maintainability

import { ReactNode } from "react"

// Supabase columns string with join aliases (update as needed)
export const TASK_LIST_COLUMNS_STRING = [
  "id",
  "title",
  "project_id_int",
  "project:projects(id, name)",
  "status_id",
  "status:task_status(id, name, color)",
  "assigned_to_id",
  "assigned_user:users(id, full_name, avatar_url)",
  "delivery_date",
  "created_at",
  "updated_at"
].join(", ")

// TypeScript type for a task row (matches the columns above)
export type TaskListRow = {
  id: number
  title: string
  project_id_int: number | null
  project: {
    id: number
    name: string
  } | null
  status_id: number | null
  status: {
    id: number
    name: string
    color: string | null
  } | null
  assigned_to_id: number | null
  assigned_user: {
    id: number
    full_name: string
    avatar_url: string | null
  } | null
  delivery_date: string | null
  created_at: string
  updated_at: string
}

// Array of columns for rendering (label, accessor, optional custom render)
export const TASK_LIST_COLUMNS = [
  {
    key: "title",
    label: "Title",
    render: (row: TaskListRow) => row.title,
  },
  {
    key: "project",
    label: "Project",
    render: (row: TaskListRow) => row.project?.name ?? "-",
  },
  {
    key: "status",
    label: "Status",
    render: (row: TaskListRow) => row.status?.name ?? "-",
  },
  {
    key: "assigned_user",
    label: "Assigned To",
    render: (row: TaskListRow) => row.assigned_user?.full_name ?? "-",
  },
  {
    key: "delivery_date",
    label: "Delivery Date",
    render: (row: TaskListRow) => row.delivery_date ? new Date(row.delivery_date).toLocaleDateString() : "-",
  },
  {
    key: "created_at",
    label: "Created",
    render: (row: TaskListRow) => new Date(row.created_at).toLocaleDateString(),
  },
] 