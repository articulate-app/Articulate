/**
 * Client executor for an Articulate Desktop publication run.
 *
 * The Edge Function owns orchestration, source snapshots, and run state. This
 * driver only observes and acts on the same Electron WebContentsView the user
 * sees, then reports transitions back to that existing publication run.
 */

"use client"

import {
  desktopBeginAgent,
  desktopExecuteAction,
  desktopObserve,
  isDesktopBrowserProviderAvailable,
} from "./desktop-browser-provider"
import { getArticulateDesktop } from "./articulate-desktop"
import { requestPublicationReasonStep, reportDesktopPublication } from "./services/agentic-publishing"
import type { PublicationRun, PublicationRunStatus } from "./publishing/types"

type DesktopObservation = {
  url: string
  title: string
  isLoading: boolean
  controlOwner: "agent" | "human"
  agentGeneration: number
  pageTextPreview: string
  elements: Array<{
    index: number
    tag: string
    role: string | null
    name: string | null
    text: string | null
    href: string | null
    x: number
    y: number
    width: number
    height: number
  }>
}

type ClientAgentAction =
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "click"; index: number }
  | { type: "type"; index: number; text: string; submit?: boolean }
  | { type: "scroll"; direction: "up" | "down"; amount?: number }
  | { type: "wait"; ms?: number }

type AgentStep = {
  thought: string
  status: "continue" | "needs_user" | "done" | "failed"
  action: ClientAgentAction | null
  actions?: ClientAgentAction[]
  message: string
  publication_phase?: PublicationRunStatus | null
  external_url?: string | null
  external_id?: string | null
  schedule_strategy?: "external" | "internal" | null
}

export type DesktopPublicationExecutionOperation =
  | "prepare_publication"
  | "continue_publication"
  | "confirm_publication"

export type RunDesktopPublicationDriverInput = {
  run: PublicationRun
  browserId: string
  /** The task is frozen by the backend when the run is created or resumed. */
  task: string
  startUrl: string
  operation: DesktopPublicationExecutionOperation
  maxSteps?: number
  onRun?: (run: PublicationRun) => void
  onStatus?: (message: string) => void
}

/** Deterministic browser identity so a chat card and the Browser tab share one WebContentsView. */
export function desktopBrowserIdForPublication(runId: string): string {
  return `desktop-publication-${runId}`
}

function asObservation(value: unknown): DesktopObservation {
  const row = value as Partial<DesktopObservation>
  return {
    url: typeof row.url === "string" ? row.url : "",
    title: typeof row.title === "string" ? row.title : "",
    isLoading: row.isLoading === true,
    controlOwner: row.controlOwner === "agent" ? "agent" : "human",
    agentGeneration: Number(row.agentGeneration ?? 0),
    pageTextPreview: typeof row.pageTextPreview === "string" ? row.pageTextPreview : "",
    elements: Array.isArray(row.elements) ? row.elements : [],
  }
}

function operationFromRun(run: PublicationRun): DesktopPublicationExecutionOperation {
  const operation = run.metadata?.client_execution?.operation
  if (operation === "confirm_publication") return "confirm_publication"
  if (operation === "continue_publication") return "continue_publication"
  return "prepare_publication"
}

function safePublicationPhase(
  phase: unknown,
  operation: DesktopPublicationExecutionOperation,
): PublicationRunStatus {
  const valid: PublicationRunStatus[] = [
    "needs_user",
    "awaiting_publish_confirmation",
    "scheduled",
    "published",
    "failed",
    "uncertain",
  ]
  if (typeof phase === "string" && valid.includes(phase as PublicationRunStatus)) {
    return phase as PublicationRunStatus
  }
  // Failing closed prevents a preparation run from being treated as published
  // when the reasoning service returns an incomplete result.
  return operation === "confirm_publication" ? "uncertain" : "awaiting_publish_confirmation"
}

