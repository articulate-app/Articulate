"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronRight, Loader2, Trash2 } from "lucide-react"

import { Button } from "../ui/button"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { toast } from "../ui/use-toast"
import { AddDashedButton } from "../ui/add-dashed-button"
import {
  addUserToTeam,
  getMinimalTeams,
  getRoles,
  getUserTeamsWithRoles,
  removeUserFromTeam,
} from "../../lib/services/userSkillsAndMemberships"

type UserTeamsSettingsSectionProps = {
  userId: number
  onOpenTeam?: (teamId: number) => void
}

export function UserTeamsSettingsSection({ userId, onOpenTeam }: UserTeamsSettingsSectionProps) {
  const queryClient = useQueryClient()
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingRemoveId, setPendingRemoveId] = useState<number | null>(null)

  const { data: teams, isLoading } = useQuery({
    queryKey: ["user-teams", userId],
    queryFn: async () => {
      const result = await getUserTeamsWithRoles(userId)
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const result = await getRoles()
      if (result.error) throw result.error
      return result.data || []
    },
  })

  const { data: minimalTeams } = useQuery({
    queryKey: ["teams-minimal"],
    queryFn: async () => {
      const result = await getMinimalTeams()
      if (result.error) throw result.error
      return result.data || []
    },
    enabled: showAddPanel,
  })

  const availableTeams = useMemo(() => {
    if (!minimalTeams) return []
    const memberTeamIds = new Set((teams ?? []).map((team) => team.team_id))
    return minimalTeams.filter((team) => !memberTeamIds.has(team.id))
  }, [minimalTeams, teams])

  const resetAddPanel = () => {
    setShowAddPanel(false)
    setSelectedTeamId(null)
    setSelectedRoleId(null)
  }

  const handleAddToTeam = async () => {
    if (!selectedTeamId || !selectedRoleId) return
    setIsSubmitting(true)
    try {
      const { error } = await addUserToTeam(userId, selectedTeamId, selectedRoleId)
      if (error) throw error
      toast({ title: "Success", description: "User added to team successfully" })
      queryClient.invalidateQueries({ queryKey: ["user-teams", userId] })
      resetAddPanel()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to add user to team",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveFromTeam = async (teamId: number) => {
    try {
      const { error } = await removeUserFromTeam(userId, teamId)
      if (error) throw error
      toast({ title: "Success", description: "User removed from team successfully" })
      queryClient.invalidateQueries({ queryKey: ["user-teams", userId] })
      setPendingRemoveId(null)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to remove user from team",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    )
  }

  const pendingTeam = teams?.find((team) => team.team_id === pendingRemoveId) ?? null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900">Teams</h3>
        <p className="mt-0.5 text-xs text-gray-500">Teams this user belongs to and their role.</p>
      </div>

      {showAddPanel ? (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium text-gray-900">Add to team</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={resetAddPanel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Team</Label>
            <Select
              value={selectedTeamId ? String(selectedTeamId) : ""}
              onValueChange={(value) => setSelectedTeamId(parseInt(value, 10))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {availableTeams.map((team) => (
                  <SelectItem key={team.id} value={String(team.id)}>
                    {team.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={selectedRoleId ? String(selectedRoleId) : ""}
              onValueChange={(value) => setSelectedRoleId(parseInt(value, 10))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles?.map((role) => (
                  <SelectItem key={role.id} value={String(role.id)}>
                    {role.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleAddToTeam()}
            disabled={!selectedTeamId || !selectedRoleId || isSubmitting}
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add to team
          </Button>
        </div>
      ) : null}

      {pendingTeam ? (
        <div className="space-y-3 rounded-lg border border-red-100 bg-red-50/70 p-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900">Remove from team?</h4>
            <p className="mt-1 text-sm text-gray-600">
              Remove this user from {pendingTeam.team_title}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPendingRemoveId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void handleRemoveFromTeam(pendingTeam.team_id)}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : null}

      {teams && teams.length > 0 ? (
        <div>
          {teams.map((team) => (
            <div
              key={team.team_id}
              className="flex items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-b-0"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                onClick={() => onOpenTeam?.(team.team_id)}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">{team.team_title}</div>
                  <p className="mt-0.5 truncate text-sm text-gray-500">
                    {team.role_title}
                    {team.has_access_app ? " · App access" : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0 text-gray-400 hover:text-red-600"
                onClick={() => setPendingRemoveId(team.team_id)}
                aria-label="Remove from team"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-sm text-gray-500">No teams yet.</p>
      )}

      {!showAddPanel ? (
        <AddDashedButton label="Add to team" className="mt-0" onClick={() => setShowAddPanel(true)} />
      ) : null}
    </div>
  )
}
