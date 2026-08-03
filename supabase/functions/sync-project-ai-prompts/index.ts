// supabase/functions/sync-project-ai-prompts/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProjectAiPrompt = {
  id: number;
  project_id: number;
  prompt_text: string;
  language_code: string | null;
};

type Project = {
  id: number;
  name: string | null;
  project_url: string | null;
};

type PromptToolRow = {
  project_ai_prompt_id: number;
  ai_tools: {
    id: number;
    code: string;
    name: string;
  } | null;
};

type RankedEntity = {
  position: number;
  name: string;
  url: string | null;
  snippet: string | null;
};

type AiResult = {
  fullResponse: string;
  rankedEntities: RankedEntity[];
  brandPosition: number | null;
  brandName: string | null;
  brandUrl: string | null;
  metadata?: Record<string, unknown>;
};

function normalizeHostname(urlOrHost: string | null | undefined): string | null {
  if (!urlOrHost) return null;
  const raw = urlOrHost.trim().toLowerCase();
  if (!raw) return null;
  try {
    const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
    let host = new URL(withProtocol).hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    let host = raw.replace(/^https?:\/\//, "").split("/")[0] ?? "";
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  }
}

function registrableLabel(hostname: string | null | undefined): string | null {
  const host = normalizeHostname(hostname);
  if (!host) return null;
  const parts = host.split(".").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0] ?? null;
  const multiPartSuffixes = new Set(["co.uk", "com.br", "com.pt", "org.uk"]);
  const lastTwo = parts.slice(-2).join(".");
  if (multiPartSuffixes.has(lastTwo) && parts.length >= 3) {
    return parts[parts.length - 3] ?? null;
  }
  return parts[parts.length - 2] ?? null;
}

function normalizeBrandName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainsLooselyMatch(
  projectDomain: string | null | undefined,
  entityUrl: string | null | undefined,
): boolean {
  const projectHost = normalizeHostname(projectDomain);
  const entityHost = normalizeHostname(entityUrl);
  if (!projectHost || !entityHost) return false;
  if (entityHost === projectHost) return true;
  if (entityHost.endsWith(`.${projectHost}`) || projectHost.endsWith(`.${entityHost}`)) {
    return true;
  }
  const projectLabel = registrableLabel(projectHost);
  const entityLabel = registrableLabel(entityHost);
  if (projectLabel && entityLabel && projectLabel === entityLabel) return true;
  if (
    projectLabel &&
    entityLabel &&
    (projectLabel.includes(entityLabel) || entityLabel.includes(projectLabel)) &&
    Math.min(projectLabel.length, entityLabel.length) >= 6
  ) {
    return true;
  }
  return false;
}

function brandNamesLooselyMatch(
  projectName: string | null | undefined,
  entityName: string | null | undefined,
): boolean {
  const a = normalizeBrandName(projectName);
  const b = normalizeBrandName(entityName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(" ").filter((t) => t.length >= 4));
  const bTokens = b.split(" ").filter((t) => t.length >= 4);
  return bTokens.some((t) =>
    aTokens.has(t) || [...aTokens].some((at) => at.includes(t) || t.includes(at))
  );
}

function findBrandInRankedEntities(
  entities: RankedEntity[],
  match: { projectDomain?: string | null; projectName?: string | null },
): RankedEntity | null {
  for (const ent of entities) {
    if (domainsLooselyMatch(match.projectDomain, ent.url)) return ent;
  }
  for (const ent of entities) {
    if (brandNamesLooselyMatch(match.projectName, ent.name)) return ent;
  }
  const label = registrableLabel(match.projectDomain);
  if (label) {
    for (const ent of entities) {
      if (brandNamesLooselyMatch(label, ent.name)) return ent;
    }
  }
  return null;
}

async function runPromptOnChatGPT(
  promptText: string,
  languageCode: string | null,
  projectDomain: string | null,
  projectName: string | null,
): Promise<AiResult> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const systemPrompt = `
Você é um assistente de marketing que responde com JSON estruturado.
Dado um pedido de utilizador, gera uma lista ordenada dos 10 principais "marcas/empresas/sites" que recomendarias
para esse pedido, com pela ordem em que surgiriam na tua resposta normal.

Responde APENAS com JSON, no seguinte formato:

{
  "entities": [
    {
      "position": 1,
      "name": "Nome da marca",
      "url": "https://...",
      "snippet": "Descrição curta ou contexto"
    }
  ]
}

Não incluas texto fora do JSON.
  `.trim();

  const userPrompt = `
Idioma do utilizador (opcional): ${languageCode ?? "desconhecido"}.

Pedido do utilizador:
"${promptText}"
  `.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("OpenAI error:", response.status, text);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const fullText: string =
    data.choices?.[0]?.message?.content ?? JSON.stringify(data);

  let parsed: any;
  try {
    parsed = JSON.parse(fullText);
  } catch {
    console.warn("Failed to parse JSON from ChatGPT, storing raw response.");
    parsed = { entities: [] };
  }

  const entitiesRaw = Array.isArray(parsed.entities) ? parsed.entities : [];
  const rankedEntities: RankedEntity[] = entitiesRaw.map((e: any) => ({
    position: Number(e.position) || 0,
    name: String(e.name ?? ""),
    url: e.url ? String(e.url) : null,
    snippet: e.snippet ? String(e.snippet) : null,
  }));

  const matched = findBrandInRankedEntities(rankedEntities, {
    projectDomain,
    projectName,
  });

  return {
    fullResponse: fullText,
    rankedEntities,
    brandPosition: matched?.position ?? null,
    brandName: matched?.name ?? null,
    brandUrl: matched?.url ?? null,
    metadata: {
      model: "gpt-4.1-mini",
      matchStrategy: matched ? "domain_or_name" : "none",
    },
  };
}

