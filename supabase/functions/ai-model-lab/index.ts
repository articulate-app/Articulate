import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ModelDef = { label: string; family: string; transport: "openai" | "openrouter"; inputPerM?: number; outputPerM?: number };
const MODEL_CATALOG: Record<string, ModelDef> = {
  "openai/gpt-5.4-mini": { label: "GPT-5.4 mini", family: "openai", transport: "openai", inputPerM: 0.75, outputPerM: 4.5 },
  "openai/gpt-5.5": { label: "GPT-5.5", family: "openai", transport: "openai", inputPerM: 5, outputPerM: 30 },
  "deepseek/deepseek-v4-flash": { label: "DeepSeek V4 Flash", family: "deepseek", transport: "openrouter" },
  "minimax/minimax-m3": { label: "MiniMax M3", family: "minimax", transport: "openrouter" },
  "qwen/qwen3-max": { label: "Qwen3 Max", family: "qwen", transport: "openrouter" },
  "moonshotai/kimi-k3": { label: "Kimi K3", family: "moonshot", transport: "openrouter" },
};

const SLOP_TERMS = [
  ["generic_world", "num mundo", 8], ["generic_world_en", "in a world", 8],
  ["increasingly", "cada vez mais", 4], ["fundamental_role", "papel fundamental", 5],
  ["crucial_role", "crucial role", 5], ["in_conclusion", "em conclusão", 5],
  ["in_conclusion_en", "in conclusion", 5], ["delve", "delve", 6],
  ["landscape", "ever-evolving landscape", 6], ["unlock", "unlock", 5],
  ["seamless", "seamless", 3], ["de_forma_a", "de forma a", 3],
] as const;

function countTerm(text: string, term: string) {
  const haystack = text.toLocaleLowerCase(); const needle = term.toLocaleLowerCase();
  let count = 0; let from = 0;
  while (true) { const idx = haystack.indexOf(needle, from); if (idx < 0) return count; count += 1; from = idx + needle.length; }
}
function antiSlop(text: string) {
  const hits: Record<string, number> = {}; let penalty = 0;
  for (const [key, term, weight] of SLOP_TERMS) { const count = countTerm(text, term); if (count > 0) { hits[key] = count; penalty += count * weight; } }
  const paragraphs = text.split("\n\n").map((x) => x.trim()).filter(Boolean);
  const shortRatio = paragraphs.length ? paragraphs.filter((p) => p.length < 70).length / paragraphs.length : 0;
  if (paragraphs.length >= 6 && shortRatio > 0.7) penalty += 4;
  return { score: Math.max(0, Math.min(100, 100 - penalty)), hits, paragraph_count: paragraphs.length };
}
function normalizeUsage(body: any, def: ModelDef) {
  const u = body?.usage ?? {};
  const prompt = Number(u.prompt_tokens ?? u.input_tokens ?? 0) || 0;
  const completion = Number(u.completion_tokens ?? u.output_tokens ?? 0) || 0;
  const providerCost = typeof u.cost === "number" ? u.cost : null;
  const calculatedCost = def.inputPerM != null && def.outputPerM != null
    ? (prompt / 1_000_000) * def.inputPerM + (completion / 1_000_000) * def.outputPerM
    : null;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: Number(u.total_tokens ?? prompt + completion) || 0, cost: providerCost ?? calculatedCost };
}

async function callModel(modelKey: string, system: string, prompt: string, maxTokens: number, temperature: number) {
  const def = MODEL_CATALOG[modelKey]; const started = performance.now();
  try {
    let url: string; let headers: Record<string, string>; let payloadModel: string;
    if (def.transport === "openai") {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new Error("OPENAI_API_KEY_missing");
      url = "https://api.openai.com/v1/chat/completions";
      headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
      payloadModel = modelKey.replace(/^openai\//, "");
    } else {
      const key = Deno.env.get("OPENROUTER_API_KEY");
      if (!key) throw new Error("OPENROUTER_API_KEY_missing");
      url = "https://openrouter.ai/api/v1/chat/completions";
      headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://articulate.app", "X-Title": "Articulate Model Lab" };
      payloadModel = modelKey;
    }
    const requestBody: any = {
      model: payloadModel,
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      max_completion_tokens: maxTokens,
    };
    if (!payloadModel.startsWith("gpt-5")) requestBody.temperature = temperature;
    if (def.transport === "openrouter") {
      delete requestBody.max_completion_tokens; requestBody.max_tokens = maxTokens;
      requestBody.temperature = temperature;
      requestBody.usage = { include: true };
      requestBody.provider = { sort: "price", allow_fallbacks: true, data_collection: "deny" };
    }
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(requestBody), signal: AbortSignal.timeout(120000) });
    const raw = await resp.text(); let data: any = null; try { data = JSON.parse(raw); } catch { data = { raw }; }
    if (!resp.ok) return { model: modelKey, label: def.label, ok: false, status: resp.status, latency_ms: Math.round(performance.now() - started), error: data?.error ?? raw.slice(0, 500) };
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
    return { model: modelKey, label: def.label, ok: true, latency_ms: Math.round(performance.now() - started), usage: normalizeUsage(data, def), anti_slop: antiSlop(text), output: text };
  } catch (error: any) {
    return { model: modelKey, label: def.label, ok: false, latency_ms: Math.round(performance.now() - started), error: error?.message ?? String(error) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Use POST", { status: 405, headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? "").trim();
  const system = String(body?.system ?? "You are a precise editorial assistant. Follow the user's requested language and constraints.").trim();
  const models = (Array.isArray(body?.models) ? body.models : [body?.model]).map((x: unknown) => String(x ?? "").trim()).filter((x: string) => Boolean(MODEL_CATALOG[x])).slice(0, 6);
  if (!prompt) return new Response(JSON.stringify({ ok: false, error: "prompt_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!models.length) return new Response(JSON.stringify({ ok: false, error: "supported_model_required", catalog: MODEL_CATALOG }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const maxTokens = Math.max(64, Math.min(8000, Number(body?.max_tokens ?? 1600) || 1600));
  const temperature = Math.max(0, Math.min(1.5, Number(body?.temperature ?? 0.4) || 0.4));
  const results = await Promise.all(models.map((model: string) => callModel(model, system, prompt, maxTokens, temperature)));
  return new Response(JSON.stringify({ ok: true, results, catalog: MODEL_CATALOG }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
