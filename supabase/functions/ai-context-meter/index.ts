import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

const CONTEXT_LIMITS: Record<string, number> = {
  "gpt-5.4-mini": 400_000,
  "gpt-5.5": 400_000,
  "claude-haiku-4-5": 200_000,
  "claude-sonnet-4-6": 200_000,
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders })

  const authorization = req.headers.get("Authorization") ?? ""
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  if (!authorization || !supabaseUrl || !anonKey) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders })
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })

  const threadId = new URL(req.url).searchParams.get("thread_id")?.trim() ?? ""
  if (!threadId) return Response.json({ error: "thread_id_required" }, { status: 400, headers: corsHeaders })

  // This read intentionally uses the caller JWT. Existing RLS on ai_threads / ai_chat_runs
  // remains the authority for private, team and project-visible threads.
  const { data: thread, error: threadError } = await supabase
    .from("ai_threads")
    .select("id, context_summary_updated_at")
    .eq("id", threadId)
    .maybeSingle()
  if (threadError) return Response.json({ error: threadError.message }, { status: 403, headers: corsHeaders })
  if (!thread) return Response.json({ error: "thread_not_found" }, { status: 404, headers: corsHeaders })

  const { data: runs, error: runsError } = await supabase
    .from("ai_chat_runs")
    .select("id, model_provider, model_name, metrics, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(12)
  if (runsError) return Response.json({ error: runsError.message }, { status: 403, headers: corsHeaders })

  const latest = (runs ?? []).find((row: any) => positiveNumber(row?.metrics?.usage_prompt_tokens) != null) ?? null
  if (!latest) {
    return Response.json({ context: null }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } })
  }

  const promptTokens = Math.round(positiveNumber(latest.metrics?.usage_prompt_tokens) ?? 0)
  const modelName = String(latest.model_name ?? "")
  const contextLimit = CONTEXT_LIMITS[modelName] ?? null
  const percentUsed = contextLimit ? Math.min(100, (promptTokens / contextLimit) * 100) : null

  return Response.json({
    context: {
      run_id: latest.id,
      model_provider: latest.model_provider ?? null,
      model_name: modelName || null,
      prompt_tokens: promptTokens,
      context_limit: contextLimit,
      percent_used: percentUsed,
      summarized: Boolean(thread.context_summary_updated_at),
      measured_at: latest.created_at ?? null,
    },
  }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } })
})
