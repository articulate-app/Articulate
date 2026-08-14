/**
 * Desktop browser agent control epoch (human preemption).
 * Same semantics as the former local-browser agent control — generation bumps
 * invalidate in-flight agent plans immediately.
 */

let controlGeneration = 0
let activeAbort: AbortController | null = null

export function getDesktopBrowserControlGeneration(): number {
  return controlGeneration
}

/** @deprecated Alias — Local Bridge is disconnected; use getDesktopBrowserControlGeneration. */
export const getLocalBrowserControlGeneration = getDesktopBrowserControlGeneration

export function bumpDesktopBrowserHumanControl(): number {
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

/** @deprecated Alias for bumpDesktopBrowserHumanControl. */
export const bumpLocalBrowserHumanControl = bumpDesktopBrowserHumanControl

export function beginDesktopBrowserAgentRun(): {
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

/** @deprecated Alias for beginDesktopBrowserAgentRun. */
export const beginLocalBrowserAgentRun = beginDesktopBrowserAgentRun

export function isDesktopBrowserAgentGenerationCurrent(generation: number): boolean {
  return generation === controlGeneration
}

/** @deprecated Alias for isDesktopBrowserAgentGenerationCurrent. */
export const isLocalBrowserAgentGenerationCurrent = isDesktopBrowserAgentGenerationCurrent

export class DesktopBrowserAgentCancelledError extends Error {
  readonly code = "desktop_browser_agent_cancelled"
  constructor(message = "Desktop browser agent cancelled by human control") {
    super(message)
    this.name = "DesktopBrowserAgentCancelledError"
  }
}

/** @deprecated Alias for DesktopBrowserAgentCancelledError. */
export const LocalBrowserAgentCancelledError = DesktopBrowserAgentCancelledError
