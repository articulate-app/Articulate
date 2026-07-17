"use client"

import React from "react"
import { cn } from "@/lib/utils"
import type { TaskChannelRow } from "@/hooks/use-task-channel-list"

type TaskChannelPillsProps = {
  channels: TaskChannelRow[]
  selectedChannelId: number | null
  onSelectChannel: (channelId: number) => void
  /** Preview mode hides remove/add controls. */
  readOnly?: boolean
  className?: string
}

export function TaskChannelPills({
  channels,
  selectedChannelId,
  onSelectChannel,
  readOnly = false,
  className,
}: TaskChannelPillsProps) {
  if (channels.length === 0) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {channels.map((channel) => (
        <span
          key={channel.channel_id}
          role="button"
          tabIndex={0}
          onClick={() => onSelectChannel(channel.channel_id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onSelectChannel(channel.channel_id)
            }
          }}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-sm",
            selectedChannelId === channel.channel_id
              ? "bg-gray-100 text-gray-900"
              : "text-gray-500",
            readOnly && "cursor-pointer",
          )}
        >
          {channel.name}
        </span>
      ))}
    </div>
  )
}
