import "jsr:@supabase/functions-js/edge-runtime.d.ts"

/**
 * Local-browser agent step.
 * Runs LLM reasoning server-side only. Never talks to CDP or the local Bridge.
 * Supports multi-action plans to reduce round trips for predictable navigation.
 * Secrets: OPENAI_API_KEY
 */

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? ""
const MAX_ACTIONS_PER_PLAN = 6
const MAX_ELEMENTS = 80

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type InteractiveElement = {
  index: number
  tag: string
  role: string
  type: string
  text: string
  name: string
  href: string
  placeholder: string
  value: string
  isPassword: boolean
}

type BrowserState = {
  url: string
  title: string
  elements: InteractiveElement[]
  note?: string
}

type BrowserAction =
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "click"; index: number }
  | { type: "type"; index: number; text: string; submit?: boolean }
  | { type: "scroll"; direction: "up" | "down"; amount?: number }
  | { type: "wait"; ms?: number }

type HistoryItem = {
  thought?: string
  action?: BrowserAction
  result?: string
}

type RequestBody = {
  task: string
  state: BrowserState
  history?: HistoryItem[]
  step?: number
  /** Known destination entry URL — prefer navigate here without exploration. */
  entry_url?: string | null
}

type AgentStepResponse = {
  thought: string
  status: "continue" | "needs_user" | "done" | "failed"
  action: BrowserAction | null
  actions: BrowserAction[]
  message: string
  /** Publication runs use this to update the shared backend state machine. */
  publication_phase?:
    | "needs_user"
    | "awaiting_publish_confirmation"
    | "scheduled"
    | "published"
    | "failed"
    | "uncertain"
    | null
  external_url?: string | null
  external_id?: string | null
  schedule_strategy?: "external" | "internal" | null
}

