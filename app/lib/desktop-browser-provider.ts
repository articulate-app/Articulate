/**
 * Client-side DesktopBrowserProvider helpers.
 * Talks to Electron main via window.articulateDesktop — never exposes CDP/debugger.
 */

"use client"

import { getArticulateDesktop, isArticulateDesktopAvailable } from "./articulate-desktop"
import {
  beginDesktopBrowserAgentRun,
  bumpDesktopBrowserHumanControl,
  isDesktopBrowserAgentGenerationCurrent,
} from "./desktop-browser-agent-control"

export type DesktopAgentAction = {
  type: string
  [key: string]: unknown
}

export function isDesktopBrowserProviderAvailable(): boolean {
  return isArticulateDesktopAvailable()
}

export async function desktopObserve(browserId: string) {
  const desktop = getArticulateDesktop()
  if (!desktop?.browser.observe) throw new Error("Desktop observe API unavailable")
  return desktop.browser.observe(browserId)
}

export async function desktopBeginAgent() {
  const desktop = getArticulateDesktop()
  if (!desktop?.browser.beginAgent) {
    return beginDesktopBrowserAgentRun()
  }
  const control = await desktop.browser.beginAgent()
  // Keep renderer epoch in sync with main.
  beginDesktopBrowserAgentRun()
  return {
    generation: control.agentGeneration,
    controlOwner: control.controlOwner,
  }
}

export async function desktopExecuteAction(
  browserId: string,
  generation: number,
  action: DesktopAgentAction,
) {
  const desktop = getArticulateDesktop()
  if (!desktop?.browser.agentAction) throw new Error("Desktop agentAction API unavailable")
  if (!isDesktopBrowserAgentGenerationCurrent(generation)) {
    return { ok: false, dropped: true, reason: "stale_generation" as const }
  }
  return desktop.browser.agentAction(browserId, generation, action)
}

export async function desktopBumpHuman() {
  bumpDesktopBrowserHumanControl()
  const desktop = getArticulateDesktop()
  if (desktop?.browser.bumpHuman) {
    return desktop.browser.bumpHuman()
  }
  return { controlOwner: "human" as const, agentGeneration: bumpDesktopBrowserHumanControl() }
}

/**
 * Execute a short action plan against the same WebContents the human sees.
 * Stops on failure, stale generation, or human preemption.
 */
export async function desktopExecutePlan(args: {
  browserId: string
  generation: number
  actions: DesktopAgentAction[]
  onStep?: (index: number, action: DesktopAgentAction, result: { ok: boolean; dropped?: boolean }) => void
}): Promise<{ completed: boolean; stoppedAt: number; reason?: string }> {
  for (let i = 0; i < args.actions.length; i++) {
    if (!isDesktopBrowserAgentGenerationCurrent(args.generation)) {
      return { completed: false, stoppedAt: i, reason: "human_preempted" }
    }
    const action = args.actions[i]!
    const result = await desktopExecuteAction(args.browserId, args.generation, action)
    args.onStep?.(i, action, result)
    if (result.dropped) {
      return { completed: false, stoppedAt: i, reason: "stale_generation" }
    }
    if (!result.ok) {
      return { completed: false, stoppedAt: i, reason: result.reason || "action_failed" }
    }
  }
  return { completed: true, stoppedAt: args.actions.length }
}
