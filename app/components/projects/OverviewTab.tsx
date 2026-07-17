"use client"

import {
  ProjectOverviewPreviews,
  type ProjectOverviewTab,
} from "./project-overview-previews"

interface OverviewTabProps {
  projectId: number
  briefingOverlayContainer?: HTMLElement | null
  onNavigateTab?: (tab: ProjectOverviewTab) => void
}

export function OverviewTab({ projectId, onNavigateTab }: OverviewTabProps) {
  return (
    <div>
      <ProjectOverviewPreviews
        projectId={projectId}
        onNavigateTab={(tab) => onNavigateTab?.(tab)}
      />
    </div>
  )
}
