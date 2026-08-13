"use client"

import { useEffect, useRef, useState } from "react"
import {
  getBridgeBaseUrl,
  getBridgeBrowserState,
  getBridgeCdpUrl,
  navigateBridgeSession,
  probeLocalBridge,
  refreshBridgeSession,
  requestLocalAgentStep,
  runBridgeBrowserAction,
  startBridgeSession,
  stopBridgeSession,
  type BridgeBrowserAction,
  type BridgeBrowserState,
  type BridgeDiagnostics,
  type BridgeHealth,
  type BridgeSession,
} from "@/lib/local-browser-bridge"
import { getLocalBrowserAccessToken, pairBrowserHelper } from "@/lib/browser-helper-client"

const TEST_URLS = [
  { label: "Google", url: "https://www.google.com/" },
  { label: "Squarespace", url: "https://account.squarespace.com/" },
] as const

const DEFAULT_TASK =
  "Navigate to the Articulate site inside Squarespace and stop when you reach the blog management/editor area. Do not create, edit, save, delete or publish anything."

type AgentHistoryItem = {
  thought?: string
  action?: BridgeBrowserAction
  result?: string
}

type LatencySample = {
  instructionToFirstActionMs?: number
  actionMs: number[]
  llmMs: number[]
}

export default function LocalBrowserDevPage() {
  const [health, setHealth] = useState<BridgeHealth | null>(null)
  const [token, setToken] = useState("")
  const [session, setSession] = useState<BridgeSession | null>(null)
  const [urlDraft, setUrlDraft] = useState("https://www.google.com/")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [lastDiagnostics, setLastDiagnostics] = useState<BridgeDiagnostics | null>(null)
  const [cdpUrl, setCdpUrl] = useState<string | null>(null)
  const [task, setTask] = useState(DEFAULT_TASK)
  const [agentStatus, setAgentStatus] = useState<
    "idle" | "running" | "paused" | "done" | "failed"
  >("idle")
  const [lastState, setLastState] = useState<BridgeBrowserState | null>(null)
  const [latency, setLatency] = useState<LatencySample>({ actionMs: [], llmMs: [] })
  const historyRef = useRef<AgentHistoryItem[]>([])
  const stopAgentRef = useRef(false)
  const agentRunRef = useRef(0)

  const pushLog = (line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 80))
  }

  const refreshHealth = async () => {
    const next = await probeLocalBridge()
    setHealth(next)
    if (next.ok) pushLog(`Helper detected @ ${getBridgeBaseUrl()} v${next.version ?? "?"}`)
    else pushLog(`Helper missing: ${next.error ?? "unknown"}`)
  }

  useEffect(() => {
    void refreshHealth()
    const timer = setInterval(() => {
      void probeLocalBridge().then(setHealth)
    }, 4_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe on mount only
  }, [])

  const requireToken = async () => {
    if (token.trim()) return token.trim()
    try {
      await pairBrowserHelper()
    } catch {
      // already paired is fine
    }
    const access = await getLocalBrowserAccessToken()
    setToken(access)
    return access
  }

  const onStart = async (url: string) => {
    setBusy(true)
    setError(null)
    try {
      const auth = await requireToken()
      const started = performance.now()
      const result = await startBridgeSession(auth, url)
      setSession(result.session)
      setUrlDraft(result.session.currentUrl || url)
      setLastDiagnostics(result.diagnostics ?? { startupMs: Math.round(performance.now() - started) })
      setAgentStatus("idle")
      historyRef.current = []
      setLatency({ actionMs: [], llmMs: [] })
      const cdp = await getBridgeCdpUrl(auth, result.session.id)
      setCdpUrl(cdp.cdpUrl)
      pushLog(
        `Started session ${result.session.id.slice(0, 8)}… startupMs=${result.diagnostics?.startupMs ?? "n/a"}`,
      )
      pushLog(`CDP (same browser): ${cdp.cdpUrl} — use as BU_CDP_URL for Browser Use attach`)
      pushLog("Log into Squarespace manually in the Chrome window, then Run agent.")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      pushLog(`Start failed: ${message}`)
    } finally {
      setBusy(false)
      void refreshHealth()
    }
  }

  const onNavigate = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      const auth = await requireToken()
      const result = await navigateBridgeSession(auth, session.id, urlDraft)
      setSession(result.session)
      setLastDiagnostics(result.diagnostics ?? null)
      pushLog(
        `Navigate → ${result.session.currentUrl} navigateMs=${result.diagnostics?.navigateMs ?? "n/a"}`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      pushLog(`Navigate failed: ${message}`)
    } finally {
      setBusy(false)
    }
  }

  const onRefreshMeta = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      const auth = await requireToken()
      const next = await refreshBridgeSession(auth, session.id)
      setSession(next)
      setUrlDraft(next.currentUrl || urlDraft)
      pushLog(`Meta: ${next.title || "(no title)"} — ${next.currentUrl}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const onStop = async () => {
    if (!session) return
    stopAgentRef.current = true
    setBusy(true)
    setError(null)
    try {
      const auth = await requireToken()
      await stopBridgeSession(auth, session.id)
      pushLog(`Stopped session ${session.id.slice(0, 8)}… (temp profile deleted)`)
      setSession(null)
      setCdpUrl(null)
      setLastState(null)
      setLastDiagnostics(null)
      setAgentStatus("idle")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      pushLog(`Stop failed: ${message}`)
    } finally {
      setBusy(false)
      void refreshHealth()
    }
  }

  const runAgentLoop = async () => {
    if (!session) return
    const runId = ++agentRunRef.current
    stopAgentRef.current = false
    setAgentStatus("running")
    setError(null)
    setBusy(true)
    const auth = await requireToken()
    const loopStarted = performance.now()
    let firstActionRecorded = false

    try {
      for (let step = 1; step <= 30; step += 1) {
        if (stopAgentRef.current || runId !== agentRunRef.current) {
          setAgentStatus("paused")
          pushLog("Agent paused — interact in Chrome, then Continue")
          return
        }

        const stateResult = await getBridgeBrowserState(auth, session.id)
        setSession(stateResult.session)
        setLastState(stateResult.state)
        setUrlDraft(stateResult.state.url || urlDraft)

        const stepResult = await requestLocalAgentStep({
          task: task.trim(),
          state: stateResult.state,
          history: historyRef.current,
          step,
        })

        if (typeof stepResult.diagnostics?.llmMs === "number") {
          setLatency((prev) => ({
            ...prev,
            llmMs: [...prev.llmMs, stepResult.diagnostics!.llmMs!].slice(-20),
          }))
        }

        pushLog(
          `Agent[${step}] ${stepResult.status}: ${stepResult.thought || stepResult.message || ""}`.slice(
            0,
            220,
          ),
        )

        if (stepResult.status === "needs_user") {
          setAgentStatus("paused")
          pushLog(`Needs user: ${stepResult.message || "Take over in the Chrome window"}`)
          return
        }
        if (stepResult.status === "done") {
          setAgentStatus("done")
          pushLog(`Done: ${stepResult.message || "Reached target area"}`)
          return
        }
        if (stepResult.status === "failed" || !stepResult.action) {
          setAgentStatus("failed")
          setError(stepResult.message || "Agent failed")
          return
        }

        const action = stepResult.action
        const actionStarted = performance.now()
        const actionResult = await runBridgeBrowserAction(auth, session.id, action)
        const actionMs = Math.round(performance.now() - actionStarted)
        if (!firstActionRecorded) {
          firstActionRecorded = true
          setLatency((prev) => ({
            ...prev,
            instructionToFirstActionMs: Math.round(performance.now() - loopStarted),
            actionMs: [...prev.actionMs, actionMs].slice(-20),
          }))
        } else {
          setLatency((prev) => ({
            ...prev,
            actionMs: [...prev.actionMs, actionMs].slice(-20),
          }))
        }

        setSession(actionResult.session)
        setLastState(actionResult.state)
        setLastDiagnostics(actionResult.diagnostics ?? { actionMs })
        const actionLabel =
          action.type === "type"
            ? `type index=${action.index} len=${action.text.length}`
            : JSON.stringify(action)
        pushLog(`Action ${actionLabel} actionMs=${actionMs}`)
        historyRef.current = [
          ...historyRef.current,
          {
            thought: stepResult.thought,
            action:
              action.type === "type"
                ? { ...action, text: `[${action.text.length} chars]` }
                : action,
            result: `ok url=${actionResult.state.url}`,
          },
        ].slice(-12)
      }
      setAgentStatus("paused")
      pushLog("Reached step limit — pause for human review")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setAgentStatus("failed")
      pushLog(`Agent error: ${message}`)
    } finally {
      setBusy(false)
    }
  }

  const onPauseAgent = () => {
    stopAgentRef.current = true
    pushLog("Pause requested — finishing current step…")
  }

  const helperOk = Boolean(health?.ok)
  const avg = (values: number[]) =>
    values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-neutral-900">
      <h1 className="text-2xl font-semibold tracking-tight">Local Browser Bridge — Phase 2</h1>
      <p className="mt-2 text-neutral-600">
        Same isolated Chrome window for human + agent. LLM runs on Supabase edge; Bridge only
        executes CDP actions. No publishing. No production keys in the helper.
      </p>

      <section className="mt-8 space-y-3 rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Helper status</div>
            <div className="text-neutral-500">{getBridgeBaseUrl()}</div>
          </div>
          <button
            type="button"
            onClick={() => void refreshHealth()}
            className="rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
          >
            Refresh
          </button>
        </div>
        <div
          className={
            helperOk
              ? "rounded bg-emerald-50 px-3 py-2 text-emerald-800"
              : "rounded bg-amber-50 px-3 py-2 text-amber-900"
          }
        >
          {helperOk
            ? `Online — ${health?.service} v${health?.version} · sessions=${health?.sessions ?? 0}`
            : `Offline — ${health?.error ?? "start tools/articulate-browser-bridge"}`}
        </div>
        <label className="block">
          <span className="text-neutral-600">Short-lived access token (auto from pairing)</span>
          <input
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Issued automatically after Connect / authorize"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-neutral-200 p-4">
        <div className="font-medium">1. Browser session</div>
        <div className="flex flex-wrap gap-2">
          {TEST_URLS.map((item) => (
            <button
              key={item.url}
              type="button"
              disabled={!helperOk || busy || agentStatus === "running"}
              onClick={() => void onStart(item.url)}
              className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40"
            >
              Start → {item.label}
            </button>
          ))}
          <button
            type="button"
            disabled={!session || busy}
            onClick={() => void onRefreshMeta()}
            className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
          >
            Refresh title/URL
          </button>
          <button
            type="button"
            disabled={!session || busy}
            onClick={() => void onStop()}
            className="rounded border border-red-300 px-3 py-1.5 text-red-700 disabled:opacity-40"
          >
            Stop session
          </button>
        </div>

        <div className="flex gap-2">
          <input
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2"
            placeholder="https://"
            disabled={!session || busy || agentStatus === "running"}
          />
          <button
            type="button"
            disabled={!session || busy || agentStatus === "running"}
            onClick={() => void onNavigate()}
            className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
          >
            Navigate
          </button>
        </div>

        {session ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-neutral-700">
            <dt className="text-neutral-500">id</dt>
            <dd className="font-mono text-xs">{session.id}</dd>
            <dt className="text-neutral-500">cdp</dt>
            <dd className="font-mono text-xs break-all">{cdpUrl || "—"}</dd>
            <dt className="text-neutral-500">title</dt>
            <dd>{session.title || lastState?.title || "—"}</dd>
            <dt className="text-neutral-500">url</dt>
            <dd className="break-all">{lastState?.url || session.currentUrl}</dd>
          </dl>
        ) : (
          <p className="text-neutral-500">Start Squarespace, log in manually, then run the agent.</p>
        )}
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-neutral-200 p-4">
        <div className="font-medium">2. Agent (same browser via CDP)</div>
        <p className="text-neutral-500">
          Architecture A: edge LLM proposes one action → this page executes it on the Bridge →
          Chrome moves. Pause anytime and drive Chrome yourself; Continue re-reads state.
        </p>
        <textarea
          value={task}
          onChange={(event) => setTask(event.target.value)}
          rows={4}
          className="w-full rounded border border-neutral-300 px-3 py-2"
          disabled={agentStatus === "running"}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!session || busy || agentStatus === "running" || !task.trim()}
            onClick={() => {
              historyRef.current = []
              void runAgentLoop()
            }}
            className="rounded bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-40"
          >
            Run agent
          </button>
          <button
            type="button"
            disabled={!session || agentStatus !== "running"}
            onClick={onPauseAgent}
            className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
          >
            Pause / human takeover
          </button>
          <button
            type="button"
            disabled={!session || busy || agentStatus === "running" || agentStatus === "idle"}
            onClick={() => void runAgentLoop()}
            className="rounded border border-neutral-300 px-3 py-1.5 disabled:opacity-40"
          >
            Continue after human
          </button>
        </div>
        <div className="text-neutral-600">
          Agent status: <span className="font-medium">{agentStatus}</span>
          {latency.instructionToFirstActionMs != null ? (
            <span>
              {" "}
              · first action {latency.instructionToFirstActionMs}ms · avg action{" "}
              {avg(latency.actionMs) ?? "—"}ms · avg llm {avg(latency.llmMs) ?? "—"}ms
            </span>
          ) : null}
        </div>
        {lastState ? (
          <details className="rounded bg-neutral-50 p-3">
            <summary className="cursor-pointer text-neutral-700">
              Latest browser state ({lastState.elements.length} elements)
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto text-xs">
              {JSON.stringify(
                {
                  url: lastState.url,
                  title: lastState.title,
                  elements: lastState.elements.slice(0, 20),
                },
                null,
                2,
              )}
            </pre>
          </details>
        ) : null}
        {lastDiagnostics ? (
          <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs text-neutral-700">
            {JSON.stringify(lastDiagnostics, null, 2)}
          </pre>
        ) : null}
        {error ? <p className="text-red-600">{error}</p> : null}
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 p-4">
        <div className="font-medium">Event log</div>
        <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto font-mono text-xs text-neutral-600">
          {log.length === 0 ? <li>No events yet</li> : null}
          {log.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
