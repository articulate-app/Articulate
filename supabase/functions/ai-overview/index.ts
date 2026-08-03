import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Secrets:
 * - DATAFORSEO_ID
 * - DATAFORSEO_SECRET
 *
 * Fetches Google AI Overview for a prompt/keyword via Organic SERP live/advanced.
 * Intended as a non-blocking second phase after ChatGPT prompt research.
 */

const DATAFORSEO_ORGANIC_URL =
  "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

const DEFAULT_LOCATION_CODE = 2620;
const DEFAULT_LANGUAGE_CODE = "pt";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RankedEntity = {
  position: number;
  name: string;
  url: string | null;
  snippet: string | null;
};

type AiOverviewRequest = {
  prompt?: string;
  keyword?: string;
  languageCode?: string | null;
  regionId?: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toBasicAuthHeader(login: string, password: string): string {
  return `Basic ${btoa(`${login}:${password}`)}`;
}

function resolveLanguageCode(languageCode?: string | null): string {
  if (!languageCode?.trim()) return DEFAULT_LANGUAGE_CODE;
  const t = languageCode.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(t)) return t;
  return DEFAULT_LANGUAGE_CODE;
}

function resolveLocationCode(
  languageCode: string,
  regionId?: string | null,
): number {
  if (regionId && /^\d+$/.test(regionId.trim())) return Number(regionId.trim());
  if (languageCode === "es") return 2724;
  if (languageCode === "fr") return 2250;
  if (languageCode === "de") return 2276;
  if (languageCode === "en") return 2840;
  if (languageCode === "pt") return 2620;
  return DEFAULT_LOCATION_CODE;
}

