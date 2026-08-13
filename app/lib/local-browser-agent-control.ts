/**
 * Shared generation / AbortController for Local Browser agent plans.
 * Any human interaction bumps the generation so in-flight plans and LLM
 * requests are dropped immediately (not merely "paused").
 */

let controlGeneration = 0
let activeAbort: AbortController | null = null

/** Current control generation (monotonic). */
export function getLocalBrowserControlGeneration(): number {
  return controlGeneration
}

/**
 * Human took over the embedded browser. Cancels any in-flight agent LLM
 * request and invalidates all pending plan actions for the previous generation.
 */
export function bumpLocalBrowserHumanControl(): number {
  controlGeneration += 1
  if (activeAbort) {
    try {
      activeAbort.abort()
    } catch {
      // ignore
    }
    activeAbort = null
  }
  return controlGeneration
}

/**
 * Start a new agent run (e.g. Continue with agent). Captures a fresh generation
 * and AbortSignal. Does not reuse a previous plan.
 */
export function beginLocalBrowserAgentRun(): {
  generation: number
  signal: AbortSignal
} {
  controlGeneration += 1
  if (activeAbort) {
    try {
      activeAbort.abort()
    } catch {
      // ignore
    }
  }
  activeAbort = new AbortController()
  return {
    generation: controlGeneration,
    signal: activeAbort.signal,
  }
}

export function isLocalBrowserAgentGenerationCurrent(generation: number): boolean {
  return generation === controlGeneration
}

export class LocalBrowserAgentCancelledError extends Error {
  readonly code = "local_browser_agent_cancelled"
  constructor(message = "Local browser agent cancelled by human control") {
    super(message)
    this.name = "LocalBrowserAgentCancelledError"
  }
}
