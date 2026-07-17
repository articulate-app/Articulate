"use client"

import React from "react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { getImageUrl } from "@/lib/public-media"

type TaskMentionCardProps = {
  mention?: any
  author?: any
  thread?: any
  isSelected?: boolean
  isReply?: boolean
  onReply?: () => void
  onDelete?: () => void
  onResolve?: () => void
  onClick?: () => void
  headerActions?: React.ReactNode
  actions?: React.ReactNode
  bodyClassName?: string
}

function getDisplayName(author: any): string {
  if (!author) return "User"
  return (
    author.full_name
    || author.displayName
    || author.name
    || author.email
    || (author.id != null ? `User #${author.id}` : "User")
  )
}

function getInitials(name: string): string {
  return String(name || "?")
    .split(" ")
    .map((part) => part?.[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function TaskMentionCard({
  mention,
  author,
  thread,
  isSelected = false,
  isReply = false,
  onReply,
  onDelete,
  onResolve,
  onClick,
  headerActions,
  actions,
  bodyClassName,
}: TaskMentionCardProps) {
  const resolvedAuthor = author ?? mention?.users ?? mention?.user ?? null
  const displayName = getDisplayName(resolvedAuthor)
  const photoUrl = getImageUrl(resolvedAuthor?.photo ?? resolvedAuthor?.avatar ?? null)
  const createdAt = mention?.created_at ?? mention?.createdAt ?? thread?.latest_activity_at ?? thread?.created_at ?? null
  const relativeTime = createdAt
    ? formatDistanceToNow(new Date(createdAt), { addSuffix: true })
    : null
  const body =
    mention?.comment
    ?? mention?.content
    ?? thread?.latest_preview
    ?? thread?.title
    ?? ""
  const isResolved = Boolean(thread?.is_resolved ?? thread?.resolved_at)

  const cardClasses = cn(
    "group w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-left transition-colors",
    "hover:bg-gray-50",
    isReply && "border-l-2 border-l-gray-300",
  )

  const content = (
    <>
      <div className="flex items-center gap-2">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full border border-gray-200 object-cover"
            title={displayName}
          />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-yellow-200 text-xs font-bold uppercase text-gray-900">
            {getInitials(displayName)}
          </div>
        )}
        <span className="truncate text-sm font-medium text-gray-900">{displayName}</span>
        {headerActions ? <div className="ml-1 shrink-0">{headerActions}</div> : null}
        {relativeTime ? (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{relativeTime}</span>
        ) : null}
      </div>

      {body ? (
        <div
          className={cn("mt-1 pl-9 text-sm text-gray-900", bodyClassName)}
          style={{ wordBreak: "break-word" }}
          dangerouslySetInnerHTML={{ __html: String(body) }}
        />
      ) : null}

      {onReply || onDelete || onResolve || actions ? (
        <div className="mt-2 flex items-center gap-2 pl-9">
          {onReply ? (
            <button
              type="button"
              className="text-xs text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onReply()
              }}
            >
              Reply
            </button>
          ) : null}
          {onResolve ? (
            <button
              type="button"
              className="text-xs text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onResolve()
              }}
            >
              {isResolved ? "Reopen" : "Resolve"}
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="text-xs text-red-600 underline-offset-2 hover:text-red-700 hover:underline"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDelete()
              }}
            >
              Delete
            </button>
          ) : null}
          {actions}
        </div>
      ) : null}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cardClasses}>
        {content}
      </button>
    )
  }

  return (
    <div className={cardClasses}>
      {content}
    </div>
  )
}

export default TaskMentionCard