function truncateText(value: string, max = 700): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}…`;
}

function stripMarkdownNoise(value: string): string {
  let text = value;
  text = text.replace(/\[\[\d+\]\]\([^)]+\)/g, "");
  text = text.replace(/\[\d+\]\([^)]+\)/g, "");
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, "");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/(https?:\/\/[^\s)\]]+)/gi, " ");
  text = text.replace(/www\.[^\s)\]]+/gi, " ");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/[*_`~]+/g, "");
  text = text.replace(/\[\d+\]/g, "");
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .replace(/([.!?…])([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, "$1 $2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
  return text;
}

function parseEntities(overview: Record<string, unknown> | null): RankedEntity[] {
  if (!overview) return [];
  const seen = new Set<string>();
  const entities: RankedEntity[] = [];

  const push = (args: {
    name?: string | null;
    url?: string | null;
    snippet?: string | null;
  }) => {
    const name = (args.name || "").trim();
    const url = args.url?.trim() || null;
    if (!name && !url) return;
    const key = (url || name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    entities.push({
      position: entities.length + 1,
      name: name || url || "Source",
      url,
      snippet: args.snippet?.trim() || null,
    });
  };

  const refs = Array.isArray(overview.references) ? overview.references : [];
  for (const raw of refs) {
    const ref = (raw ?? {}) as Record<string, unknown>;
    push({
      name: String(ref.source || ref.title || ref.domain || ""),
      url: ref.url ? String(ref.url) : null,
      snippet: ref.text ? String(ref.text) : null,
    });
  }

  const elements = Array.isArray(overview.items) ? overview.items : [];
  for (const rawEl of elements) {
    const element = (rawEl ?? {}) as Record<string, unknown>;
    const elementRefs = Array.isArray(element.references) ? element.references : [];
    for (const raw of elementRefs) {
      const ref = (raw ?? {}) as Record<string, unknown>;
      push({
        name: String(ref.source || ref.title || ref.domain || ""),
        url: ref.url ? String(ref.url) : null,
        snippet: ref.text
          ? String(ref.text)
          : element.text
            ? String(element.text)
            : null,
      });
    }
    const links = Array.isArray(element.links) ? element.links : [];
    for (const raw of links) {
      const link = (raw ?? {}) as Record<string, unknown>;
      push({
        name: String(link.title || link.text || ""),
        url: link.url ? String(link.url) : null,
        snippet: element.text ? String(element.text) : null,
      });
    }
  }

  return entities.slice(0, 12);
}

function buildSummary(overview: Record<string, unknown> | null): string {
  if (!overview) return "";

  const parts: string[] = [];
  for (const raw of Array.isArray(overview.items) ? overview.items : []) {
    const element = (raw ?? {}) as Record<string, unknown>;
    const title =
      typeof element.title === "string" && element.title.trim()
        ? stripMarkdownNoise(element.title)
        : "";
    const body =
      typeof element.text === "string" && element.text.trim()
        ? stripMarkdownNoise(element.text)
        : typeof element.markdown === "string" && element.markdown.trim()
          ? stripMarkdownNoise(element.markdown)
          : "";
    if (title && body) parts.push(`${title}. ${body}`);
    else if (body) parts.push(body);
    else if (title) parts.push(title);
  }

  const fromElements = parts.filter(Boolean).join("\n\n").trim();
  if (fromElements) return truncateText(fromElements, 900);

  if (typeof overview.markdown === "string" && overview.markdown.trim()) {
    return truncateText(stripMarkdownNoise(overview.markdown), 900);
  }
  return "";
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
    const login = Deno.env.get("DATAFORSEO_ID")?.trim();
    const password = Deno.env.get("DATAFORSEO_SECRET")?.trim();
    if (!login || !password) {
      return json(
        {
          error: {
            code: 500,
            message: "DATAFORSEO_ID / DATAFORSEO_SECRET not configured",
          },
        },
        500,
      );
    }

    const body = (await req.json()) as AiOverviewRequest;
    const prompt = String(body.prompt || body.keyword || "").trim();
    if (!prompt) {
      return json({ error: { code: 400, message: "Prompt is required" } }, 400);
    }

    const languageCode = resolveLanguageCode(body.languageCode);
    const locationCode = resolveLocationCode(languageCode, body.regionId);

    const response = await fetch(DATAFORSEO_ORGANIC_URL, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(login, password),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword: prompt,
          location_code: locationCode,
          language_code: languageCode,
          device: "desktop",
          os: "windows",
          depth: 10,
          load_async_ai_overview: true,
        },
      ]),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const text = await response.text();
      return json(
        {
          error: {
            code: response.status,
            message: `DataForSEO error: ${response.status}`,
            details: text,
          },
        },
        response.status,
      );
    }

    const payload = await response.json();
    const task = payload?.tasks?.[0];
    if (!task || (task.status_code && task.status_code !== 20000)) {
      return json({
        elapsedMs: Date.now() - started,
        prompt,
        languageCode,
        answerSummary: "",
        results: [],
        relatedPrompts: [],
        present: false,
        metadata: {
          toolCode: "google_ai_overview",
          toolName: "Google AI Overview",
          locationCode,
          languageCode,
          status_message: task?.status_message ?? null,
        },
      });
    }

    const result = task.result?.[0];
    const items = Array.isArray(result?.items) ? result.items : [];
    const overview =
      (items.find((item: { type?: string }) => item?.type === "ai_overview") as
        | Record<string, unknown>
        | undefined) ?? null;

    const results = parseEntities(overview);
    const answerSummary = buildSummary(overview);
    const present = Boolean(answerSummary || results.length);

    return json({
      elapsedMs: Date.now() - started,
      prompt,
      languageCode,
      answerSummary,
      results,
      relatedPrompts: [],
      present,
      checkUrl: result?.check_url ?? null,
      fullResponse: overview?.markdown ?? null,
      metadata: {
        toolCode: "google_ai_overview",
        toolName: "Google AI Overview",
        locationCode,
        languageCode,
        asynchronous: overview?.asynchronous_ai_overview ?? null,
        cost: task.cost ?? null,
      },
    });
  } catch (error) {
    console.error("ai-overview error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: { code: 500, message } }, 500);
  }
});
