"use client"

import React, { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import {
  fetchProjectComponentChannelPolicies,
  projectComponentChannelPoliciesQueryKey,
  setProjectChannelComponentPolicy,
  type ProjectChannelComponentRef,
  type ProjectComponentChannelPoliciesResponse,
  type ProjectComponentChannelPolicyRow,
} from "../../lib/services/project-component-channel-policies"
import { cn } from "../../lib/utils"

type ChannelDraft = {
  required: boolean
  positionText: string
}

function rowToDraft(row: ProjectComponentChannelPolicyRow): ChannelDraft {
  return {
    required: row.required === true || row.policy === "required",
    positionText: row.position != null && Number.isFinite(row.position) ? String(row.position) : "",
  }
}

function parsePositionInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function ChannelRequirementsSection({
  projectId,
  component,
}: {
  projectId: number
  component: ProjectChannelComponentRef
}) {
  const queryClient = useQueryClient()
  const queryKey = projectComponentChannelPoliciesQueryKey(projectId, component)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [savingChannelId, setSavingChannelId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data: response, error: fetchError } = await fetchProjectComponentChannelPolicies({
        projectId,
        component,
      })
      if (fetchError) throw fetchError
      if (!response) throw new Error("Failed to load channel requirements")
      return response
    },
  })

  const channels = useMemo(() => data?.channels ?? [], [data?.channels])

  const persistPolicy = useCallback(
    async (args: {
      channelId: number
      required: boolean
      positionText: string
      previous: ProjectComponentChannelPoliciesResponse
    }) => {
      setInlineError(null)
      setSavingChannelId(args.channelId)
      const position = args.required ? parsePositionInput(args.positionText) : null

      const optimistic: ProjectComponentChannelPoliciesResponse = {
        ...args.previous,
        channels: args.previous.channels.map((row) =>
          row.channel_id === args.channelId
            ? {
                ...row,
                required: args.required,
                policy: args.required ? "required" : "optional",
                position,
              }
            : row,
        ),
      }
      queryClient.setQueryData(queryKey, optimistic)

      try {
        const { error: saveError } = await setProjectChannelComponentPolicy({
          projectId,
          channelId: args.channelId,
          component,
          required: args.required,
          position,
        })
        if (saveError) throw saveError
        await queryClient.invalidateQueries({ queryKey })
      } catch (err) {
        queryClient.setQueryData(queryKey, args.previous)
        const message =
          err instanceof Error ? err.message : "Failed to save channel requirement"
        setInlineError(message)
      } finally {
        setSavingChannelId(null)
      }
    },
    [component, projectId, queryClient, queryKey],
  )

  const mutation = useMutation({
    mutationFn: persistPolicy,
  })

  const handleRequiredChange = (row: ProjectComponentChannelPolicyRow, required: boolean) => {
    if (!data) return
    const draft = rowToDraft(row)
    void mutation.mutateAsync({
      channelId: row.channel_id,
      required,
      positionText: draft.positionText,
      previous: data,
    })
  }

  const handlePositionBlur = (row: ProjectComponentChannelPolicyRow, positionText: string) => {
    if (!data) return
    if (!row.required && row.policy !== "required") return
    const nextPosition = parsePositionInput(positionText)
    const prevPosition = row.position
    if (nextPosition === prevPosition) return
    if (
      (nextPosition == null && prevPosition == null)
      || (positionText.trim() === "" && prevPosition == null)
    ) {
      return
    }
    void mutation.mutateAsync({
      channelId: row.channel_id,
      required: true,
      positionText,
      previous: data,
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-900">Channel requirements</h4>
        <p className="mt-1 text-xs text-gray-500">
          Required components are always included when AI builds this channel.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading channels…
        </div>
      ) : error ? (
        <div className="text-sm text-red-600">
          Failed to load channel requirements: {String((error as Error).message || error)}
        </div>
      ) : channels.length === 0 ? (
        <div className="text-sm text-gray-500">No channels enabled for this project.</div>
      ) : (
        <div className="space-y-2">
          {channels.map((row) => {
            const draft = rowToDraft(row)
            const isSaving = savingChannelId === row.channel_id
            return (
              <div
                key={row.channel_id}
                className="rounded-md border border-gray-200 bg-white px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {row.channel_name}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" aria-hidden />
                    ) : null}
                    <Label
                      htmlFor={`channel-required-${row.channel_id}`}
                      className="cursor-pointer text-xs text-gray-700"
                    >
                      Required
                    </Label>
                    <Switch
                      id={`channel-required-${row.channel_id}`}
                      checked={draft.required}
                      disabled={isSaving || mutation.isPending}
                      onCheckedChange={(checked) => handleRequiredChange(row, checked)}
                      className="data-[state=checked]:bg-gray-900 data-[state=unchecked]:bg-gray-200"
                    />
                  </div>
                </div>

                {draft.required ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Label
                      htmlFor={`channel-position-${row.channel_id}`}
                      className="shrink-0 text-xs text-gray-500"
                    >
                      Order anchor
                    </Label>
                    <Input
                      id={`channel-position-${row.channel_id}`}
                      type="number"
                      inputMode="numeric"
                      defaultValue={draft.positionText}
                      key={`${row.channel_id}:${draft.positionText}:${draft.required}`}
                      disabled={isSaving || mutation.isPending}
                      onBlur={(event) => handlePositionBlur(row, event.target.value)}
                      placeholder="Optional"
                      className={cn(
                        "h-8 w-28 border-gray-200 bg-white text-xs text-gray-900",
                        "focus-visible:ring-gray-400",
                      )}
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {inlineError ? (
        <p className="text-xs text-red-600 break-words [overflow-wrap:anywhere]">{inlineError}</p>
      ) : null}
    </div>
  )
}
