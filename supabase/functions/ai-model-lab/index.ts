import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL_CATALOG: Record<string, { label: string; family: string }> = {
  "deepseek/deepseek-v4-flash": { label: "DeepSeek V4 Flash", family: "deepseek" },
  "minimax/minimax-m3": { label: "MiniMax M3", family: "minimax" },
  "qwen/qwen3-max": { label: "Qwen3 Max", family: "qwen" },
  "moonshotai/kimi-k3": { label: "Kimi K3", family: "moonshot" },
};

const SLOP_TERMS = [
  ["generic_world", "num mundo", 8],
  ["generic_world_en", "in a world", 8],
  ["increasingly", "cada vez mais", 4],
  ["fundamental_role", "papel fundamental", 5],
  ["crucial_role", "crucial role", 5],
  ["in_conclusion", "em conclusão", 5],
  ["in_conclusion_en", "in conclusion", 5],
  ["delve", "delve", 6],
  ["landscape", "ever-evolving landscape", 6],
  ["unlock", "unlock", 5],
  ["seamless", "seamless", 3],
  ["de_forma_a", "de forma a", 3],
] as const;

function countTerm(text: string, term: string) {
  const haystack = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  let count = 0;
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return count;
    count += 1;
    from = idx + needle.length;
  }
}

function antiSlop(text: string) {
  const hits: Record<string, number> = {};
  let penalty = 0;
  for (const [key, term, weight] of SLOP_TERMS) {
    const count = countTerm(text, term);
    if (count > 0) {
      hits[key] = count;
      penalty += count * weight;
    }
  }
  const paragraphs = text.split("\n\n").map((x) => x.trim()).filter(Boolean);
  const shortParagraphRatio = paragraphs.length
    ? paragraphs.filter((p) => p.length < 70).length / paragraphs.length
    : 0;
  if (paragraphs.length >= 6 && shortParagraphRatio > 0.7) penalty += 4;
  return {
    score: Math.max(0, Math.min(100, 100 - penalty)),
    hits,
    paragraph_count: paragraphs.length,
  };
}

function usageFrom(body: any) {
  const usage = body?.usage ?? {};
  return {
    prompt_tokens: Number(usage.prompt_tokens ?? 0) || 0,
    completion_tokens: Number(usage.completion_tokens ?? 0) || 0,
    total_tokens: Number(usage.total_tokens ?? 0) || 0,
    cost: typeof usage.cost === "number" ? usage.cost : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Use POST", { status: 405, headers: corsHeaders });

  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({
      ok: false,
      error: "OPENROUTER_API_KEY_missing",
      message: "Add OPENROUTER_API_KEY to Supabase Edge Function secrets before running model benchmarks.",
      catalog: MODEL_CATALOG,
    }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? "").trim();
  const system = String(body?.system ?? "You are a precise editorial assistant. Follow the user's requested language and constraints.").trim();
  const models = (Array.isArray(body?.models) ? body.models : [body?.model])
    .map((x: unknown) => String(x ?? "").trim())
    .filter((x: string) => Boolean(MODEL_CATALOG[x]))
    .slice(0, 4);

  if (!prompt) {
    return new Response(JSON.stringify({ ok: false, error: "prompt_required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!models.length) {
    return new Response(JSON.stringify({ ok: false, error: "supported_model_required", catalog: MODEL_CATALOG }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const maxTokens = Math.max(64, Math.min(8000, Number(body?.max_tokens ?? 1600) || 1600));
  const temperature = Math.max(0, Math.min(1.5, Number(body?.temperature ?? 0.4) || 0.4));

  const results = await Promise.all(models.map(async (model: string) => {
    const started = performance.now();
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://articulate.app",
          "X-Title": "Articulate Model Lab",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature,
          usage: { include: true },
          provider: {
            sort: "price",
            allow_fallbacks: true,
            data_collection: "deny",
          },
        }),
        signal: AbortSignal.timeout(120000),
      });

      const raw = await resp.text();
      let data: any = null;
      try { data = JSON.parse(raw); } catch { data = { raw }; }
      if (!resp.ok) {
        return {
          model,
          label: MODEL_CATALOG[model].label,
          ok: false,
          status: resp.status,
          latency_ms: Math.round(performance.now() - started),
          error: data?.error ?? raw.slice(0, 500),
        };
      }

      const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
      return {
        model,
        label: MODEL_CATALOG[model].label,
        ok: true,
        latency_ms: Math.round(performance.now() - started),
        usage: usageFrom(data),
        anti_slop: antiSlop(text),
        output: text,
      };
    } catch (error: any) {
      return {
        model,
        label: MODEL_CATALOG[model].label,
        ok: false,
        latency_ms: Math.round(performance.now() - started),
        error: error?.message ?? String(error),
      };
    }
  }));

  return new Response(JSON.stringify({ ok: true, results, catalog: MODEL_CATALOG }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});