async function runPromptOnTool(
  toolCode: string,
  promptText: string,
  languageCode: string | null,
  projectDomain: string | null,
  projectName: string | null,
): Promise<AiResult> {
  switch (toolCode) {
    case "CHATGPT":
      return await runPromptOnChatGPT(
        promptText,
        languageCode,
        projectDomain,
        projectName,
      );
    case "GEMINI":
      throw new Error("GEMINI tool not implemented yet");
    default:
      throw new Error(`Unsupported AI tool: ${toolCode}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const projectIdFilter = body?.project_id as number | undefined;

    let promptsQuery = supabaseAdmin
      .from("project_ai_prompts")
      .select("id, project_id, prompt_text, language_code")
      .eq("is_active", true) as any;

    if (projectIdFilter) {
      promptsQuery = promptsQuery.eq("project_id", projectIdFilter);
    }

    const { data: prompts, error: promptsError } = await promptsQuery;
    if (promptsError) throw promptsError;
    if (!prompts || prompts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active AI prompts to sync" }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const promptIds = Array.from(
      new Set((prompts as ProjectAiPrompt[]).map((p) => p.id)),
    );
    const projectIds = Array.from(
      new Set((prompts as ProjectAiPrompt[]).map((p) => p.project_id)),
    );

    const { data: promptTools, error: ptError } = await supabaseAdmin
      .from("project_ai_prompt_tools")
      .select("project_ai_prompt_id, ai_tools(id, code, name)")
      .in("project_ai_prompt_id", promptIds)
      .eq("is_deleted", false);

    if (ptError) throw ptError;

    const promptToolMap = new Map<number, PromptToolRow[]>();
    (promptTools ?? []).forEach((row: any) => {
      const arr = promptToolMap.get(row.project_ai_prompt_id) ?? [];
      arr.push(row);
      promptToolMap.set(row.project_ai_prompt_id, arr);
    });

    const { data: projects, error: projError } = await supabaseAdmin
      .from("projects")
      .select("id, name, project_url")
      .in("id", projectIds);

    if (projError) throw projError;

    const projectMetaMap = new Map<
      number,
      { domain: string | null; name: string | null }
    >();
    (projects ?? []).forEach((p: Project) => {
      projectMetaMap.set(p.id, {
        domain: normalizeHostname(p.project_url),
        name: p.name ?? null,
      });
    });

    let processed = 0;
    const errors: any[] = [];

    for (const prompt of prompts as ProjectAiPrompt[]) {
      const meta = projectMetaMap.get(prompt.project_id) ?? {
        domain: null,
        name: null,
      };
      const toolsForPrompt = promptToolMap.get(prompt.id) ?? [];

      if (toolsForPrompt.length === 0) {
        console.warn(`Prompt ${prompt.id} has no tools configured, skipping.`);
        continue;
      }

      for (const ptRow of toolsForPrompt as PromptToolRow[]) {
        const tool = ptRow.ai_tools;
        if (!tool) continue;

        try {
          const result = await runPromptOnTool(
            tool.code,
            prompt.prompt_text,
            prompt.language_code,
            meta.domain,
            meta.name,
          );

          const { error: insertError } = await supabaseAdmin
            .from("project_ai_prompt_results")
            .insert({
              project_ai_prompt_id: prompt.id,
              ai_tool_id: tool.id,
              run_at: new Date().toISOString(),
              brand_position: result.brandPosition,
              brand_url: result.brandUrl,
              brand_name: result.brandName,
              full_response: result.fullResponse,
              ranked_entities: result.rankedEntities,
              metadata: result.metadata ?? {},
            });

          if (insertError) {
            console.error(
              `Insert error for prompt=${prompt.id}, tool=${tool.code}`,
              insertError,
            );
            errors.push({
              prompt_id: prompt.id,
              tool_code: tool.code,
              error: insertError.message ?? String(insertError),
            });
          } else {
            processed++;
          }
        } catch (e) {
          console.error(
            `Error running AI for prompt=${prompt.id}, tool=${tool.code}`,
            e,
          );
          errors.push({
            prompt_id: prompt.id,
            tool_code: tool.code,
            error: String(e),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "AI prompt sync completed",
        processed,
        total_prompts: prompts.length,
        errors,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (e) {
    console.error("sync-project-ai-prompts error", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
