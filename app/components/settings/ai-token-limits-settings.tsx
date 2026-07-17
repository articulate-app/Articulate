"use client"

import React, { useEffect, useState } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { useCurrentUserStore } from "../../store/current-user"
import { canCurrentUserManageAiLimits, setAiTokenLimit } from "../../lib/services/ai-token-limits"

type TeamOption = { team_id: number; team_title: string }

export function AiTokenLimitsSettingsPanel() {
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const [canManage, setCanManage] = useState(false)
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [teamId, setTeamId] = useState<string>("")
  const [scope, setScope] = useState<"team" | "user">("team")
  const [dailyLimit, setDailyLimit] = useState("20000")
  const [warningPercent, setWarningPercent] = useState("80")
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  )
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!publicUserId) return
    const supabase = createClientComponentClient()
    void (async () => {
      const allowed = await canCurrentUserManageAiLimits(publicUserId)
      setCanManage(allowed)
      if (!allowed) return
      const { data } = await supabase
        .from("v_user_teams_i_can_see")
        .select("team_id, team_title")
        .eq("user_id", publicUserId)
        .order("team_title")
      const rows = (data ?? []) as TeamOption[]
      setTeams(rows)
      if (rows.length > 0) setTeamId(String(rows[0].team_id))
    })()
  }, [publicUserId])

  if (!canManage) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        Ask a team admin to configure daily AI token limits.
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      const parsedTeamId = Number(teamId)
      const parsedLimit = dailyLimit.trim() === "" ? null : Number(dailyLimit)
      const parsedWarning = Number(warningPercent)
      if (!Number.isFinite(parsedTeamId) || parsedTeamId <= 0) {
        throw new Error("Select a team.")
      }
      if (parsedLimit != null && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
        throw new Error("Daily token limit must be a positive number or empty to clear.")
      }
      if (!Number.isFinite(parsedWarning) || parsedWarning <= 0 || parsedWarning > 100) {
        throw new Error("Warning percent must be between 1 and 100.")
      }
      const { error: rpcError } = await setAiTokenLimit({
        teamId: parsedTeamId,
        userId: scope === "user" ? publicUserId : null,
        dailyTokenLimit: parsedLimit,
        warningPercent: parsedWarning,
        timezone: timezone.trim() || "UTC",
        enabled: true,
      })
      if (rpcError) {
        if (rpcError.code === "42501" || /permission|403|not authorized/i.test(rpcError.message)) {
          throw new Error("You do not have permission to update AI limits for this team.")
        }
        throw rpcError
      }
      setStatus("AI token limits saved.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save AI limits.")
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setDailyLimit("")
    await handleSave()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Set daily AI token allowances per team or per user. Leave the limit empty and save to remove a policy.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900">Team</label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.team_id} value={String(team.team_id)}>
                  {team.team_title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900">Applies to</label>
          <Select value={scope} onValueChange={(value) => setScope(value as "team" | "user")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="team">Whole team</SelectItem>
              <SelectItem value="user">Only me</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900">Daily token limit</label>
          <Input value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="20000" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900">Warning at %</label>
          <Input value={warningPercent} onChange={(e) => setWarningPercent(e.target.value)} placeholder="80" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-900">Timezone</label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
      </div>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {status ? <div className="text-sm text-green-700">{status}</div> : null}
      <div className="flex gap-2">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving…" : "Save limits"}
        </Button>
        <Button variant="outline" onClick={() => void handleClear()} disabled={saving}>
          Clear policy
        </Button>
      </div>
    </div>
  )
}
