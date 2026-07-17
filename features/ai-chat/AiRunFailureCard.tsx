"use client"

import React from "react"
import type { AiRunTerminalState } from "../../app/lib/ai/ai-chat-v2-types"
import {
  resolveRunFailureMessage,
  shouldOfferRunFailureReconcile,
  shouldOfferRunFailureRetry,
} from "./ai-chat-usage"

type AiRunFailureCardProps = {
  terminalState: AiRunTerminalState
  onRetry?: () => void
  onReconcile?: () => void
}

export function AiRunFailureCard({
  terminalState,
  onRetry,
  onReconcile,
}: AiRunFailureCardProps) {
  if (terminalState.kind !== "failed" && terminalState.kind !== "interrupted") {
    return null
  }

  const title =
    terminalState.kind === "interrupted"
      ? "Request interrupted"
      : terminalState.code === "deadline_exceeded"
        ? "Request timed out"
        : terminalState.code === "orchestrated_build_start_failed"
          ? "Full build could not start"
          : "Request failed"

  const message = resolveRunFailureMessage({
    code: terminalState.code,
    backendMessage: terminalState.message,
  })

  const toneClass =
    terminalState.kind === "interrupted"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-red-200 bg-red-50 text-red-950"

  const showRetry =
    (terminalState.retryable === true || shouldOfferRunFailureRetry(terminalState.code))
    && Boolean(onRetry)
  const showReconcile =
    (terminalState.retryable === true || shouldOfferRunFailureReconcile(terminalState.code))
    && Boolean(onReconcile)

  return (
    <div className={`mt-2 rounded-md border px-3 py-2 text-sm ${toneClass}`}>
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-[13px] leading-snug">{message}</div>
      {showRetry || showReconcile ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {showReconcile ? (
            <button
              type="button"
              onClick={onReconcile}
              className="rounded-md border border-current/20 bg-white/70 px-2.5 py-1 text-xs font-medium hover:bg-white"
            >
              Reconcile
            </button>
          ) : null}
          {showRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-current/20 bg-white/70 px-2.5 py-1 text-xs font-medium hover:bg-white"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : terminalState.retryable ? (
        <div className="mt-1 text-xs opacity-80">You can try sending again.</div>
      ) : null}
    </div>
  )
}
