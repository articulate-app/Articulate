import {
  isTokenLimitExceededCode,
  isTokenLimitWouldExceedCode,
  resolveRunFailureMessage,
} from "./ai-chat-usage"

const BUILD_UNIT_FAILURE_MESSAGES: Record<string, string> = {
  component_revision_conflict:
    "This task had a newer edit, so the generated change was not saved.",
  provider_timeout: "The AI provider timed out while working on this task.",
  user_token_limit_exceeded: "You have reached your daily AI token limit.",
  team_token_limit_exceeded: "Your team has reached its daily AI token limit.",
  user_token_limit_would_be_exceeded:
    "This task would exceed your remaining daily AI token allowance.",
  team_token_limit_would_be_exceeded:
    "This task would exceed the team's remaining daily AI token allowance.",
}

/** Concise user-facing copy for build/unit failures. Never surfaces lease or provider raw dumps. */
export function resolveOrchestratedBuildErrorMessage(args: {
  code?: string | null
  backendMessage?: string | null
}): string {
  const code = args.code?.trim() ?? ""
  if (code && BUILD_UNIT_FAILURE_MESSAGES[code]) {
    return BUILD_UNIT_FAILURE_MESSAGES[code]
  }
  if (isTokenLimitExceededCode(code) || isTokenLimitWouldExceedCode(code)) {
    return resolveRunFailureMessage({ code, backendMessage: args.backendMessage })
  }
  if (code === "component_revision_conflict") {
    return BUILD_UNIT_FAILURE_MESSAGES.component_revision_conflict
  }
  const backendMessage = args.backendMessage?.trim()
  if (backendMessage && !looksLikeInternalErrorDump(backendMessage)) {
    return backendMessage
  }
  if (code) return `This task could not be completed (${code}).`
  return "This task could not be completed."
}

function looksLikeInternalErrorDump(message: string): boolean {
  return (
    /lease[_-]?token/i.test(message)
    || /reservation[_-]?id/i.test(message)
    || /stack trace/i.test(message)
    || /openai|anthropic|provider_request/i.test(message)
  )
}
