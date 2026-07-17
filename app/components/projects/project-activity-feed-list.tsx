"use client"

import { UserAvatar } from "../UserAvatar"
import { getImageUrl } from "../../lib/public-media"
import type { ProjectActivityFeedRow } from "../../lib/services/project-activity"
import {
  ActivityRowTimestamp,
  formatActivityDateShort,
  getActivityRelativeTimeLabel,
} from "../activity-row-timestamp"

function formatActivityLine(log: ProjectActivityFeedRow): string {
  const title = log.event || log.title || "Activity"
  const isTaskEvent = log.entity_type === "task" && log.task_name
  const details = log.details_json ?? {}
  const isPlannerRun =
    /planner\s+run\s+completed/i.test(title) && typeof details.suggestions_created === "number"
  const suggestionsText = isPlannerRun
    ? `${details.suggestions_created} suggestion${details.suggestions_created === 1 ? "" : "s"} created`
    : null
  const suffix = isTaskEvent ? log.task_name : suggestionsText
  return suffix ? `${title} · ${suffix}` : title
}

export function ProjectActivityFeedList({
  logs,
  selectedLogUid,
  onSelect,
  previewLimit,
}: {
  logs: ProjectActivityFeedRow[]
  selectedLogUid?: string | null
  onSelect?: (log: ProjectActivityFeedRow) => void
  previewLimit?: number
}) {
  const visible = typeof previewLimit === "number" ? logs.slice(0, previewLimit) : logs

  return (
    <ul className="flex flex-col">
      {visible.map((log, idx) => {
        const photoUrl = getImageUrl(log.assigned_to_photo)
        const userDisplay =
          log.assigned_to_name ??
          log.assigned_to_email ??
          (log.user_id != null ? `User ${log.user_id}` : "System")
        const timestamp = log.timestamp ?? log.created_at
        const line = formatActivityLine(log)
        const isSelected = selectedLogUid != null && selectedLogUid === log.uid

        return (
          <li key={log.uid}>
            {idx > 0 ? <div className="border-t border-gray-200" /> : null}
            <button
              type="button"
              onClick={() => onSelect?.(log)}
              className={[
                "flex w-full items-center gap-2 py-1.5 min-h-0 text-left transition-colors",
                onSelect ? "hover:bg-gray-50" : "",
                isSelected ? "bg-blue-50" : "",
              ].join(" ")}
            >
              <UserAvatar name={userDisplay} photoUrl={photoUrl} size="xs" className="h-7 w-7" />
              <div className="min-w-0 flex-1 overflow-hidden text-sm text-gray-700">
                <span className="block truncate" title={line}>
                  <span className="font-medium text-gray-900">{userDisplay}</span>
                  <span className="text-gray-500"> · {line}</span>
                </span>
              </div>
              <ActivityRowTimestamp value={timestamp} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export {
  getActivityRelativeTimeLabel as getProjectActivityRelativeTimeLabel,
  formatActivityDateShort as formatProjectActivityDateShort,
}
