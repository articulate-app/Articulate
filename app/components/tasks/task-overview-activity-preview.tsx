"use client"

import React from "react"
import dynamic from "next/dynamic"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"

const TaskActivityTimeline = dynamic(
  () => import("../task-activity/task-activity-timeline").then((m) => m.TaskActivityTimeline),
  { ssr: false },
)

type TaskOverviewActivityPreviewProps = {
  taskId: number
  onViewAll: () => void
  active?: boolean
}

export function TaskOverviewActivityPreview({
  taskId,
  onViewAll,
  active = true,
}: TaskOverviewActivityPreviewProps) {
  return (
    <TaskOverviewPreviewSection title="Activity" onViewAll={onViewAll} active={active}>
      <TaskActivityTimeline taskId={taskId} compact previewLimit={5} />
    </TaskOverviewPreviewSection>
  )
}
