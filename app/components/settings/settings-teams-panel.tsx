"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, Loader2, Users } from "lucide-react"
import { getUserTeamsWithRoles } from "../../lib/services/userSkillsAndMemberships"
import { TeamDetailsPage } from "../teams/TeamDetailsPage"

export type SettingsTeamsDetailState = {
  open: boolean
  title?: string
}

interface SettingsTeamsPanelProps {
  userId: number
  /** When false, clear any nested team detail selection. */
  isActive?: boolean
  /** Called when nested team detail open/close changes (parent header shows back chevron). */
  onDetailOpenChange?: (state: SettingsTeamsDetailState) => void
  /** Incremented by parent when the header back chevron is pressed. */
  backRequestId?: number
}

export function SettingsTeamsPanel({
  userId,
  isActive = true,
  onDetailOpenChange,
  backRequestId = 0,
}: SettingsTeamsPanelProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)

  useEffect(() => {
    if (!isActive) setSelectedTeamId(null)
  }, [isActive])

  useEffect(() => {
    if (backRequestId > 0) {
      setSelectedTeamId(null)
    }
  }, [backRequestId])

  const { data: teams, isLoading, error } = useQuery({
    queryKey: ["user-teams", userId],
    queryFn: async () => {
      const result = await getUserTeamsWithRoles(userId)
      if (result.error) throw result.error
      return result.data || []
    },
    enabled: userId > 0,
  })

  const selected = teams?.find((team) => team.team_id === selectedTeamId) ?? null

  useEffect(() => {
    if (!onDetailOpenChange) return
    if (selectedTeamId != null) {
      onDetailOpenChange({ open: true, title: selected?.team_title ?? "Team" })
      return
    }
    onDetailOpenChange({ open: false })
  }, [onDetailOpenChange, selected?.team_title, selectedTeamId])

  useEffect(() => {
    return () => {
      // Only clear detail chrome on unmount; avoid looping with the sync effect above.
      onDetailOpenChange?.({ open: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, [])

  if (selectedTeamId != null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TeamDetailsPage
          teamId={selectedTeamId}
          embedded
          hideHeader
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading teams...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-12 text-center text-sm text-red-500">
        Failed to load teams.
      </div>
    )
  }

  if (!teams?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Users className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">You are not on any teams yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Open a team to manage members, billing info, and the team AI limit and usage.
      </p>
      <div className="space-y-1">
      {teams.map((team) => (
        <button
          key={team.team_id}
          type="button"
          onClick={() => setSelectedTeamId(team.team_id)}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900">
              {team.team_title}
            </div>
            {team.role_title ? (
              <p className="truncate text-xs text-gray-500">{team.role_title}</p>
            ) : null}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
        </button>
      ))}
      </div>
    </div>
  )
}
