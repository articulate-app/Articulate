/**
 * Client-side driver for local browser publications.
 * Talks to the Articulate Browser Bridge on loopback + edge local-browser-agent.
 * Never sends website credentials to Articulate.
 */

"use client"

import {
  getBridgeBrowserState,
  isLocalBridgeReady,
  navigateBridgeSession,
  probeLocalBridge,
  requestLocalAgentStep,
  runBridgeBrowserAction,
  startBridgeSession,
  stopBridgeSession,
  type BridgeBrowserAction,
  type BridgeBrowserState,
  type BridgeHealth,
} from "./local-browser-bridge"
import {
  beginLocalBrowserAgentRun,
  isLocalBrowserAgentGenerationCurrent,
  LocalBrowserAgentCancelledError,
} from "./local-browser-agent-control"
import { getLocalBrowserAccessToken } from "./browser-helper-client"
import { invokeEdgeFunctionFetch } from "./edge-functions"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { PublicationRun } from "./publishing/types"

export type LocalBridgeClientStatus = {
  available: boolean
  chromeAvailable: boolean
  version: string | null
  health: BridgeHealth
}

export async function detectLocalBridgeStatus(): Promise<LocalBridgeClientStatus> {
  const health = await probeLocalBridge()
  const ready = isLocalBridgeReady(health)
  return {
    available: ready,
    chromeAvailable: health.chromeAvailable !== false && ready,
    version: typeof health.version === "string" ? health.version : null,
    health,
  }
}

function edgeUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured")
  return `${base.replace(/\/$/, "")}/functions/v1/agentic-publishing`
}

async function reportLocalPublication(
  body: Record<string, unknown>,
): Promise<PublicationRun> {
  const supabase = getSupabaseBrowser()
  const response = await invokeEdgeFunctionFetch({
    supabase,
    url: edgeUrl(),
    init: {
      method: "POST",
      body: JSON.stringify({ action: "report_local_publication", ...body }),
    },
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
    debugLabel: "agentic-publishing:report_local_publication",
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || `Local publication update failed (${response.status})`)
  }
  return payload.run as PublicationRun
}

export type LocalPublicationDriverCallbacks = {
  onStatus?: (message: string) => void
  onRun?: (run: PublicationRun) => void
  /** @deprecated Prefer controlGeneration from beginLocalBrowserAgentRun. */
  shouldPause?: () => boolean
  /**
   * Generation captured at agent start. When human bumps control, this no longer
   * matches and the driver drops the rest of the plan / LLM work.
   */
  controlGeneration?: number
  /** AbortSignal for the in-flight LLM request. */
  signal?: AbortSignal
}

async function sleepInterruptible(
  ms: number,
  isCancelled: () => boolean,
): Promise<void> {
  const total = Math.min(Math.max(ms, 0), 10_000)
  const slice = 50
  let left = total
  while (left > 0) {
    if (isCancelled()) throw new LocalBrowserAgentCancelledError()
    const wait = Math.min(slice, left)
    await new Promise((resolve) => setTimeout(resolve, wait))
    left -= wait
  }
}

export type LocalPublicationStartInput = {
  runId: string
  startUrl: string
  task: string
  profileId?: string | null
  destinationName?: string | null
  /** Resume an existing Bridge session instead of launching a new Chrome window. */
  bridgeSessionId?: string | null
  /** Known CMS entry URL — navigated deterministically before LLM steps. */
  entryUrl?: string | null
  maxSteps?: number
}

export type LocalAgentTimingSummary = {
  modelRoundTrips: number
  actionsExecuted: number
  totalMs: number
  stateCollectMs: number[]
  llmMs: number[]
  proxyMs: number[]
  bridgeActionMs: number[]
}

function sameUrlHostPath(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    return ua.origin === ub.origin && ua.pathname.replace(/\/$/, "") === ub.pathname.replace(/\/$/, "")
  } catch {
    return a === b
  }
}

/**
 * Launch (or resume) local Chrome via Bridge and run the semantic agent until a
 * terminal or human-attention status. Stops before irreversible publish when the
 * agent returns awaiting confirmation / needs_user.
 */
