"use client"

import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { X, FileText } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { Button } from "../ui/button"
import type { ProjectActivityFeedRow } from "../../lib/services/project-activity"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { UserAvatar } from "../UserAvatar"
import { getImageUrl } from "../../lib/public-media"
import { useProjectStatusesQuery } from "../../hooks/use-project-shared-queries"

interface ActivityLogDetailsPaneProps {
  log: ProjectActivityFeedRow
  onClose: () => void
  onTaskSelect: (taskId: number) => void
}

const TRUNCATE_LEN = 80
const STATUS_FIELD_KEYS = ["project_status", "status", "project_status_id", "project_statuses"]

/** Internal/audit fields to hide from the changed section */
const CHANGED_EXCLUDE_KEYS = new Set([
  "op",
  "update",
  "label",
  "table",
  "changed",
  "record_key",
])

function snakeToTitle(str: string): string {
  return str
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

function StatusPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color, color: "#fff" }}
    >
      {name}
    </span>
  )
}

function TruncatableValue({ value, className }: { value: string; className?: string }) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncate = value.length > TRUNCATE_LEN
  const display = needsTruncate && !expanded ? value.slice(0, TRUNCATE_LEN) + "…" : value

  return (
    <div className={className}>
      <span className="whitespace-pre-wrap break-words">{display}</span>
      {needsTruncate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((p) => !p)
          }}
          className="ml-1 text-xs text-blue-600 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

function formatDetailValue(value: unknown, allowBlank = false): string {
  if (value === null || value === undefined) return allowBlank ? "" : "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return value
  if (value instanceof Date) return format(value, "PPp")
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  return String(value)
}

function toSafeDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function renderChangedValue(
  v: unknown,
  fieldKey: string,
  statusById: Map<number, { name: string; color: string }>,
  statusByName: Map<string, { name: string; color: string }>,
  allowBlank = false
): React.ReactNode {
  if (v === null || v === undefined) return allowBlank ? null : "—"
  const isStatusField = STATUS_FIELD_KEYS.some((k) => fieldKey.toLowerCase() === k.toLowerCase())
  if (!isStatusField) return formatDetailValue(v, allowBlank)

  const resolveStatus = (val: unknown): { name: string; color: string } | null => {
    if (val === null || val === undefined) return null
    const id = typeof val === "number" ? val : typeof val === "string" ? parseInt(String(val), 10) : null
    if (id != null && !Number.isNaN(id)) {
      const byId = statusById.get(id)
      if (byId) return byId
    }
    const str = typeof val === "string" ? val.trim() : String(val)
    if (str) return statusByName.get(str) ?? statusByName.get(str.toLowerCase()) ?? null
    return null
  }

  const status = resolveStatus(v)
  if (status) return <StatusPill name={status.name} color={status.color} />
  return formatDetailValue(v, allowBlank)
}