async function executeAction(args: {
  browserId: string
  generation: number
  action: ClientAgentAction
  observation: DesktopObservation
}): Promise<{ ok: boolean; dropped?: boolean; reason?: string }> {
  const elementIndex =
    args.action.type === "click" || args.action.type === "type"
      ? args.action.index
      : null
  const element =
    elementIndex == null
      ? null
      : args.observation.elements.find((candidate) => candidate.index === elementIndex)

  if (args.action.type === "click") {
    if (!element) return { ok: false, reason: "element_not_found" }
    return desktopExecuteAction(args.browserId, args.generation, {
      type: "click",
      x: element.x,
      y: element.y,
    })
  }

  if (args.action.type === "type") {
    if (!element) return { ok: false, reason: "element_not_found" }
    const focus = await desktopExecuteAction(args.browserId, args.generation, {
      type: "click",
      x: element.x,
      y: element.y,
    })
    if (!focus.ok || focus.dropped) return focus
    const typed = await desktopExecuteAction(args.browserId, args.generation, {
      type: "type",
      text: args.action.text,
      clear: true,
    })
    if (!typed.ok || typed.dropped || !args.action.submit) return typed
    return desktopExecuteAction(args.browserId, args.generation, {
      type: "press_key",
      key: "Enter",
    })
  }

  if (args.action.type === "scroll") {
    const amount = Math.min(Math.max(Number(args.action.amount ?? 600), 100), 1600)
    return desktopExecuteAction(args.browserId, args.generation, {
      type: "scroll",
      x: 0,
      y: 0,
      deltaY: args.action.direction === "up" ? -amount : amount,
    })
  }

  if (args.action.type === "wait") {
    return desktopExecuteAction(args.browserId, args.generation, {
      type: "wait",
      ms: Math.min(Math.max(Number(args.action.ms ?? 500), 100), 5000),
    })
  }

  return desktopExecuteAction(args.browserId, args.generation, args.action)
}

/**
 * Runs a short, preemptible browser-agent loop on native Electron. It never
 * starts Browser Use Cloud or LocalBridge, and never reconstructs source data.
 */
