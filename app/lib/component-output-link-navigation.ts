"use client"

import {
  buildNextUrlForEntityLink,
  isTasksShellPath,
  parseAppEntityLink,
} from "../../features/ai-chat/app-entity-links"
import { exportArtifactDownload } from "./services/artifacts"
import { useCenterPaneTabsStore } from "../store/center-pane-tabs"
import { shallowPushSearchParams } from "./tasks-shallow-nav"

export function navigateComponentOutputHref(args: {
  href: string
  pathname: string
  fromAiChat?: boolean
}): boolean {
  const href = args.href.trim()
  if (!href) return false

  const parsed = parseAppEntityLink(href)
  if (parsed) {
    if (parsed.type === "artifact-download") {
      void exportArtifactDownload({
        artifactId: parsed.id,
        versionNumber: parsed.version,
        format: parsed.format,
        attachmentId: parsed.attachmentId,
      })
      return true
    }
    if (parsed.type === "artifact") {
      useCenterPaneTabsStore.getState().upsertTab({
        kind: "artifact",
        id: parsed.id,
      })
    }
    const nextUrl = buildNextUrlForEntityLink({
      currentPathname: args.pathname,
      currentSearchParams: new URLSearchParams(window.location.search),
      parsedLink: parsed,
      fromAiChat: args.fromAiChat ?? false,
    })
    if (!nextUrl) return true
    if (isTasksShellPath(args.pathname)) {
      const queryStart = nextUrl.indexOf("?")
      const nextParams = new URLSearchParams(queryStart >= 0 ? nextUrl.slice(queryStart + 1) : "")
      shallowPushSearchParams(
        args.pathname.startsWith("/artifacts") ? "/" : args.pathname,
        nextParams,
        "component-output-link",
      )
      return true
    }
    window.location.assign(nextUrl)
    return true
  }

  if (/^https?:\/\//i.test(href)) {
    window.open(href, "_blank", "noopener,noreferrer")
    return true
  }

  return false
}

export function handleComponentOutputAnchorClick(args: {
  event: React.MouseEvent<HTMLElement>
  href: string | null | undefined
  pathname: string
  fromAiChat?: boolean
}): boolean {
  const href = args.href?.trim()
  if (!href) return false
  const handled = navigateComponentOutputHref({
    href,
    pathname: args.pathname,
    fromAiChat: args.fromAiChat,
  })
  if (!handled) return false
  args.event.preventDefault()
  args.event.stopPropagation()
  return true
}
