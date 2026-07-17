import type { AiRunTerminalKind, AiRunTerminalState } from "../../app/lib/ai/ai-chat-v2-types"

/** Exactly one terminal state wins — first explicit terminal is sticky. */
export function reduceRunTerminalState(
  prev: AiRunTerminalState | null,
  next: Partial<AiRunTerminalState> & { kind: AiRunTerminalKind },
): AiRunTerminalState {
  if (prev) return prev
  return {
    kind: next.kind,
    run_id: next.run_id ?? null,
    message_id: next.message_id ?? null,
    code: next.code ?? null,
    retryable: next.retryable ?? null,
    message: next.message ?? null,
  }
}

export function terminalStateFromV2Event(
  event:
    | { type: "message.completed"; run_id: string; message_id: string }
    | { type: "run.failed"; run_id: string; code: string; retryable: boolean; message: string }
    | { type: "run.cancelled"; run_id: string }
    | {
        type: "run.interrupted"
        run_id: string
        code?: string | null
        retryable?: boolean | null
        message?: string | null
      },
): AiRunTerminalState {
  if (event.type === "message.completed") {
    return {
      kind: "completed",
      run_id: event.run_id,
      message_id: event.message_id,
    }
  }
  if (event.type === "run.failed") {
    return {
      kind: "failed",
      run_id: event.run_id,
      code: event.code,
      retryable: event.retryable,
      message: event.message,
    }
  }
  if (event.type === "run.interrupted") {
    return {
      kind: "interrupted",
      run_id: event.run_id,
      code: event.code ?? null,
      retryable: event.retryable ?? null,
      message: event.message ?? null,
    }
  }
  return {
    kind: "cancelled",
    run_id: event.run_id,
  }
}

export function isRunTerminalState(
  state: AiRunTerminalState | null | undefined,
): state is AiRunTerminalState {
  return state != null
}

export function shouldFinalizeV2Run(args: {
  runId: string | null
  terminal: AiRunTerminalState | null
}): boolean {
  if (!args.runId) return false
  return isRunTerminalState(args.terminal)
}

export function shouldUseLegacyStreamCompletion(args: {
  runId: string | null
  terminal: AiRunTerminalState | null
}): boolean {
  return !args.runId || !isRunTerminalState(args.terminal)
}
