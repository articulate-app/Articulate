import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { callArticulateReasonStep } from "../_shared/publishing/articulate-reason-step.ts"

/**
 * Compatibility wrapper.
 * Desktop/local publication drivers used this endpoint for a second reasoning loop.
 * Articulate AI now owns that reasoning — this only forwards to callArticulateReasonStep.
 */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  const t0 = Date.now()
  try {
    if (req.method !== "POST") {
      return json({ error: { message: "POST required" } }, 405)
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const task = asString(body.task)
    const state = asRecord(body.state) ?? {}
    const url = asString(state.url)
    if (!task || !url) {
      return json({ error: { message: "task and state.url are required" } }, 400)
    }
    const history = Array.isArray(body.history) ? body.history : []
    const result = await callArticulateReasonStep(
      {
        task,
        url,
        title: asString(state.title),
        elements: Array.isArray(state.elements) ? state.elements : [],
        text: asString(state.note ?? state.text),
        history: history as never,
        step: Number.isFinite(Number(body.step)) ? Number(body.step) : history.length + 1,
        entryUrl: asString(body.entry_url ?? body.entryUrl),
        allowFinalPublish: body.allow_final_publish === true || body.allowFinalPublish === true,
      },
      { apiKey: Deno.env.get("OPENAI_API_KEY"), model: "gpt-4.1-mini" },
    )
    return json({
      ...result,
      browser_control: "articulate_ai",
      diagnostics: {
        llmMs: Date.now() - t0,
        elementCount: Array.isArray(state.elements) ? state.elements.length : 0,
        actionCount: result.actions.length,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: { message } }, 500)
  }
})
