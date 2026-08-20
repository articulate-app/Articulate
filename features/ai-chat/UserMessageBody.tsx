"use client"

import React, { useMemo, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import type { AiContextTag } from "./composer-inline-editor"
import { chipDisplayText, chipTooltipText } from "./composer-inline-editor"
import { getMentionChipClassName } from "./mention-chip-styles"
import { ArtifactContextChip } from "./artifact-context-chip"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../app/components/ui/tooltip"
import {
  inferUserMessageSegments,
  parseUserMessageContentJson,
  synthesizePlainTextFromDisplayParts,
  type AiMessageSegment,
  type AiUserMessageSelectionPillPart,
} from "./ai-chat-user-message-content"
import { resolveUserMessageDisplayContent } from "./resolve-user-message-display-content"
import { AI_CHAT_USER_MESSAGE_CLASS } from "./ai-chat-message-format"
import { shouldCollapseUserMessage } from "./user-message-collapse"
import { buildNextUrlForEntityLink, isTasksShellPath } from "./app-entity-links"
import { shallowPushSearchParams } from "../../app/lib/tasks-shallow-nav"
import { useCenterPaneTabsStore } from "../../app/store/center-pane-tabs"
import { cn } from "../../app/lib/utils"
import { splitTextWithUrls } from "./split-text-with-urls"
import { htmlLooksRich, sanitizeChatComposerHtml, splitRichHtmlByMentionMarkers } from "./composer-paste"

export function UserMessageArtifactChips({
  contentJson,
  className,
}: {
  contentJson?: unknown
  className?: string
}) {
  const pills = parseUserMessageContentJson(contentJson).selection_pills ?? []
  const artifactPills = pills.filter((pill) => pill.entity_type === "artifact")
  if (artifactPills.length === 0) return null
  return (
    <div className={cn("flex w-fit max-w-full flex-wrap items-start justify-end gap-1.5", className)}>
      {artifactPills.map((pill, index) => (
        <span
          key={`artifact-${pill.artifact_id ?? index}`}
          className="min-w-0 max-w-full"
        >
          <UserSelectionPill pill={pill} />
        </span>
      ))}
    </div>
  )
}

export function UserMentionChip({ tag }: { tag: AiContextTag }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tooltip = chipTooltipText(tag)
  const artifactId =
    tag.type === "artifact"
      ? String(tag.artifactId ?? tag.id ?? "").trim()
      : ""
  const canOpenArtifact = tag.type === "artifact" && Boolean(artifactId)

  const openArtifact = () => {
    if (!canOpenArtifact) return
    useCenterPaneTabsStore.getState().upsertTab({
      kind: "artifact",
      id: artifactId,
    })
    const nextUrl = buildNextUrlForEntityLink({
      currentPathname: pathname,
      currentSearchParams: new URLSearchParams(searchParams.toString()),
      parsedLink: {
        type: "artifact",
        id: artifactId,
        version: tag.artifactVersionNumber ?? null,
      },
      fromAiChat: true,
    })
    if (!nextUrl) return
    if (isTasksShellPath(pathname)) {
      const queryStart = nextUrl.indexOf("?")
      const nextParams = new URLSearchParams(queryStart >= 0 ? nextUrl.slice(queryStart + 1) : "")
      shallowPushSearchParams(
        pathname.startsWith("/artifacts") ? "/" : pathname,
        nextParams,
        "ai-chat-mention-chip",
      )
      return
    }
    window.location.assign(nextUrl)
  }

  if (tag.type === "artifact") {
    const title = (tag.artifactTitle ?? tag.label).trim() || "Artifact"
    const subtitle =
      tag.artifactVersionNumber != null ? `Artifact · v${tag.artifactVersionNumber}` : "Artifact"
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex min-w-0 max-w-full align-middle" data-ai-history-tag="1">
              <ArtifactContextChip
                title={title}
                subtitle={subtitle}
                readOnly
                onClick={canOpenArtifact ? openArtifact : undefined}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const chip = (
    <span
      className={cn(getMentionChipClassName(tag))}
      data-ai-history-tag="1"
    >
      <span className="min-w-0 truncate whitespace-nowrap">{chipDisplayText(tag)}</span>
    </span>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-left">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function selectionPillClassName(pill: AiUserMessageSelectionPillPart): string {
  if (pill.entity_type === "component") {
    return getMentionChipClassName({ type: "task_component" })
  }
  return getMentionChipClassName({ type: "task" })
}

function UserSelectionPill({ pill }: { pill: AiUserMessageSelectionPillPart }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const label = (pill.selected_text || pill.label || "Selection").trim()
  const truncated = label.length > 72 ? `${label.slice(0, 69)}…` : label
  const tooltip = pill.tooltip?.trim() || pill.title || label
  const canNavigate =
    (pill.entity_type === "artifact" && Boolean(pill.artifact_id))
    || (pill.entity_type === "component" && Number.isFinite(Number(pill.task_id)))

  const navigate = () => {
    if (pill.entity_type === "artifact" && pill.artifact_id) {
      useCenterPaneTabsStore.getState().upsertTab({
        kind: "artifact",
        id: pill.artifact_id,
      })
      const nextUrl = buildNextUrlForEntityLink({
        currentPathname: pathname,
        currentSearchParams: new URLSearchParams(searchParams.toString()),
        parsedLink: {
          type: "artifact",
          id: pill.artifact_id,
          version: pill.artifact_version_number ?? null,
        },
        fromAiChat: true,
      })
      if (!nextUrl) return
      if (isTasksShellPath(pathname)) {
        const queryStart = nextUrl.indexOf("?")
        const nextParams = new URLSearchParams(queryStart >= 0 ? nextUrl.slice(queryStart + 1) : "")
        shallowPushSearchParams(
          pathname.startsWith("/artifacts") ? "/" : pathname,
          nextParams,
          "ai-chat-selection-pill",
        )
        return
      }
      window.location.assign(nextUrl)
      return
    }

    if (pill.entity_type === "component" && Number.isFinite(Number(pill.task_id))) {
      const nextUrl = buildNextUrlForEntityLink({
        currentPathname: pathname,
        currentSearchParams: new URLSearchParams(searchParams.toString()),
        parsedLink: { type: "task", id: Number(pill.task_id) },
        fromAiChat: true,
      })
      if (!nextUrl) return
      if (isTasksShellPath(pathname)) {
        const queryStart = nextUrl.indexOf("?")
        const nextParams = new URLSearchParams(queryStart >= 0 ? nextUrl.slice(queryStart + 1) : "")
        shallowPushSearchParams(pathname, nextParams, "ai-chat-selection-pill")
        return
      }
      window.location.assign(nextUrl)
    }
  }

  if (pill.entity_type === "artifact") {
    const title = (pill.title || pill.label || "Artifact").trim() || "Artifact"
    const subtitle =
      pill.tooltip?.trim()
      || (pill.selected_text?.trim() ? `${title} · selected text` : "Artifact")
    const displaySubtitle =
      subtitle === title
        ? "Artifact"
        : subtitle.startsWith(`${title} · `)
          ? subtitle.slice(title.length + 3)
          : subtitle
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex min-w-0 max-w-full align-middle" data-ai-history-selection-pill="1">
              <ArtifactContextChip
                title={title}
                subtitle={displaySubtitle}
                readOnly
                onClick={canNavigate ? navigate : undefined}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-left">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const chip = (
    <span
      className={[
        selectionPillClassName(pill),
        canNavigate ? "cursor-pointer hover:brightness-[0.98]" : "cursor-default",
      ].join(" ")}
      data-ai-history-selection-pill="1"
      role={canNavigate ? "button" : undefined}
      tabIndex={canNavigate ? 0 : undefined}
      onClick={canNavigate ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        navigate()
      } : undefined}
      onKeyDown={canNavigate ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        event.stopPropagation()
        navigate()
      } : undefined}
    >
      <span className="min-w-0 truncate whitespace-nowrap">{truncated}</span>
    </span>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs whitespace-pre-line text-left">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function LinkifiedPlainText({ text, segmentKey }: { text: string; segmentKey: string }) {
  const parts = splitTextWithUrls(text)
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, partIndex) => {
        if (part.type === "url") {
          return (
            <a
              key={`${segmentKey}-url-${partIndex}`}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-[#2563eb] hover:underline underline-offset-2"
              onClick={(event) => event.stopPropagation()}
            >
              {part.value}
            </a>
          )
        }
        return (
          <React.Fragment key={`${segmentKey}-text-${partIndex}`}>
            {part.value}
          </React.Fragment>
        )
      })}
    </span>
  )
}