export function ActivityLogDetailsPane({ log, onClose, onTaskSelect }: ActivityLogDetailsPaneProps) {
  const supabase = createClientComponentClient()
  const { data: userData } = useQuery({
    queryKey: ["user", log.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("id", log.user_id)
        .single()
      if (error) return null
      return data
    },
    enabled: !!log.user_id,
  })

  const { data: statuses } = useProjectStatusesQuery(log.project_id)

  const { statusById, statusByName } = React.useMemo(() => {
    const byId = new Map<number, { name: string; color: string }>()
    const byName = new Map<string, { name: string; color: string }>()
    for (const s of statuses ?? []) {
      byId.set(s.id, { name: s.name, color: s.color })
      byName.set(s.name, { name: s.name, color: s.color })
      byName.set(s.name.toLowerCase(), { name: s.name, color: s.color })
    }
    return { statusById: byId, statusByName: byName }
  }, [statuses])

  const userDisplay =
    userData?.full_name ??
    log.assigned_to_name ??
    log.assigned_to_email ??
    (log.user_id != null ? `User ${log.user_id}` : "System")
  const safeTimestamp = toSafeDate(log.timestamp)

  const changed = log.changed ?? {}
  const allChangedFields = log.changed_fields ?? Object.keys(changed)
  const changedFields = allChangedFields.filter((k) => !CHANGED_EXCLUDE_KEYS.has(k.toLowerCase()))

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 truncate">Activity Log Details</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {changedFields.length > 0 && (
          <div className="space-y-4">
            <div className="space-y-5">
              {changedFields.map((fieldKey) => {
                const entry = changed[fieldKey]
                const fieldLabel = snakeToTitle(fieldKey)
                const oldVal = entry?.old
                const newVal = entry?.new
                const isStatusField = STATUS_FIELD_KEYS.some((k) => fieldKey.toLowerCase() === k.toLowerCase())
                const oldStr = formatDetailValue(oldVal, true)
                const newStr = formatDetailValue(newVal, true)
                const oldNeedsTruncate = !isStatusField && typeof oldStr === "string" && oldStr.length > TRUNCATE_LEN
                const newNeedsTruncate = !isStatusField && typeof newStr === "string" && newStr.length > TRUNCATE_LEN

                const renderVal = (val: unknown, needsTruncate: boolean, str: string) => {
                  if (val === null || val === undefined) return null
                  if (needsTruncate && str) return <TruncatableValue value={str} />
                  return renderChangedValue(val, fieldKey, statusById, statusByName, true)
                }

                return (
                  <div key={fieldKey} className="space-y-2">
                    <div className="flex justify-between items-center gap-4 text-sm">
                      <span className="text-left text-gray-500 shrink-0">Field changed</span>
                      <span className="text-right text-gray-900 font-medium truncate">{fieldLabel}</span>
                    </div>
                    <div className="flex justify-between items-center gap-4 text-sm py-1">
                      <span className="text-left text-gray-500 shrink-0">Old</span>
                      <div className="text-right text-gray-800 min-w-0">{renderVal(oldVal, oldNeedsTruncate, oldStr)}</div>
                    </div>
                    <div className="flex justify-between items-center gap-4 text-sm py-1">
                      <span className="text-left text-gray-500 shrink-0">New</span>
                      <div className="text-right text-gray-800 min-w-0">{renderVal(newVal, newNeedsTruncate, newStr)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex justify-between items-center gap-4 text-sm py-1">
            <span className="text-left text-gray-500 shrink-0">Title</span>
            <span className="text-right text-gray-900 font-medium truncate">{log.title || "—"}</span>
          </div>
          <div className="flex justify-between items-center gap-4 text-sm py-1">
            <span className="text-left text-gray-500 shrink-0">Timestamp</span>
            <div className="text-right text-gray-800">
              <div>{safeTimestamp ? format(safeTimestamp, "PPp") : "—"}</div>
              <div className="text-xs text-gray-500">
                {safeTimestamp ? formatDistanceToNow(safeTimestamp, { addSuffix: true }) : "Unknown time"}
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center gap-4 text-sm py-1">
            <span className="text-left text-gray-500 shrink-0">User</span>
            <div className="text-right text-gray-800 flex items-center justify-end gap-2">
              <UserAvatar name={userDisplay} photoUrl={getImageUrl(log.assigned_to_photo)} size="sm" />
              <span>{userDisplay}</span>
            </div>
          </div>
          <div className="flex justify-between items-center gap-4 text-sm py-1">
            <span className="text-left text-gray-500 shrink-0">Entity type</span>
            <span className="text-right text-gray-800 truncate">{log.entity_type || "—"}</span>
          </div>
          {log.task_id != null && (
            <div className="flex justify-between items-start gap-4 text-sm py-1">
              <span className="text-left text-gray-500 shrink-0 pt-0.5">Task</span>
              <div className="text-right min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onTaskSelect(log.task_id!)}
                  className="text-gray-900 hover:text-gray-700 hover:underline inline-flex items-start gap-1.5 text-left w-full break-words"
                  title={log.task_name ?? `Task #${log.task_id}`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-500" />
                  <span className="break-words">{log.task_name || `Task #${log.task_id}`}</span>
                </button>
              </div>
            </div>
          )}

          {(() => {
            const details = log.details_json ?? {}
            const excludeKeys = new Set(["run_id"])
            const entries = Object.entries(details).filter(([k]) => !excludeKeys.has(k))
            if (entries.length === 0) return null

            const formatDetailsValue = (v: unknown): string => {
              if (v === null || v === undefined) return "—"
              if (typeof v === "boolean") return v ? "Yes" : "No"
              if (typeof v === "number") return String(v)
              if (typeof v === "string") {
                return v
                  .split("_")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join(" ")
              }
              return String(v)
            }

            return (
              <div className="space-y-2 pt-2 border-t border-gray-100 mt-2">
                {entries.map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center gap-4 text-sm py-1">
                    <span className="text-left text-gray-500 shrink-0">{snakeToTitle(key)}</span>
                    <span className="text-right text-gray-800 truncate">{formatDetailsValue(value)}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
