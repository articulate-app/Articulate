import {
  findReusableAiBrowserTab,
  type RightPaneTab,
} from "../../app/store/right-pane-tabs"
import type { AiBrowserDiscovery } from "./discover-ai-browser"

export { findReusableAiBrowserTab }

function emptyDesktopCommand(
  command: string,
  args: {
    url?: string | null
    browserId?: string | null
    browserSessionId?: string | null
  },
): NonNullable<AiBrowserDiscovery["desktopCommand"]> {
  return {
    command,
    url: args.url ?? null,
    instruction: null,
    selector: null,
    text: null,
    index: null,
    key: null,
    clear: false,
    deltaX: null,
    deltaY: null,
    ms: null,
    browserId: args.browserId ?? null,
    browserSessionId: args.browserSessionId ?? null,
    expectObservation: true,
  }
}

/**
 * Collapse a newly discovered open_browser onto the thread's live AI session
 * so later navigations reuse the same desktop page instead of a second tab.
 */
export function canonicalizeAiBrowserDiscovery(
  item: AiBrowserDiscovery,
  tabs: RightPaneTab[],
  args: { threadId?: string | null } = {},
): AiBrowserDiscovery {
  const reusable = findReusableAiBrowserTab(tabs, {
    browserSessionId: item.browserSessionId,
    browserId: item.browserId,
    threadId: args.threadId,
  })
  if (!reusable) {
    return { ...item, openBrowserTab: false }
  }

  const sessionId = reusable.browser?.aiOperationId || item.browserSessionId
  const browserId = reusable.browser?.browserId || reusable.id || item.browserId
  const isReuse = sessionId !== item.browserSessionId
  const nextUrl = item.desktopCommand?.url || item.currentUrl || item.startUrl
  const existingUrl = reusable.browser?.currentUrl ?? null
  const needsNavigate =
    isReuse
    && Boolean(nextUrl)
    && nextUrl !== existingUrl
    && !item.desktopCommand

  return {
    ...item,
    browserSessionId: sessionId,
    browserId,
    openBrowserTab: false,
    desktopCommand: item.desktopCommand
      ? {
          ...item.desktopCommand,
          browserId: item.desktopCommand.browserId || browserId,
          browserSessionId: item.desktopCommand.browserSessionId || sessionId,
        }
      : needsNavigate
        ? emptyDesktopCommand("navigate", {
            url: nextUrl,
            browserId,
            browserSessionId: sessionId,
          })
        : item.desktopCommand,
  }
}
