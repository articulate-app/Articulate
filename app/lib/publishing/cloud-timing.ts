/**
 * End-to-end Cloud publish timing marks (dev diagnostics).
 * Stages map to Browser Use Cloud latency vs our app overhead.
 */

export type CloudPublishTimingStage =
  | "T0_destination_chosen"
  | "T1_supabase_request_start"
  | "T2_run_created"
  | "T3_browser_ready"
  | "T4_live_view_iframe_loaded"
  | "T5_page_usable"
  | "T6_agent_first_action"

type TimingSession = {
  id: string
  t0: number
  marks: Partial<Record<CloudPublishTimingStage, number>>
}

const sessions = new Map<string, TimingSession>()

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

export function startCloudPublishTiming(sessionKey: string): string {
  const id = sessionKey || `pub-${Date.now()}`
  sessions.set(id, { id, t0: nowMs(), marks: { T0_destination_chosen: 0 } })
  return id
}

export function markCloudPublishTiming(
  sessionKey: string,
  stage: CloudPublishTimingStage,
  detail?: Record<string, unknown>,
): void {
  const session = sessions.get(sessionKey)
  if (!session) return
  if (session.marks[stage] != null) return
  const elapsed = Math.round(nowMs() - session.t0)
  session.marks[stage] = elapsed
  if (process.env.NODE_ENV === "development") {
    console.info("[publishing-timing]", {
      session: sessionKey,
      stage,
      ms_from_T0: elapsed,
      ...detail,
    })
  }
}

export function reportCloudPublishTiming(sessionKey: string): Record<string, number | null> | null {
  const session = sessions.get(sessionKey)
  if (!session) return null
  const out: Record<string, number | null> = {
    T0_destination_chosen: 0,
    T1_supabase_request_start: session.marks.T1_supabase_request_start ?? null,
    T2_run_created: session.marks.T2_run_created ?? null,
    T3_browser_ready: session.marks.T3_browser_ready ?? null,
    T4_live_view_iframe_loaded: session.marks.T4_live_view_iframe_loaded ?? null,
    T5_page_usable: session.marks.T5_page_usable ?? null,
    T6_agent_first_action: session.marks.T6_agent_first_action ?? null,
  }
  if (process.env.NODE_ENV === "development") {
    console.info("[publishing-timing] summary", { session: sessionKey, ...out })
  }
  return out
}
