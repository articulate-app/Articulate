"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CreditCard, Loader2 } from "lucide-react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { TeamDocumentsSection } from "../teams/team-documents-section"
import { useCurrentUserStore } from "../../store/current-user"

type TeamOption = { team_id: number; team_title: string }

interface SettingsBillingPanelProps {
  isActive?: boolean
  onBillingHistoryExpandedChange?: (expanded: boolean) => void
  billingHistoryBackRequestId?: number
}

/**
 * Settings → Billing: plan, overview, and history for a selected team
 * (moved out of the team details page).
 */
export function SettingsBillingPanel({
  isActive = true,
  onBillingHistoryExpandedChange,
  billingHistoryBackRequestId = 0,
}: SettingsBillingPanelProps) {
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const [teamId, setTeamId] = useState<string>("")
  const [historyExpanded, setHistoryExpanded] = useState(false)

  useEffect(() => {
    if (!isActive) {
      setHistoryExpanded(false)
      onBillingHistoryExpandedChange?.(false)
    }
  }, [isActive, onBillingHistoryExpandedChange])

  useEffect(() => {
    if (billingHistoryBackRequestId > 0) {
      setHistoryExpanded(false)
      onBillingHistoryExpandedChange?.(false)
    }
  }, [billingHistoryBackRequestId, onBillingHistoryExpandedChange])

  const { data: teams, isLoading, error } = useQuery({
    queryKey: ["settings-billing-teams", publicUserId],
    enabled: !!publicUserId && publicUserId > 0,
    queryFn: async () => {
      const supabase = createClientComponentClient()
      const { data, error: teamsError } = await supabase
        .from("v_user_teams_i_can_see")
        .select("team_id, team_title")
        .eq("user_id", publicUserId)
        .order("team_title")
      if (teamsError) throw teamsError
      return (data ?? []) as TeamOption[]
    },
  })

  useEffect(() => {
    if (!teams?.length) return
    if (!teamId || !teams.some((team) => String(team.team_id) === teamId)) {
      setTeamId(String(teams[0].team_id))
    }
  }, [teamId, teams])

  const selected = teams?.find((team) => String(team.team_id) === teamId) ?? null
  const parsedTeamId = Number(teamId)
  const hasTeam = Number.isFinite(parsedTeamId) && parsedTeamId > 0

  const handleExpandedChange = (expanded: boolean) => {
    setHistoryExpanded(expanded)
    onBillingHistoryExpandedChange?.(expanded)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading billing...
      </div>
    )
  }

  if (error) {
    return <div className="py-12 text-center text-sm text-red-500">Failed to load teams.</div>
  }

  if (!teams?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <CreditCard className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">Join a team to manage billing.</p>
      </div>
    )
  }

  if (historyExpanded && hasTeam) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TeamDocumentsSection
          teamId={parsedTeamId}
          teamName={selected?.team_title}
          expanded
          onExpandedChange={handleExpandedChange}
          hideExpandedChrome
        />
      </div>
    )
  }

  const teamSelector = (
    <Select value={teamId} onValueChange={setTeamId}>
      <SelectTrigger
        id="settings-billing-team"
        className="h-8 w-auto max-w-[14rem] gap-1 border-0 bg-transparent px-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:ring-0 focus:ring-offset-0"
      >
        <SelectValue placeholder="Select team">
          <span className="truncate">{selected?.team_title ?? "Select team"}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="z-[90]">
        {teams.map((team) => (
          <SelectItem key={team.team_id} value={String(team.team_id)}>
            {team.team_title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="space-y-6">
      {hasTeam ? (
        <TeamDocumentsSection
          teamId={parsedTeamId}
          teamName={selected?.team_title}
          expanded={false}
          onExpandedChange={handleExpandedChange}
          overviewHeader={teamSelector}
        />
      ) : null}
    </div>
  )
}
