import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Secrets: OPENAI_API_KEY
 *
 * Research a single AI prompt: returns ranked brand/entities + related prompt suggestions.
 * Used by the Prompt research middle-pane tool (mirrors keyword research discover flow).
 *
 * Source: ChatGPT-style ranking via OpenAI gpt-4.1-mini (not live ChatGPT browsing,
 * Gemini, or Google AI Overviews).
 */

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOOL_META = {
  toolCode: "chatgpt",
  toolName: "ChatGPT",
  model: "gpt-4.1-mini",
} as const;

type RankedEntity = {
  position: number;
  name: string;
  url: string | null;
  snippet: string | null;
};

type PromptResearchRequest = {
  prompt: string;
  languageCode?: string | null;
  /** When true, skip related_prompts to return brands faster. */
  brandsOnly?: boolean;
  /** When true, only return related_prompts (no ranking call). */
  relatedOnly?: boolean;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Failed to parse model JSON");
  }
}

async function callOpenAiJson(args: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TOOL_META.model,
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
      temperature: 0.3,
      max_tokens: args.maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`OpenAI API error: ${response.status}`) as Error & {
      status?: number;
      details?: string;
    };
    err.status = response.status;
    err.details = text;
    throw err;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? JSON.stringify(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: { code: 405, message: "Method not allowed" } }, 405);
  }

  const started = Date.now();

  try {
    if (!OPENAI_API_KEY) {
      return json(
        { error: { code: 500, message: "OPENAI_API_KEY not configured" } },
        500,
      );
    }

    const body = (await req.json()) as PromptResearchRequest;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return json({ error: { code: 400, message: "Prompt is required" } }, 400);
    }

    const languageCode =
      typeof body.languageCode === "string" && body.languageCode.trim()
        ? body.languageCode.trim()
        : "pt";
    const brandsOnly = body.brandsOnly === true;
    const relatedOnly = body.relatedOnly === true;

    const rankingSystem = `
You answer recommendation-style prompts like ChatGPT.
Return ONLY valid JSON:
{
  "entities": [{"position":1,"name":"Brand","url":"https://…|null","snippet":"short why"}],
  "answer_summary": "2-3 sentences"
}
Rules:
- Up to 8 brands/companies/sites in recommendation order.
- Official URLs when known; otherwise null.
- Response language: same language as the user request.
`.trim();

    const relatedSystem = `
Suggest related AI search prompts. Return ONLY valid JSON:
{ "related_prompts": ["…"] }
Rules:
- Exactly 5 prompts, same intent and language as the user request, varied long-tails.
`.trim();

    const userPrompt = `User request:\n"${prompt}"`;

    if (relatedOnly) {
      const relatedText = await callOpenAiJson({
        systemPrompt: relatedSystem,
        userPrompt,
        maxTokens: 350,
      });
      let relatedParsed: Record<string, unknown> = {};
      try {
        relatedParsed = extractJsonObject(relatedText) as Record<string, unknown>;
      } catch (parseError) {
        console.warn("Failed to parse related prompts JSON", parseError);
      }
      const relatedRaw = Array.isArray(relatedParsed.related_prompts)
        ? relatedParsed.related_prompts
        : [];
      const relatedPrompts = relatedRaw
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5);

      return json({
        elapsedMs: Date.now() - started,
        prompt,
        languageCode,
        answerSummary: "",
        results: [],
        relatedPrompts,
        fullResponse: relatedText,
        metadata: {
          ...TOOL_META,
          relatedOnly: true,
        },
      });
    }

    // Parallel: brands first path can skip related; full research runs both together.
    const rankingPromise = callOpenAiJson({
      systemPrompt: rankingSystem,
      userPrompt,
      maxTokens: 900,
    });

    const relatedPromise = brandsOnly
      ? Promise.resolve(null)
      : callOpenAiJson({
          systemPrompt: relatedSystem,
          userPrompt,
          maxTokens: 350,
        });

    const [rankingText, relatedText] = await Promise.all([
      rankingPromise,
      relatedPromise,
    ]);

    let rankingParsed: Record<string, unknown> = {};
    try {
      rankingParsed = extractJsonObject(rankingText) as Record<string, unknown>;
    } catch (parseError) {
      console.warn("Failed to parse prompt-research ranking JSON", parseError);
      rankingParsed = { entities: [], answer_summary: rankingText };
    }

    let relatedParsed: Record<string, unknown> = {};
    if (relatedText) {
      try {
        relatedParsed = extractJsonObject(relatedText) as Record<string, unknown>;
      } catch (parseError) {
        console.warn("Failed to parse related prompts JSON", parseError);
      }
    }

    const entitiesRaw = Array.isArray(rankingParsed.entities)
      ? rankingParsed.entities
      : [];
    const entities: RankedEntity[] = entitiesRaw.map(
      (entry: unknown, index: number) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          position: Number(e.position) || index + 1,
          name: String(e.name ?? "").trim() || "Unknown",
          url: e.url ? String(e.url) : null,
          snippet: e.snippet ? String(e.snippet) : null,
        };
      },
    );

    const relatedRaw = Array.isArray(relatedParsed.related_prompts)
      ? relatedParsed.related_prompts
      : [];
    const relatedPrompts = relatedRaw
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5);

    const answerSummary =
      typeof rankingParsed.answer_summary === "string"
        ? rankingParsed.answer_summary.trim()
        : "";

    return json({
      elapsedMs: Date.now() - started,
      prompt,
      languageCode,
      answerSummary,
      results: entities,
      relatedPrompts,
      fullResponse: rankingText,
      metadata: {
        ...TOOL_META,
        brandsOnly,
      },
    });
  } catch (error) {
    console.error("prompt-research error:", error);
    const err = error as Error & { status?: number; details?: string };
    const message = err?.message || "Unknown error";
    return json(
      {
        error: {
          code: err?.status || 500,
          message,
          details: err?.details,
        },
      },
      err?.status || 500,
    );
  }
});
