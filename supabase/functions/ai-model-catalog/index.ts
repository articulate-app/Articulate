import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
}

type CatalogModel = {
  key: string
  label: string
  provider: string
  external_id: string | null
  tier: "economy" | "balanced" | "premium"
  context_limit: number | null
  recommended: boolean
  selectable: boolean
  lab_only: boolean
  input_price_per_million: number | null
  output_price_per_million: number | null
}

const nativeModels: CatalogModel[] = [
  {
    key: "openai.gpt-5.5",
    label: "OpenAI GPT-5.5",
    provider: "openai",
    external_id: "gpt-5.5",
    tier: "premium",
    context_limit: 400_000,
    recommended: true,
    selectable: true,
    lab_only: false,
    input_price_per_million: 2.5,
    output_price_per_million: 15,
  },
  {
    key: "openai.gpt-5.4-mini",
    label: "OpenAI GPT-5.4 Mini",
    provider: "openai",
    external_id: "gpt-5.4-mini",
    tier: "balanced",
    context_limit: 400_000,
    recommended: true,
    selectable: true,
    lab_only: false,
    input_price_per_million: 0.75,
    output_price_per_million: 4.5,
  },
]

function finite(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function pricePerMillion(value: unknown): number | null {
  const perToken = finite(value)
  return perToken == null ? null : perToken * 1_000_000
}

function inferTier(input: number | null, output: number | null): CatalogModel["tier"] {
  const blended = (input ?? 0) + (output ?? 0)
  if (blended > 0 && blended <= 2) return "economy"
  if (blended > 0 && blended <= 10) return "balanced"
  return "premium"
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
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders })

  const models: CatalogModel[] = [...nativeModels]
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY") ?? ""
  if (openRouterKey) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${openRouterKey}` },
      })
      if (response.ok) {
        const payload = await response.json()
        for (const row of Array.isArray(payload?.data) ? payload.data : []) {
          const id = typeof row?.id === "string" ? row.id.trim() : ""
          if (!id) continue
          const inputPrice = pricePerMillion(row?.pricing?.prompt)
          const outputPrice = pricePerMillion(row?.pricing?.completion)
          models.push({
            key: `openrouter:${id}`,
            label: typeof row?.name === "string" && row.name.trim() ? row.name.trim() : id,
            provider: "openrouter",
            external_id: id,
            tier: inferTier(inputPrice, outputPrice),
            context_limit: finite(row?.context_length),
            recommended: false,
            // Discovery is live now; production chat selection is enabled only after
            // the OpenRouter tools/streaming adapter passes the Model Lab benchmark.
            selectable: false,
            lab_only: true,
            input_price_per_million: inputPrice,
            output_price_per_million: outputPrice,
          })
        }
      }
    } catch (error) {
      console.warn("ai-model-catalog OpenRouter discovery failed", error)
    }
  }

  return Response.json({
    default_key: "auto",
    auto_strategies: [
      { key: "balanced", label: "Balanced", description: "Balance quality, speed and cost." },
      { key: "quality", label: "Prioritize quality", description: "Prefer stronger models when they add value." },
      { key: "savings", label: "Prioritize savings", description: "Prefer the lowest-cost model that should complete the task well." },
      { key: "speed", label: "Prioritize speed", description: "Prefer low-latency models." },
    ],
    models,
  }, { headers: { ...corsHeaders, "Cache-Control": "private, max-age=300" } })
})
