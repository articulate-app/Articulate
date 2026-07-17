"use client"

import React, { useMemo, useState } from "react"
import type { AiContextTag } from "./composer-inline-editor"
import { chipDisplayText, chipTooltipText } from "./composer-inline-editor"
import { getMentionChipClassName } from "./mention-chip-styles"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../app/components/ui/tooltip"
import {
  inferUserMessageSegments,
  parseUserMessageContentJson,
  synthesizePlainTextFromDisplayParts,
  type AiMessageSegment,
} from "./ai-chat-user-message-content"
import { resolveUserMessageDisplayContent } from "./resolve-user-message-display-content"
import { AI_CHAT_USER_MESSAGE_CLASS } from "./ai-chat-message-format"
import { shouldCollapseUserMessage } from "./user-message-collapse"

export function UserMentionChip({ tag }: { tag: AiContextTag }) {
  const tooltip = chipTooltipText(tag)
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={getMentionChipClassName(tag)} data-ai-history-tag="1">
            <span className="min-w-0 truncate whitespace-nowrap">{chipDisplayText(tag)}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-left">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function renderSegment(segment: AiMessageSegment, index: number) {
  if (segment.type === "mention") {
    return <UserMentionChip key={`mention-${index}`} tag={segment.tag} />
  }
  return (
    <span key={`text-${index}`} className="whitespace-pre-wrap">
      {segment.text}
    </span>
  )
}

export function UserMessageBody({
  content,
  contentJson,
}: {
  content: string
  contentJson?: unknown
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const parsed = parseUserMessageContentJson(contentJson)
  const visibleContent = resolveUserMessageDisplayContent(content, contentJson)
  const segments = inferUserMessageSegments(visibleContent, parsed)
  const collapseContent = parsed.display_parts?.length
    ? synthesizePlainTextFromDisplayParts(parsed.display_parts)
    : visibleContent
  const isLongMessage = shouldCollapseUserMessage(collapseContent)
  const isCollapsed = isLongMessage && !isExpanded

  const bodyClassName = useMemo(
    () =>
      [
        AI_CHAT_USER_MESSAGE_CLASS,
        "inline",
        isCollapsed ? "line-clamp-4" : "",
      ]
        .filter(Boolean)
        .join(" "),
    [isCollapsed],
  )

  return (
    <div className="min-w-0">
      <div className={bodyClassName}>
        {segments.map((segment, index) => renderSegment(segment, index))}
      </div>
      {isLongMessage ? (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="mt-1 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? "View less" : "View more"}
        </button>
      ) : null}
    </div>
  )
}
