export type AiChatRunDiagnosticTimestamps = {
  runId: string | null
  requestSentAt: number | null
  responseHeadersAt: number | null
  firstStatusEventAt: number | null
  firstVisibleModelTextAt: number | null
  firstPreviewEventAt: number | null
  firstSavedPreviewAt: number | null
  terminalEventAt: number | null
  serverTiming: string | null
}

export type AiChatRunDiagnosticsTracker = AiChatRunDiagnosticTimestamps & {
  markRequestSent: () => void
  markResponseHeaders: (runId: string | null, serverTiming: string | null) => void
  markFirstStatusEvent: () => void
  markFirstVisibleModelText: () => void
  markFirstPreviewEvent: () => void
  markFirstSavedPreview: () => void
  markTerminalEvent: () => void
  snapshot: () => AiChatRunDiagnosticTimestamps
}

export function createAiChatRunDiagnosticsTracker(): AiChatRunDiagnosticsTracker {
  const state: AiChatRunDiagnosticTimestamps = {
    runId: null,
    requestSentAt: null,
    responseHeadersAt: null,
    firstStatusEventAt: null,
    firstVisibleModelTextAt: null,
    firstPreviewEventAt: null,
    firstSavedPreviewAt: null,
    terminalEventAt: null,
    serverTiming: null,
  }

  return {
    ...state,
    markRequestSent() {
      state.requestSentAt = Date.now()
    },
    markResponseHeaders(runId, serverTiming) {
      state.responseHeadersAt = Date.now()
      if (runId) state.runId = runId
      if (serverTiming) state.serverTiming = serverTiming
    },
    markFirstStatusEvent() {
      if (state.firstStatusEventAt == null) state.firstStatusEventAt = Date.now()
    },
    markFirstVisibleModelText() {
      if (state.firstVisibleModelTextAt == null) state.firstVisibleModelTextAt = Date.now()
    },
    markFirstPreviewEvent() {
      if (state.firstPreviewEventAt == null) state.firstPreviewEventAt = Date.now()
    },
    markFirstSavedPreview() {
      if (state.firstSavedPreviewAt == null) state.firstSavedPreviewAt = Date.now()
    },
    markTerminalEvent() {
      if (state.terminalEventAt == null) state.terminalEventAt = Date.now()
    },
    snapshot() {
      return { ...state }
    },
  }
}

function deltaMs(from: number | null, to: number | null): number | null {
  if (from == null || to == null) return null
  return to - from
}

/** Development-only timing log keyed by run id. Never logs chain-of-thought or internal reasoning. */
export function logAiChatRunDiagnostics(timestamps: AiChatRunDiagnosticTimestamps): void {
  if (process.env.NODE_ENV !== "development") return
  const {
    runId,
    requestSentAt,
    responseHeadersAt,
    firstStatusEventAt,
    firstVisibleModelTextAt,
    firstPreviewEventAt,
    firstSavedPreviewAt,
    terminalEventAt,
    serverTiming,
  } = timestamps
  console.debug("[ai-chat] run diagnostics", {
    run_id: runId,
    deltas_ms: {
      request_to_headers: deltaMs(requestSentAt, responseHeadersAt),
      request_to_first_status: deltaMs(requestSentAt, firstStatusEventAt),
      request_to_first_text: deltaMs(requestSentAt, firstVisibleModelTextAt),
      request_to_first_preview: deltaMs(requestSentAt, firstPreviewEventAt),
      request_to_first_saved_preview: deltaMs(requestSentAt, firstSavedPreviewAt),
      request_to_terminal: deltaMs(requestSentAt, terminalEventAt),
    },
    server_timing: serverTiming,
  })
}
