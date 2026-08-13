/**
 * One-off Phase 2 runner against an EXISTING Chrome CDP port (keeps login).
 * Uses the updated Bridge action code without restarting the helper process.
 *
 * CDP_HTTP=http://127.0.0.1:PORT \
 * NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 * npx tsx scripts/run-agent-on-cdp.ts
 */
import {
  getBrowserState,
  runBrowserAction,
  type BrowserAction,
} from "../src/actions.ts"
import type { LocalBrowserSession } from "../src/chrome.ts"

const cdpHttp = (process.env.CDP_HTTP || "").replace(/\/$/, "")
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(cdpHttp)) {
  throw new Error("Set CDP_HTTP=http://127.0.0.1:<port>")
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
if (!supabaseUrl || !serviceKey) throw new Error("Supabase env missing")

const task =
  process.env.TASK ||
  "On this Squarespace site, open the blog page named Artigos from Website → Pages, then stop at the blog management/posts area. Do not create, edit, save, delete or publish anything. Prefer clicking the short label Artigos in the page tree."

const session = {
  id: "adopted",
  status: "active",
  startUrl: "",
  currentUrl: "",
  title: "",
  userDataDir: "",
  debuggingPort: Number(new URL(cdpHttp).port),
  cdpHttpBase: cdpHttp,
  startedAt: new Date().toISOString(),
  process: null,
} as LocalBrowserSession

type HistoryItem = {
  thought?: string
  action?: BrowserAction | { type: string }
  result?: string
}

async function agentStep(state: unknown, history: HistoryItem[], step: number) {
  const response = await fetch(`${supabaseUrl}/functions/v1/local-browser-agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task, state, history, step }),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.error?.message || `agent ${response.status}`)
  }
  return payload as {
    status: string
    thought?: string
    message?: string
    action: BrowserAction | null
    diagnostics?: { llmMs?: number }
  }
}

const history: HistoryItem[] = []
const actionMs: number[] = []
const llmMs: number[] = []
const loopStart = Date.now()
let firstActionMs: number | null = null

// Start from Pages.
await runBrowserAction(session, {
  type: "navigate",
  url: "https://ivo-relvas-t2lp.squarespace.com/config/pages",
})
await new Promise((r) => setTimeout(r, 1200))

for (let step = 1; step <= 10; step += 1) {
  const state = await getBrowserState(session)
  console.log(`\n======== STEP ${step} ========`)
  console.log("URL:", state.url)
  console.log("Title:", state.title)
  const interesting = state.elements.filter((el) => {
    const blob = `${el.text} ${el.name}`.toLowerCase()
    return (
      blob.includes("artig") ||
      blob.includes("blog") ||
      blob.includes("post") ||
      el.text === "Pages" ||
      el.text === "Website" ||
      el.text.length > 0 && el.text.length < 40
    )
  })
  for (const el of interesting.slice(0, 25)) {
    console.log(`  [${el.index}] ${el.tag} ${JSON.stringify(el.text)}`)
  }

  const artigos = state.elements.find(
    (el) => el.text.trim().toLowerCase() === "artigos" && el.text.length < 20,
  )
  let stepResult: Awaited<ReturnType<typeof agentStep>>
  if (artigos && step <= 2) {
    // Deterministic assist for this spike: click Artigos once with improved mouse events.
    stepResult = {
      status: "continue",
      thought: `Clicking page-tree leaf Artigos at index ${artigos.index}`,
      action: { type: "click", index: artigos.index },
      message: "",
      diagnostics: { llmMs: 0 },
    }
  } else {
    stepResult = await agentStep(state, history, step)
  }

  if (stepResult.diagnostics?.llmMs) llmMs.push(stepResult.diagnostics.llmMs)
  console.log("AGENT:", stepResult.status, "|", (stepResult.thought || stepResult.message || "").slice(0, 220))

  if (stepResult.status === "done" || stepResult.status === "needs_user" || stepResult.status === "failed") {
    console.log("MESSAGE:", stepResult.message)
    break
  }
  if (!stepResult.action) break

  const t0 = Date.now()
  const result = await runBrowserAction(session, stepResult.action)
  const elapsed = Date.now() - t0
  actionMs.push(elapsed)
  if (firstActionMs == null) firstActionMs = Date.now() - loopStart
  console.log("AFTER:", result.action.type, "→", session.currentUrl, `actionMs=${elapsed}`)

  // Heuristic success: Artigos selected / blog controls visible.
  const after = await getBrowserState(session)
  const blob = after.elements.map((e) => e.text).join(" | ").toLowerCase()
  if (
    blob.includes("add post") ||
    blob.includes("new post") ||
    blob.includes("blog posts") ||
    blob.includes("escrever") ||
    /posts?\b/.test(blob) && blob.includes("artig")
  ) {
    console.log("HEURISTIC DONE: blog controls detected")
    console.log("FINAL URL:", after.url)
    break
  }

  history.push({
    thought: stepResult.thought,
    action:
      stepResult.action.type === "type"
        ? { type: "type", index: stepResult.action.index, text: "[redacted]" }
        : stepResult.action,
    result: `ok url=${after.url}`,
  })
}

console.log("\n=== LATENCY ===")
console.log({
  firstActionMs,
  avgActionMs: actionMs.length ? Math.round(actionMs.reduce((a, b) => a + b, 0) / actionMs.length) : null,
  actionMs,
  avgLlmMs: llmMs.length ? Math.round(llmMs.reduce((a, b) => a + b, 0) / llmMs.length) : null,
  llmMs,
})
const finalState = await getBrowserState(session)
console.log("\n=== FINAL ===")
console.log({ url: finalState.url, title: finalState.title })
console.log(
  "labels:",
  finalState.elements
    .filter((e) => e.text)
    .slice(0, 40)
    .map((e) => `[${e.index}] ${e.text}`)
    .join(" | "),
)