function renderSegment(segment: AiMessageSegment, index: number) {
  if (segment.type === "mention") {
    return <UserMentionChip key={`mention-${index}`} tag={segment.tag} />
  }
  return <LinkifiedPlainText key={`text-${index}`} text={segment.text} segmentKey={`text-${index}`} />
}

function RichUserMessageHtml({
  html,
  mentionTags,
}: {
  html: string
  mentionTags: AiContextTag[]
}) {
  const sanitized = sanitizeChatComposerHtml(html)
  const parts = splitRichHtmlByMentionMarkers(sanitized)
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "mention") {
          const tag = mentionTags[part.index]
          return tag ? <UserMentionChip key={`rich-mention-${index}`} tag={tag} /> : null
        }
        return (
          <span
            key={`rich-html-${index}`}
            className="ai-chat-user-message-rich-chunk"
            dangerouslySetInnerHTML={{ __html: part.html }}
          />
        )
      })}
    </>
  )
}

export function UserMessageBody({
  content,
  contentJson,
  forceExpanded = false,
}: {
  content: string
  contentJson?: unknown
  /** Latest just-sent turn stays fully visible (scroll anchors it above the reply). */
  forceExpanded?: boolean
}) {
  const [isSelected, setIsSelected] = useState(false)
  const parsed = parseUserMessageContentJson(contentJson)
  const visibleContent = resolveUserMessageDisplayContent(content, contentJson)
  const segments = inferUserMessageSegments(visibleContent, parsed)
  const selectionPills = parsed.selection_pills ?? []
  const artifactPills = selectionPills.filter((pill) => pill.entity_type === "artifact")
  const inBubblePills = selectionPills.filter((pill) => pill.entity_type !== "artifact")
  const artifactPillIds = new Set(
    artifactPills
      .map((pill) => pill.artifact_id?.trim())
      .filter((id): id is string => Boolean(id)),
  )
  const mentionTagsForRichHtml = segments
    .filter((segment): segment is Extract<AiMessageSegment, { type: "mention" }> => segment.type === "mention")
    .map((segment) => segment.tag)
  const richHtml =
    parsed.html && htmlLooksRich(parsed.html)
      ? sanitizeChatComposerHtml(parsed.html)
      : null
  const visibleSegments =
    artifactPillIds.size === 0
      ? segments
      : segments.filter((segment) => {
          if (segment.type !== "mention" || segment.tag.type !== "artifact") return true
          const id = String(segment.tag.artifactId ?? segment.tag.id ?? "").trim()
          return !id || !artifactPillIds.has(id)
        })
  const collapseContent = parsed.display_parts?.length
    ? synthesizePlainTextFromDisplayParts(parsed.display_parts)
    : [
        ...selectionPills.map((pill) => pill.label),
        visibleContent,
      ].filter(Boolean).join(" ")
  const isLongMessage = !forceExpanded && shouldCollapseUserMessage(collapseContent)
  const isCollapsed = isLongMessage && !isSelected

  const bodyClassName = useMemo(
    () =>
      cn(
        AI_CHAT_USER_MESSAGE_CLASS,
        isCollapsed && "ai-chat-user-message--truncated",
      ),
    [isCollapsed],
  )

  return (
    <div
      className={cn(
        "w-fit max-w-full min-w-0 rounded-md outline-none transition-colors",
        isLongMessage && "cursor-pointer",
        isSelected && isLongMessage && "bg-muted/40 ring-1 ring-border/70",
      )}
      role={isLongMessage ? "button" : undefined}
      tabIndex={isLongMessage ? 0 : undefined}
      aria-expanded={isLongMessage ? isSelected : undefined}
      onClick={() => {
        if (!isLongMessage) return
        setIsSelected((prev) => !prev)
      }}
      onKeyDown={(event) => {
        if (!isLongMessage) return
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        setIsSelected((prev) => !prev)
      }}
    >
      {inBubblePills.length > 0 || visibleSegments.length > 0 || richHtml ? (
        <div className="flex w-fit max-w-full min-w-0 flex-col gap-1.5">
          {inBubblePills.length > 0 ? (
            <div className="flex max-w-full flex-wrap items-start gap-1.5">
              {inBubblePills.map((pill, index) => (
                <span
                  key={`selection-${pill.entity_type}-${pill.artifact_id ?? pill.component_id ?? index}`}
                  className="min-w-0 max-w-full"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <UserSelectionPill pill={pill} />
                </span>
              ))}
            </div>
          ) : null}
          {richHtml ? (
            <div className={cn(bodyClassName, "ai-chat-user-message--rich w-fit max-w-full")}>
              <RichUserMessageHtml html={richHtml} mentionTags={mentionTagsForRichHtml} />
            </div>
          ) : visibleSegments.length > 0 ? (
            <div className={cn(bodyClassName, "w-fit max-w-full")}>
              {visibleSegments.map((segment, index) => renderSegment(segment, index))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
