"use client"

import { getArticulateDesktop } from "../../app/lib/articulate-desktop"
import { useRightPaneTabsStore } from "../../app/store/right-pane-tabs"
import { findReusableAiBrowserTab } from "../ai-chat/resolve-ai-browser-session"
import type { AiBrowserDiscovery } from "../ai-chat/discover-ai-browser"
import { rememberAiBrowserObservation } from "../ai-chat/ai-browser-observation-store"

type DesktopObservation = {
  url?: string
  title?: string
  canGoBack?: boolean
  canGoForward?: boolean
  elements?: Array<{
    index: number
    tag: string
    role: string | null
    name: string | null
    text: string | null
    href: string | null
    x?: number
    y?: number
  }>
  pageTextPreview?: string
}

function observationSummary(observation: DesktopObservation | null) {
  if (!observation) return null
  const links: Array<{ text: string; href: string; verified: true }> = []
  const seen = new Set<string>()
  for (const el of observation.elements ?? []) {
    const href = typeof el.href === "string" ? el.href.trim() : ""
    if (!href || seen.has(href)) continue
    seen.add(href)
    links.push({ text: el.text ?? "", href, verified: true })
  }
  return {
    url: observation.url ?? "",
    title: observation.title ?? "",
    links,
    text: observation.pageTextPreview ?? "",
    elements: observation.elements ?? [],
    can_go_back: observation.canGoBack ?? false,
    can_go_forward: observation.canGoForward ?? false,
  }
}

/**
 * Apply a server-issued Desktop browser command to the existing AI browser tab.
 * Returns false when the native view is not ready yet (caller should retry).
 */
export async function applyAiDesktopBrowserCommand(
  item: AiBrowserDiscovery,
): Promise<boolean> {
  const cmd = item.desktopCommand
  if (!cmd) return true
  if (cmd.command === "instruct") return true

  const desktop = getArticulateDesktop()
  if (!desktop) return true

  const tab = findReusableAiBrowserTab(useRightPaneTabsStore.getState().tabs, {
    browserSessionId: item.browserSessionId,
    browserId: item.browserId ?? cmd.browserId,
  })
  const id = tab?.browser?.browserId || tab?.id || cmd.browserId || item.browserId
  if (!id) return false
  if (tab?.browser?.phase === "provisioning") {
    const existing = desktop.browser.getState ? await desktop.browser.getState(id) : null
    if (!existing) return false
  }

  try {
    if (cmd.command === "navigate") {
      if (!cmd.url) return true
      await desktop.browser.navigate(id, cmd.url)
    } else if (cmd.command === "back") {
      await desktop.browser.back(id)
    } else if (cmd.command === "forward") {
      await desktop.browser.forward(id)
    } else if (cmd.command === "reload") {
      await desktop.browser.reload(id)
    } else if (cmd.command === "close") {
      await desktop.browser.close(id)
    } else if (
      cmd.command === "click"
      || cmd.command === "type"
      || cmd.command === "press"
      || cmd.command === "scroll"
      || cmd.command === "wait"
      || cmd.command === "snapshot"
      || cmd.command === "get_links"
      || cmd.command === "get_text"
      || cmd.command === "extract"
      || cmd.command === "status"
      || cmd.command === "verify_url"
    ) {
      if (cmd.command === "verify_url" && cmd.url) {
        await desktop.browser.navigate(id, cmd.url)
      }
      const control = desktop.browser.beginAgent ? await desktop.browser.beginAgent() : null
      const generation = control?.agentGeneration ?? 0
      if (desktop.browser.agentAction && cmd.command !== "snapshot" && cmd.command !== "get_links" && cmd.command !== "get_text" && cmd.command !== "extract" && cmd.command !== "status") {
        const action =
          cmd.command === "click"
            ? cmd.selector
              ? { type: "focus", selector: cmd.selector }
              : { type: "click", x: 0, y: 0 }
            : cmd.command === "type"
              ? { type: "type", text: cmd.text ?? "", clear: cmd.clear }
              : cmd.command === "press"
                ? { type: "press_key", key: cmd.key ?? "Enter" }
                : cmd.command === "scroll"
                  ? { type: "scroll", deltaX: cmd.deltaX ?? 0, deltaY: cmd.deltaY ?? 600 }
                  : cmd.command === "wait"
                    ? { type: "wait", ms: cmd.ms ?? 400 }
                    : null
        if (action && cmd.command === "click" && (cmd.selector || cmd.text || cmd.index != null) && desktop.browser.observe) {
          const before = (await desktop.browser.observe(id)) as DesktopObservation
          const match =
            (cmd.selector
              ? before.elements?.find((el) => el.name === cmd.selector || el.tag === cmd.selector)
              : null)
            || (cmd.index != null ? before.elements?.[cmd.index] : null)
            || (cmd.text
              ? before.elements?.find((el) => (el.text ?? "").toLowerCase().includes(cmd.text!.toLowerCase()))
              : null)
          if (match) {
            await desktop.browser.agentAction(id, generation, {
              type: "click",
              x: match.x ?? 0,
              y: match.y ?? 0,
            })
          } else if (cmd.selector) {
            await desktop.browser.agentAction(id, generation, { type: "focus", selector: cmd.selector })
          }
        } else if (action) {
          await desktop.browser.agentAction(id, generation, action)
        }
      }
    } else {
      return true
    }

    if (desktop.browser.observe) {
      const observation = (await desktop.browser.observe(id)) as DesktopObservation
      const summary = observationSummary(observation)
      if (summary) {
        rememberAiBrowserObservation({
          browserSessionId: item.browserSessionId,
          browserId: id,
          ...summary,
        })
        if (tab) {
          useRightPaneTabsStore.getState().updateTab(tab.key, {
            browser: {
              ...tab.browser,
              currentUrl: summary.url || cmd.url || tab.browser?.currentUrl,
            },
          })
        }
      }
    } else if (tab && cmd.url) {
      useRightPaneTabsStore.getState().updateTab(tab.key, {
        browser: {
          ...tab.browser,
          currentUrl: cmd.url,
        },
      })
    }
    return true
  } catch {
    return false
  }
}
