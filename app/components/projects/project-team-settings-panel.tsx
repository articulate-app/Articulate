"use client"

import { Loader2, Users } from "lucide-react"
import { TeamDetailsPage } from "../teams/TeamDetailsPage"

interface ProjectTeamSettingsPanelProps {
  teamId: number | null | undefined
  teamName?: string | null
  isLoading?: boolean
}

export function ProjectTeamSettingsPanel({
  teamId,
  teamName,
  isLoading = false,
}: ProjectTeamSettingsPanelProps) {
  const hasTeam = teamId != null && Number.isFinite(teamId) && teamId > 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  if (!hasTeam) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Users className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">This project is not linked to a team.</p>
        {teamName ? <p className="text-xs text-gray-400">{teamName}</p> : null}
      </div>
    )
  }

  return (
    <div className="min-h-0">
      <TeamDetailsPage teamId={teamId as number} embedded hideHeader />
    </div>
  )
}