function publicationPhase(raw: unknown): AgentStepResponse["publication_phase"] {
  const value = String(raw ?? "").trim()
  return [
    "needs_user",
    "awaiting_publish_confirmation",
    "scheduled",
    "published",
    "failed",
    "uncertain",
  ].includes(value)
    ? (value as NonNullable<AgentStepResponse["publication_phase"]>)
    : null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function compactState(state: BrowserState): BrowserState {
  const elements = (state.elements ?? [])
    .slice(0, MAX_ELEMENTS)
    .map((el) => ({
      index: el.index,
      tag: el.tag,
      role: el.role,
      type: el.type,
      text: String(el.text ?? "").slice(0, 80),
      name: String(el.name ?? "").slice(0, 60),
      href: String(el.href ?? "").slice(0, 120),
      placeholder: String(el.placeholder ?? "").slice(0, 40),
      value: el.isPassword
        ? el.value
          ? "[REDACTED]"
          : ""
        : String(el.value ?? "").slice(0, 40),
      isPassword: Boolean(el.isPassword),
    }))
  return {
    url: state.url,
    title: String(state.title || "").slice(0, 120),
    note: state.note ? String(state.note).slice(0, 200) : undefined,
    elements,
  }
}

function sanitizeAction(raw: unknown): BrowserAction | null {
  if (!raw || typeof raw !== "object") return null
  const action = raw as Record<string, unknown>
  const type = String(action.type || "")
  switch (type) {
    case "navigate": {
      const url = String(action.url || "").trim()
      if (!/^https?:\/\//i.test(url)) return null
      return { type: "navigate", url }
    }
    case "back":
    case "forward":
    case "reload":
      return { type }
    case "click": {
      const index = Number(action.index)
      if (!Number.isInteger(index) || index < 0) return null
      return { type: "click", index }
    }
    case "type": {
      const index = Number(action.index)
      const text = String(action.text ?? "")
      if (!Number.isInteger(index) || index < 0) return null
      return {
        type: "type",
        index,
        text: text.slice(0, 2000),
        submit: Boolean(action.submit),
      }
    }
    case "scroll": {
      const direction = action.direction === "up" ? "up" : "down"
      const amount = Number(action.amount ?? 600)
      return {
        type: "scroll",
        direction,
        amount: Number.isFinite(amount) ? amount : 600,
      }
    }
    case "wait": {
      const ms = Number(action.ms ?? 400)
      return { type: "wait", ms: Number.isFinite(ms) ? Math.min(ms, 5000) : 400 }
    }
    default:
      return null
  }
}

function sanitizeActions(raw: unknown): BrowserAction[] {
  if (!Array.isArray(raw)) return []
  const out: BrowserAction[] = []
  for (const item of raw.slice(0, MAX_ACTIONS_PER_PLAN)) {
    const action = sanitizeAction(item)
    if (action) out.push(action)
  }
  return out
}

async function callOpenAi(systemPrompt: string, userPrompt: string): Promise<AgentStepResponse> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI failed (${response.status})`)
  }
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Empty OpenAI response")
  }
  const parsed = JSON.parse(content) as Record<string, unknown>
  const statusRaw = String(parsed.status || "continue")
  const status =
    statusRaw === "needs_user" ||
      statusRaw === "done" ||
      statusRaw === "failed" ||
      statusRaw === "continue"
      ? statusRaw
      : "continue"

  let actions =
    status === "continue"
      ? sanitizeActions(parsed.actions ?? (parsed.action ? [parsed.action] : []))
      : []
  if (status === "continue" && actions.length === 0) {
    const single = sanitizeAction(parsed.action)
    if (single) actions = [single]
  }

  return {
    thought: String(parsed.thought || "").slice(0, 800),
    status,
    action: actions[0] ?? null,
    actions,
    message: String(parsed.message || "").slice(0, 800),
    publication_phase: publicationPhase(parsed.publication_phase ?? parsed.phase),
    external_url:
      typeof parsed.external_url === "string" && /^https?:\/\//i.test(parsed.external_url)
        ? parsed.external_url.slice(0, 2000)
        : null,
    external_id:
      typeof parsed.external_id === "string" && parsed.external_id.trim()
        ? parsed.external_id.trim().slice(0, 500)
        : null,
    schedule_strategy:
      parsed.schedule_strategy === "external" || parsed.schedule_strategy === "internal"
        ? parsed.schedule_strategy
        : null,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const t0 = Date.now()
  try {
    if (!OPENAI_API_KEY) {
      return json({ error: { message: "OPENAI_API_KEY not configured" } }, 500)
    }
    if (req.method !== "POST") {
      return json({ error: { message: "POST required" } }, 405)
    }

    const body = (await req.json()) as RequestBody
    const task = String(body.task || "").trim()
    if (!task) return json({ error: { message: "task is required" } }, 400)
    if (!body.state?.url) return json({ error: { message: "state.url is required" } }, 400)

    const state = compactState(body.state)
    const history = Array.isArray(body.history)
      ? body.history.slice(-8).map((h) => ({
          thought: h.thought ? String(h.thought).slice(0, 160) : undefined,
          action: h.action,
          result: h.result ? String(h.result).slice(0, 120) : undefined,
        }))
      : []
    const step = Number(body.step ?? history.length + 1)
    const entryUrl =
      typeof body.entry_url === "string" && /^https?:\/\//i.test(body.entry_url.trim())
        ? body.entry_url.trim()
        : null

    const systemPrompt = [
      "You are a careful browser navigation agent for Articulate's connected browser.",
      "You may return a SHORT multi-action plan (1–6 actions) for predictable sequences.",
      "HARD RULES:",
      "- Follow the task's allowed scope. A publication preparation task may create and fill a draft/editor, but it must never perform the final irreversible Publish/Send/Schedule action unless the task explicitly says the user confirmed it.",
      "- Do NOT fill password fields or ask for passwords.",
      "- If login/captcha/2FA is required, status=needs_user.",
      "- Prefer a known entry_url navigate as the first action when provided and not already there.",
      "- Prefer clicking visible navigation over inventing deep URLs.",
      "- Never invent element indexes that are not in the provided state.",
      "- After a navigate that changes the page substantially, end the plan (driver will re-ask).",
      "- Keep plans short: click → wait → click is good; 6+ speculative steps is not.",
      "For publication tasks, when status=done also return publication_phase: needs_user | awaiting_publish_confirmation | scheduled | published | failed | uncertain, plus external_url/external_id/schedule_strategy when known.",
      "Return JSON: { thought, status, actions, message, publication_phase? }",
      "status: continue | needs_user | done | failed",
      "actions when status=continue: array of",
      '{type:"navigate",url}|{type:"back"}|{type:"forward"}|{type:"reload"}|{type:"click",index}|{type:"type",index,text,submit?}|{type:"scroll",direction,amount?}|{type:"wait",ms?}',
      "When status!=continue, actions must be [].",
      "Also set action to actions[0] for compatibility.",
    ].join("\n")

    const userPrompt = JSON.stringify({
      task,
      step,
      entry_url: entryUrl,
      current_url: state.url,
      title: state.title,
      elements: state.elements,
      note: state.note,
      recent_history: history,
    })

    const result = await callOpenAi(systemPrompt, userPrompt)
    if (result.status === "continue" && result.actions.length === 0) {
      return json({
        ...result,
        status: "failed",
        message: result.message || "Model returned continue without a valid action",
        diagnostics: { llmMs: Date.now() - t0, elementCount: state.elements.length },
      })
    }

    return json({
      ...result,
      diagnostics: {
        llmMs: Date.now() - t0,
        elementCount: state.elements.length,
        actionCount: result.actions.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: { message } }, 500)
  }
})
