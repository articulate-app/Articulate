/**
 * Articulate AI publication reasoning step.
 * Returns concrete browser actions plus a publication phase.
 * This is not a second browser agent — it is Articulate deciding the next
 * BrowserController commands. It never talks to Browser Use /runs.
 */

export type ArticulateBrowserAction =
  | { type: "navigate"; url: string }
  | { type: "back" }
  | { type: "forward" }
  | { type: "reload" }
  | { type: "click"; index: number }
  | { type: "type"; index: number; text: string; submit?: boolean }
  | { type: "scroll"; direction: "up" | "down"; amount?: number }
  | { type: "wait"; ms?: number }

export type ArticulatePublicationPhase =
  | "needs_user"
  | "awaiting_publish_confirmation"
  | "scheduled"
  | "published"
  | "failed"
  | "uncertain"

export type ArticulateReasonStepInput = {
  task: string
  url: string
  title?: string | null
  elements?: Array<{
    index: number
    tag?: string | null
    role?: string | null
    name?: string | null
    text?: string | null
    href?: string | null
  }>
  text?: string | null
  history?: Array<{ thought?: string; action?: ArticulateBrowserAction; result?: string }>
  step?: number
  entryUrl?: string | null
  allowFinalPublish?: boolean
}

export type ArticulateReasonStepResult = {
  thought: string
  status: "continue" | "needs_user" | "done" | "failed"
  action: ArticulateBrowserAction | null
  actions: ArticulateBrowserAction[]
  message: string
  publication_phase?: ArticulatePublicationPhase | null
  external_url?: string | null
  external_id?: string | null
  schedule_strategy?: "external" | "internal" | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

const ALLOWED_ACTION_TYPES = new Set([
  "navigate",
  "back",
  "forward",
  "reload",
  "click",
  "type",
  "scroll",
  "wait",
])

function parseAction(value: unknown): ArticulateBrowserAction | null {
  const record = asRecord(value)
  if (!record) return null
  const type = asString(record.type)
  if (!type || !ALLOWED_ACTION_TYPES.has(type)) return null
  if (type === "navigate") {
    const url = asString(record.url)
    return url ? { type: "navigate", url } : null
  }
  if (type === "click") {
    const index = Number(record.index)
    return Number.isFinite(index) ? { type: "click", index } : null
  }
  if (type === "type") {
    const index = Number(record.index)
    const text = typeof record.text === "string" ? record.text : ""
    return Number.isFinite(index) ? { type: "type", index, text, submit: record.submit === true } : null
  }
  if (type === "scroll") {
    const direction = record.direction === "up" ? "up" : "down"
    return { type: "scroll", direction, amount: Number(record.amount) || 600 }
  }
  if (type === "wait") {
    return { type: "wait", ms: Number(record.ms) || 400 }
  }
  return { type } as ArticulateBrowserAction
}

export function buildArticulatePublicationPrompt(input: ArticulateReasonStepInput): {
  system: string
  user: string
} {
  const allowFinal = input.allowFinalPublish === true
  const system = [
    "You are Articulate AI controlling a live browser through deterministic Browser Tools.",
    "You are the only reasoning agent. Do not invent another browser agent.",
    "Return a SHORT plan of 1–6 concrete actions.",
    "HARD RULES:",
    "- Never fill password fields or handle credentials. If login/captcha/2FA is required, status=needs_user.",
    "- Never invent URLs or element indexes that are not in the provided page state.",
    allowFinal
      ? "- The user confirmed. Click the real Publish/Post/Schedule control once, then verify the resulting URL/state."
      : "- Prepare the draft only. Never click the final irreversible Publish/Send/Schedule control.",
    "- Prefer a known entry_url navigate when provided and the page is not already there.",
    "- After a substantial navigation, end the plan so the next observation can continue.",
    "When status=done also set publication_phase to needs_user | awaiting_publish_confirmation | scheduled | published | failed | uncertain.",
    "Return JSON only: { thought, status, actions, message, publication_phase?, external_url?, external_id?, schedule_strategy? }",
    "status: continue | needs_user | done | failed",
    "actions when continue: {type:navigate|back|forward|reload|click|type|scroll|wait}",
  ].join("\n")
  const user = JSON.stringify({
    task: input.task,
    step: input.step ?? 1,
    allow_final_publish: allowFinal,
    entry_url: input.entryUrl ?? null,
    current_url: input.url,
    title: input.title ?? "",
    text: String(input.text ?? "").slice(0, 2500),
    elements: (input.elements ?? []).slice(0, 40),
    recent_history: (input.history ?? []).slice(-6),
  })
  return { system, user }
}

export function parseArticulateReasonStep(raw: unknown): ArticulateReasonStepResult {
  const record = asRecord(raw) ?? {}
  const actions = (Array.isArray(record.actions) ? record.actions : [])
    .map(parseAction)
    .filter((item): item is ArticulateBrowserAction => item != null)
    .slice(0, 6)
  const fallback = parseAction(record.action)
  const list = actions.length > 0 ? actions : fallback ? [fallback] : []
  const statusRaw = asString(record.status) ?? "continue"
  const status =
    statusRaw === "needs_user" || statusRaw === "done" || statusRaw === "failed"
      ? statusRaw
      : "continue"
  return {
    thought: asString(record.thought) ?? "",
    status,
    action: list[0] ?? null,
    actions: status === "continue" ? list : [],
    message: asString(record.message) ?? "",
    publication_phase: asString(record.publication_phase) as ArticulatePublicationPhase | null,
    external_url: asString(record.external_url),
    external_id: asString(record.external_id),
    schedule_strategy:
      record.schedule_strategy === "external" || record.schedule_strategy === "internal"
        ? record.schedule_strategy
        : null,
  }
}

export async function callArticulateReasonStep(
  input: ArticulateReasonStepInput,
  options?: { apiKey?: string | null; model?: string | null; fetchImpl?: typeof fetch },
): Promise<ArticulateReasonStepResult> {
  const apiKey = String(options?.apiKey ?? "").trim()
  if (!apiKey) {
    return {
      thought: "",
      status: "failed",
      action: null,
      actions: [],
      message: "Articulate AI is not configured for unattended publication.",
      publication_phase: "failed",
    }
  }
  const { system, user } = buildArticulatePublicationPrompt(input)
  const model = String(options?.model ?? "gpt-4.1-mini").trim() || "gpt-4.1-mini"
  const fetchImpl = options?.fetchImpl ?? fetch
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: unknown } }>
    error?: { message?: string }
  }
  if (!response.ok) {
    return {
      thought: "",
      status: "failed",
      action: null,
      actions: [],
      message: asString(payload.error?.message) || `Articulate reasoning failed (${response.status})`,
      publication_phase: "failed",
    }
  }
  const content = asString(payload.choices?.[0]?.message?.content)
  let parsed: unknown = null
  try {
    parsed = content ? JSON.parse(content) : payload
  } catch {
    parsed = payload
  }
  const result = parseArticulateReasonStep(parsed)
  if (result.status === "continue" && result.actions.length === 0) {
    return {
      ...result,
      status: "failed",
      message: result.message || "Articulate returned continue without a valid action",
      publication_phase: "failed",
    }
  }
  return result
}