export async function runLocalPublicationDriver(
  input: LocalPublicationStartInput,
  callbacks: LocalPublicationDriverCallbacks = {},
): Promise<PublicationRun> {
  const bridge = await detectLocalBridgeStatus()
  if (!bridge.available) {
    throw new Error(
      bridge.health.error ||
        "Articulate Browser Helper is not installed or running.",
    )
  }

  let token: string
  try {
    token = await getLocalBrowserAccessToken()
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : "Connect the Articulate Browser Helper to continue.",
    )
  }

  const timing: LocalAgentTimingSummary = {
    modelRoundTrips: 0,
    actionsExecuted: 0,
    totalMs: 0,
    stateCollectMs: [],
    llmMs: [],
    proxyMs: [],
    bridgeActionMs: [],
  }
  const driverStarted = Date.now()

  let sessionId = input.bridgeSessionId?.trim() || ""
  if (!sessionId) {
    callbacks.onStatus?.("Starting local Chrome…")
    const started = await startBridgeSession(token, input.startUrl, {
      profileKey: input.profileId ? `dest_${input.profileId}` : null,
    })
    sessionId = started.session.id
  } else {
    callbacks.onStatus?.("Resuming local Chrome session…")
  }

  // Deterministic entry: navigate to known URL before any LLM round trip.
  const entryUrl = (input.entryUrl || input.startUrl || "").trim()
  if (entryUrl && /^https?:\/\//i.test(entryUrl) && entryUrl !== "about:blank") {
    try {
      const stateBefore = await getBridgeBrowserState(token, sessionId)
      if (!sameUrlHostPath(stateBefore.state.url, entryUrl)) {
        callbacks.onStatus?.("Opening destination entry point…")
        const tNav = Date.now()
        await navigateBridgeSession(token, sessionId, entryUrl)
        timing.bridgeActionMs.push(Date.now() - tNav)
        timing.actionsExecuted += 1
      }
    } catch {
      // Fall through to agent
    }
  }

  let run = await reportLocalPublication({
    run_id: input.runId,
    status: "running",
    bridge_session_id: sessionId,
    phase_message: "Browser running locally",
    activity_label: "Local browser opened",
    awaiting_destination_auth: false,
  })
  callbacks.onRun?.(run)

  const history: Array<{
    thought?: string
    action?: BridgeBrowserAction
    result?: string
  }> = []
  const maxSteps = input.maxSteps ?? 40

  // Fresh plan ownership for this driver invocation (Continue with agent / publish).
  const agentRun =
    callbacks.controlGeneration != null && callbacks.signal
      ? { generation: callbacks.controlGeneration, signal: callbacks.signal }
      : beginLocalBrowserAgentRun()
  const isCancelled = () =>
    Boolean(callbacks.shouldPause?.()) ||
    !isLocalBrowserAgentGenerationCurrent(agentRun.generation) ||
    agentRun.signal.aborted

  const reportHumanTakeover = async () => {
    timing.totalMs = Date.now() - driverStarted
    if (process.env.NODE_ENV === "development") {
      console.info("[local-agent] timing", { ...timing, cancelled: true })
    }
    run = await reportLocalPublication({
      run_id: input.runId,
      status: "needs_user",
      bridge_session_id: sessionId,
      phase_message: "Paused for human takeover in the local browser",
      user_has_control: true,
      activity_label: "Human takeover",
    })
    callbacks.onRun?.(run)
    callbacks.onStatus?.("You have control")
    return run
  }

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (isCancelled()) return await reportHumanTakeover()

      callbacks.onStatus?.(`Local agent step ${step + 1}…`)
      const tState = Date.now()
      const statePayload = await getBridgeBrowserState(token, sessionId)
      timing.stateCollectMs.push(Date.now() - tState)
      if (isCancelled()) return await reportHumanTakeover()
      const state: BridgeBrowserState = statePayload.state

      const tLlm = Date.now()
      let agent
      try {
        agent = await requestLocalAgentStep({
          task: input.task,
          state,
          history,
          step,
          entryUrl: entryUrl || null,
          signal: agentRun.signal,
        })
      } catch (error) {
        if (
          (error instanceof Error && error.name === "AbortError") ||
          error instanceof LocalBrowserAgentCancelledError ||
          isCancelled()
        ) {
          return await reportHumanTakeover()
        }
        throw error
      }
      if (isCancelled()) return await reportHumanTakeover()

      const llmWall = Date.now() - tLlm
      timing.modelRoundTrips += 1
      timing.llmMs.push(agent.diagnostics?.llmMs ?? llmWall)
      if (typeof agent.diagnostics?.proxyMs === "number") {
        timing.proxyMs.push(agent.diagnostics.proxyMs)
      }

      if (agent.status === "needs_user") {
        timing.totalMs = Date.now() - driverStarted
        if (process.env.NODE_ENV === "development") {
          console.info("[local-agent] timing", timing)
        }
        run = await reportLocalPublication({
          run_id: input.runId,
          status: "needs_user",
          bridge_session_id: sessionId,
          phase_message:
            agent.message ||
            `Sign in to ${input.destinationName || "the destination"} in the local browser if needed.`,
          awaiting_destination_auth: /sign\s*in|log\s*in|auth/i.test(agent.message || ""),
          user_has_control: true,
          agent_status: agent.status,
          thought: agent.thought,
          activity_label: "Waiting for user",
        })
        callbacks.onRun?.(run)
        callbacks.onStatus?.(agent.message || "Needs attention in local browser")
        return run
      }

      if (agent.status === "done") {
        timing.totalMs = Date.now() - driverStarted
        if (process.env.NODE_ENV === "development") {
          console.info("[local-agent] timing", timing)
        }
        const awaitingConfirm = /confirm|ready|review|do not (click )?publish|awaiting|prepared/i.test(
          `${agent.message} ${agent.thought}`,
        )
        const scheduledNative = /scheduled|schedule confirmed/i.test(
          `${agent.message} ${agent.thought}`,
        )
        run = await reportLocalPublication({
          run_id: input.runId,
          status: scheduledNative
            ? "scheduled"
            : awaitingConfirm
              ? "awaiting_publish_confirmation"
              : "published",
          bridge_session_id: sessionId,
          phase_message:
            agent.message ||
            (scheduledNative
              ? "Scheduled in destination"
              : awaitingConfirm
                ? "Ready for confirmation"
                : "Done"),
          agent_status: agent.status,
          thought: agent.thought,
          activity_label: scheduledNative
            ? "Scheduled"
            : awaitingConfirm
              ? "Ready for confirmation"
              : "Published",
          destination_connected: true,
          ...(scheduledNative ? { schedule_strategy: "external" } : {}),
        })
        callbacks.onRun?.(run)
        if (!awaitingConfirm || scheduledNative) {
          try {
            await stopBridgeSession(token, sessionId)
          } catch {
            // ignore
          }
        }
        return run
      }

      const plan =
        Array.isArray(agent.actions) && agent.actions.length > 0
          ? agent.actions
          : agent.action
            ? [agent.action]
            : []

      if (agent.status === "failed" || plan.length === 0) {
        timing.totalMs = Date.now() - driverStarted
        run = await reportLocalPublication({
          run_id: input.runId,
          status: "failed",
          bridge_session_id: sessionId,
          phase_message: agent.message || "Local publishing agent failed",
          error_code: "agent_failed",
          agent_status: agent.status,
          thought: agent.thought,
          activity_label: "Failed",
        })
        callbacks.onRun?.(run)
        try {
          await stopBridgeSession(token, sessionId)
        } catch {
          // ignore
        }
        return run
      }

      let urlBeforePlan = state.url
      for (let i = 0; i < plan.length; i += 1) {
        if (isCancelled()) return await reportHumanTakeover()
        const action = plan[i]!

        const tAct = Date.now()
        try {
          if (action.type === "wait") {
            await sleepInterruptible(action.ms ?? 500, isCancelled)
            timing.bridgeActionMs.push(Date.now() - tAct)
            timing.actionsExecuted += 1
            history.push({
              thought: i === 0 ? agent.thought : undefined,
              action,
              result: "ok (wait)",
            })
            continue
          }

          const actionResult = await runBridgeBrowserAction(token, sessionId, action)
          if (isCancelled()) return await reportHumanTakeover()
          timing.bridgeActionMs.push(Date.now() - tAct)
          timing.actionsExecuted += 1
          history.push({
            thought: i === 0 ? agent.thought : undefined,
            action,
            result: `ok @ ${actionResult.state.url}`,
          })

          const urlAfter = actionResult.state.url
          const navigated =
            action.type === "navigate" ||
            action.type === "back" ||
            action.type === "forward" ||
            action.type === "reload" ||
            (action.type === "click" && urlAfter !== urlBeforePlan)

          // Stop remaining plan actions after material navigation — re-ask model.
          if (navigated && i < plan.length - 1) {
            urlBeforePlan = urlAfter
            break
          }
          urlBeforePlan = urlAfter
        } catch (actionError) {
          if (
            actionError instanceof LocalBrowserAgentCancelledError ||
            isCancelled()
          ) {
            return await reportHumanTakeover()
          }
          timing.bridgeActionMs.push(Date.now() - tAct)
          history.push({
            thought: agent.thought,
            action,
            result: `failed: ${actionError instanceof Error ? actionError.message : String(actionError)}`,
          })
          break
        }
      }
    }

    timing.totalMs = Date.now() - driverStarted
    if (process.env.NODE_ENV === "development") {
      console.info("[local-agent] timing", timing)
    }

    run = await reportLocalPublication({
      run_id: input.runId,
      status: "needs_user",
      bridge_session_id: sessionId,
      phase_message: "Local agent reached the step limit. Take control in the browser to continue.",
      user_has_control: true,
      activity_label: "Needs attention",
    })
    callbacks.onRun?.(run)
    return run
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    run = await reportLocalPublication({
      run_id: input.runId,
      status: "failed",
      bridge_session_id: sessionId,
      phase_message: message,
      error_code: "agent_failed",
      activity_label: "Failed",
    })
    callbacks.onRun?.(run)
    try {
      await stopBridgeSession(token, sessionId)
    } catch {
      // ignore
    }
    throw error
  }
}

export async function stopLocalPublicationBrowser(bridgeSessionId: string): Promise<void> {
  if (!bridgeSessionId) return
  try {
    const token = await getLocalBrowserAccessToken()
    await stopBridgeSession(token, bridgeSessionId)
  } catch {
    // ignore
  }
}
