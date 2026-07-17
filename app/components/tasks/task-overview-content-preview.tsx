"use client"

import React, { useMemo } from "react"
import { useTaskChannelList } from "@/hooks/use-task-channel-list"
import { useTaskChannelBootstrap } from "@/hooks/use-task-channel-bootstrap"
import { TaskChannelPills } from "./task-channel-pills"
import { TaskOverviewPreviewSection } from "./task-overview-preview-section"
import { ComponentOutputReadonlyBody } from "../../../features/tasks/components/ComponentOutputReadonlyBody"
import {
  findFirstChannelOutputRow,
  previewHtmlFromChannelOutputRow,
} from "../../../features/tasks/utils/task-channel-output-preview"

type TaskOverviewContentPreviewProps = {
  taskId: number
  bootstrapTaskChannels?: unknown
  preferredChannelId: number | null
  onChannelChange: (channelId: number | null) => void
  onViewAll: () => void
  accessToken?: string | null
  active?: boolean
}

export function TaskOverviewContentPreview({
  taskId,
  bootstrapTaskChannels,
  preferredChannelId,
  onChannelChange,
  onViewAll,
  accessToken,
  active = true,
}: TaskOverviewContentPreviewProps) {
  const {
    channels,
    selectedChannelId,
    selectChannel,
    isLoading: isChannelsLoading,
    error: channelsError,
    retry: retryChannels,
  } = useTaskChannelList({
    taskId,
    bootstrapTaskChannels,
    skipInitialTaskChannelsFetch: true,
    preferredChannelId,
    onChannelChange,
    enabled: active,
  })

  const bootstrapQuery = useTaskChannelBootstrap(taskId, selectedChannelId, accessToken, {
    enabled: active && selectedChannelId != null,
  })

  const outputRow = useMemo(
    () => findFirstChannelOutputRow(bootstrapQuery.data?.composed_output),
    [bootstrapQuery.data?.composed_output],
  )

  const previewHtml = useMemo(
    () => (outputRow ? previewHtmlFromChannelOutputRow(outputRow) : ""),
    [outputRow],
  )

  const isLoading =
    isChannelsLoading || (selectedChannelId != null && bootstrapQuery.isLoading && !bootstrapQuery.data)
  const isError = !!channelsError || bootstrapQuery.isError
  const isEmpty = channels.length === 0 || (!isLoading && !previewHtml.trim())

  const handleRetry = () => {
    if (channelsError) retryChannels()
    else void bootstrapQuery.refetch()
  }

  return (
    <TaskOverviewPreviewSection
      title="Content"
      onViewAll={onViewAll}
      active={active}
      isLoading={isLoading}
      isError={isError}
      onRetry={handleRetry}
      isEmpty={isEmpty}
      emptyMessage={
        channels.length === 0
          ? "No channels yet. Add channels in the Content tab."
          : "No generated output for this channel yet."
      }
    >
      <div className="space-y-2">
        <TaskChannelPills
          channels={channels}
          selectedChannelId={selectedChannelId}
          onSelectChannel={selectChannel}
          readOnly
        />
        {outputRow?.title ? (
          <p className="text-xs font-medium text-gray-500">{outputRow.title}</p>
        ) : null}
        {previewHtml.trim() ? (
          <div className="max-h-32 overflow-hidden rounded-md border border-gray-100 bg-gray-50/50 p-2">
            <ComponentOutputReadonlyBody
              html={previewHtml}
              toolbarId={`overview-content-preview-${taskId}-${selectedChannelId ?? "none"}`}
              className="text-sm"
            />
          </div>
        ) : null}
      </div>
    </TaskOverviewPreviewSection>
  )
}
