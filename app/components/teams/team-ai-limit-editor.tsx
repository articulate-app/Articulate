"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import {
  canCurrentUserManageAiLimits,
  listAiTokenLimitPolicies,
  setAiTokenLimit,
} from "../../lib/services/ai-token-limits"
import { formatExactTokenCount } from "../../../features/ai-chat/ai-chat-usage"
import { resolveDefaultTeamTimezone } from "@/lib/services/team-ai-usage"
import { useCurrentUserStore } from "../../store/current-user"

const POLICIES_QUERY_KEY = "ai-token-limit-policies"

/** Compact team-wide daily AI limit editor for the team details page. */
export function TeamAiLimitEditor({ teamId }: { teamId: number }) {
  const queryClient = useQueryClient()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const [canManageUi, setCanManageUi] = useState(false)
  const [dailyLimit, setDailyLimit] = useState("")
  const [warningPercent, setWarningPercent] = useState("80")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const defaultTimezone = resolveDefaultTeamTimezone()

  useEffect(() => {
    if (!publicUserId) return
    void canCurrentUserManageAiLimits(publicUserId).then(setCanManageUi)
  }, [publicUserId])

  const { data: policyPayload, isLoading } = useQuery({
    queryKey: [POLICIES_QUERY_KEY, teamId],
    enabled: teamId > 0,
    queryFn: () => listAiTokenLimitPolicies(teamId),
  })

  const teamPolicy = (policyPayload?.policies ?? []).find((policy) => policy.user_id == null)
  const canManage = policyPayload?.can_manage === true && canManageUi

  useEffect(() => {
    if (teamPolicy) {
      setDailyLimit(String(teamPolicy.daily_token_limit ?? ""))
      setWarningPercent(String(teamPolicy.warning_percent ?? 80))
    } else {
      setDailyLimit("")
      setWarningPercent("80")
    }
    setStatus(null)
    setError(null)
  }, [teamPolicy?.id, teamPolicy?.updated_at, teamPolicy?.daily_token_limit, teamPolicy?.warning_percent])

  const saveMutation = useMutation({
    mutationFn: async (clear: boolean) => {
      if (!canManage) throw new Error("You do not have permission to update this team’s AI limit.")
      const parsedLimit = clear || dailyLimit.trim() === "" ? null : Number(dailyLimit)
      const parsedWarning = Number(warningPercent)
      if (parsedLimit != null && (!Number.isFinite(parsedLimit) || parsedLimit <= 0)) {
        throw new Error("Daily token limit must be a positive number or empty to clear.")
      }
      if (!Number.isFinite(parsedWarning) || parsedWarning <= 0 || parsedWarning >= 100) {
        throw new Error("Warning percent must be between 1 and 99.")
      }
      const { error: rpcError } = await setAiTokenLimit({
        teamId,
        userId: null,
        dailyTokenLimit: parsedLimit,
        warningPercent: parsedWarning,
        timezone: teamPolicy?.timezone || defaultTimezone || "UTC",
        enabled: true,
      })
      if (rpcError) throw rpcError
      return clear || parsedLimit == null ? "cleared" : "saved"
    },
    onSuccess: async (result) => {
      setError(null)
      setStatus(result === "cleared" ? "Team AI limit cleared." : "Team AI limit saved.")
      await queryClient.invalidateQueries({ queryKey: [POLICIES_QUERY_KEY, teamId] })
    },
    onError: (saveError) => {
      setStatus(null)
      setError(saveError instanceof Error ? saveError.message : "Failed to save team AI limit.")
    },
  })

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-gray-900">Team AI limit</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Daily token allowance for the whole team. Personal limits are set in Preferences → AI limits.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading limit…
        </div>
      ) : !canManage ? (
        <div className="text-sm text-gray-600">
          {teamPolicy ? (
            <>
              Limit:{" "}
              <span className="font-medium tabular-nums text-gray-900">
                {formatExactTokenCount(teamPolicy.daily_token_limit)} / day
              </span>
              <span className="text-gray-500"> · warn at {teamPolicy.warning_percent}%</span>
            </>
          ) : (
            <p>No team-wide AI limit configured.</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-ai-daily-limit">Daily token limit</Label>
              <Input
                id="team-ai-daily-limit"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                placeholder="e.g. 50000"
                disabled={saveMutation.isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-ai-warning">Warning at %</Label>
              <Input
                id="team-ai-warning"
                value={warningPercent}
                onChange={(e) => setWarningPercent(e.target.value)}
                placeholder="80"
                disabled={saveMutation.isPending}
              />
            </div>
          </div>
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {status ? <div className="text-sm text-green-700">{status}</div> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => saveMutation.mutate(false)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => saveMutation.mutate(true)}
              disabled={saveMutation.isPending || !teamPolicy}
            >
              Clear
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
