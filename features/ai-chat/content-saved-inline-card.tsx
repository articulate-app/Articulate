"use client"

import React from "react"
import { ExternalLink } from "lucide-react"
import type { AiChatContentSavedAction } from "../../app/lib/ai/chat"
import { buildNextUrlForEntityLink, isTasksShellPath, parseAppEntityLink } from "./app-entity-links"
import { shallowPushSearchParams } from "../../app/lib/tasks-shallow-nav"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export function ContentSavedInlineCard({ action }: { action: AiChatContentSavedAction }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const onOpenTask = () => {
    const parsed = parseAppEntityLink(action.task_link)
    if (!parsed) return
    const nextUrl = buildNextUrlForEntityLink({
      currentPathname: pathname,
      currentSearchParams: new URLSearchParams(searchParams.toString()),
      parsedLink: parsed,
      fromAiChat: true,
    })
    if (!nextUrl) return
    if (isTasksShellPath(pathname)) {
      const queryStart = nextUrl.indexOf("?")
      const nextParams = new URLSearchParams(queryStart >= 0 ? nextUrl.slice(queryStart + 1) : "")
      shallowPushSearchParams(pathname, nextParams, "ai-chat-content-saved-task-link")
      return
    }
    router.push(nextUrl, { scroll: false })
  }

  return (
    <div className="rounded-md border border-emerald-200/90 bg-emerald-50/80 px-3 py-2 text-sm shadow-sm">
      <div className="font-medium text-emerald-950">Saved to {action.component_title || "component"}</div>
      {action.preview_text ? (
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-emerald-900/90">{action.preview_text}</p>
      ) : null}
      <button
        type="button"
        onClick={onOpenTask}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-800 underline-offset-2 hover:text-emerald-950 hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        Open task
      </button>
    </div>
  )
}