export async function runDesktopPublicationDriver(
  input: RunDesktopPublicationDriverInput,
): Promise<PublicationRun> {
  if (!isDesktopBrowserProviderAvailable()) {
    throw new Error("Articulate Desktop browser control is unavailable.")
  }
  const desktop = getArticulateDesktop()
  if (!desktop) throw new Error("Articulate Desktop bridge is unavailable.")

  const startUrl = input.startUrl || "https://www.google.com/"
  const existing = await desktop.browser.getState(input.browserId)
  if (!existing) {
    await desktop.browser.create({ id: input.browserId, url: startUrl })
  } else {
    await desktop.browser.show(input.browserId)
  }

  const report = async (args: Omit<Parameters<typeof reportDesktopPublication>[0], "runId" | "desktopBrowserId">) => {
    const next = await reportDesktopPublication({
      runId: input.run.id,
      desktopBrowserId: input.browserId,
      executionOperation: input.operation,
      ...args,
    })
    input.onRun?.(next)
    return next
  }

  // A disconnected destination still needs the same native browser opened
  // automatically, but human credentials must never be entered by the agent.
  if (input.run.metadata?.awaiting_destination_auth) {
    input.onStatus?.("Waiting for sign-in in the Desktop browser…")
    return report({
      status: "needs_user",
      phaseMessage:
        input.run.metadata?.phase_message || "Sign in in the Articulate Desktop browser to continue.",
      activityLabel: "Waiting for user",
      awaitingDestinationAuth: true,
      userHasControl: true,
    })
  }

  let run = await report({
    status: "running",
    phaseMessage: "Preparing publication in Articulate Desktop",
    activityLabel: input.operation === "confirm_publication" ? "Publishing" : "Preparing publication",
  })
  const control = await desktopBeginAgent()
  const history: Array<{ thought?: string; action?: ClientAgentAction; result?: string }> = []
  const maxSteps = input.maxSteps ?? 40

  const reportHumanTakeover = async () => {
    input.onStatus?.("You have control in the Desktop browser.")
    run = await report({
      status: "needs_user",
      phaseMessage: "Paused for human takeover in the Articulate Desktop browser.",
      activityLabel: "Human takeover",
      userHasControl: true,
    })
    return run
  }

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      const observation = asObservation(await desktopObserve(input.browserId))
      if (observation.controlOwner !== "agent" || observation.agentGeneration !== control.generation) {
        return await reportHumanTakeover()
      }
      input.onStatus?.(`Preparing publication… (${step + 1})`)
      // The shared reasoning endpoint receives only the observed page surface
      // and frozen backend task; it has no direct browser/CDP access.
      const agent = (await requestPublicationReasonStep({
        task: input.task,
        state: {
          url: observation.url,
          title: observation.title,
          note: observation.pageTextPreview,
          elements: observation.elements.map((element) => ({
            index: element.index,
            tag: element.tag,
            role: element.role ?? "",
            type: "",
            text: element.text ?? "",
            name: element.name ?? "",
            href: element.href ?? "",
          })),
        },
        history,
        step,
        entryUrl: input.operation === "prepare_publication" ? input.startUrl : null,
        allowFinalPublish: input.operation === "confirm_publication",
      })) as AgentStep

      const afterReasoning = asObservation(await desktopObserve(input.browserId))
      if (afterReasoning.controlOwner !== "agent" || afterReasoning.agentGeneration !== control.generation) {
        return await reportHumanTakeover()
      }

      if (agent.status === "needs_user") {
        const auth = /sign\s*in|log\s*in|password|mfa|2fa|captcha/i.test(agent.message || "")
        return await report({
          status: "needs_user",
          phaseMessage: agent.message || "Action needed in the Desktop browser.",
          activityLabel: "Waiting for user",
          awaitingDestinationAuth: auth,
          userHasControl: true,
          agentStatus: agent.status,
          thought: agent.thought,
        })
      }

      if (agent.status === "done") {
        const phase = safePublicationPhase(agent.publication_phase, input.operation)
        return await report({
          status: phase,
          phaseMessage: agent.message || "Publication step completed.",
          activityLabel:
            phase === "awaiting_publish_confirmation"
              ? "Ready for confirmation"
              : phase === "scheduled"
                ? "Scheduled"
                : phase === "published"
                  ? "Published"
                  : phase === "uncertain"
                    ? "Verification needed"
                    : "Completed",
          userHasControl: phase === "needs_user" || phase === "awaiting_publish_confirmation",
          agentStatus: agent.status,
          thought: agent.thought,
          externalUrl: agent.external_url ?? null,
          externalId: agent.external_id ?? null,
          scheduleStrategy: agent.schedule_strategy ?? null,
          destinationConnected: phase !== "needs_user",
        })
      }

      const plan = Array.isArray(agent.actions) && agent.actions.length > 0
        ? agent.actions
        : agent.action
          ? [agent.action]
          : []
      if (agent.status === "failed" || plan.length === 0) {
        return await report({
          status: "failed",
          phaseMessage: agent.message || "Desktop publishing agent could not continue.",
          activityLabel: "Failed",
          errorCode: "agent_failed",
          agentStatus: agent.status,
          thought: agent.thought,
        })
      }

      let currentObservation = afterReasoning
      for (const action of plan) {
        const result = await executeAction({
          browserId: input.browserId,
          generation: control.generation,
          action,
          observation: currentObservation,
        })
        if (result.dropped) return await reportHumanTakeover()
        history.push({
          thought: history.length === 0 ? agent.thought : undefined,
          action,
          result: result.ok ? "ok" : `failed: ${result.reason || "action_failed"}`,
        })
        if (!result.ok) break
        const nextObservation = asObservation(await desktopObserve(input.browserId))
        if (nextObservation.controlOwner !== "agent" || nextObservation.agentGeneration !== control.generation) {
          return await reportHumanTakeover()
        }
        currentObservation = nextObservation
        if (["navigate", "back", "forward", "reload"].includes(action.type)) break
      }
    }

    return await report({
      status: "needs_user",
      phaseMessage: "The publication needs attention in the Desktop browser.",
      activityLabel: "Needs attention",
      userHasControl: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Desktop publishing agent failed."
    return report({
      status: "failed",
      phaseMessage: message,
      activityLabel: "Failed",
      errorCode: "agent_failed",
      errorMessage: message,
    })
  }
}

export function desktopPublicationOperationForRun(
  run: PublicationRun,
): DesktopPublicationExecutionOperation {
  return operationFromRun(run)
}
