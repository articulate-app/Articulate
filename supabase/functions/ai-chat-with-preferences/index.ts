import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function positiveInt(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function resolveExplicitProjectId(body: any): number | null {
  const direct = positiveInt(body?.scope?.project_id ?? body?.project_id);
  if (direct) return direct;

  const tagged = Array.isArray(body?.tagged_project_ids)
    ? body.tagged_project_ids.map(positiveInt).find(Boolean)
    : null;
  if (tagged) return tagged as number;

  const target = (Array.isArray(body?.targets) ? body.targets : []).find((item: any) =>
    String(item?.target_kind ?? "") === "project" && positiveInt(item?.project_id),
  );
  return positiveInt(target?.project_id);
}

function learnedPreferencePrompt(preferences: any[]): string {
  const rows = (Array.isArray(preferences) ? preferences : [])
    .filter((item) => item && typeof item.rule === "string" && item.rule.trim())
    .slice(0, 16)
    .map((item) => `- ${item.rule.trim()}`);
  if (!rows.length) return "";
  return [
    "[ARTICULATE_LEARNED_PREFERENCES_V1]",
    "LEARNED PREFERENCES — durable style/output preferences learned from prior feedback. They are not factual project knowledge.",
    "Apply them only when relevant. The CURRENT USER REQUEST below always overrides any learned preference. Current factual/project context also overrides memory for facts.",
    ...rows,
    "[/ARTICULATE_LEARNED_PREFERENCES_V1]",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Use POST", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return new Response(JSON.stringify({ error: { code: "authorization_required" } }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const body = await req.json().catch(() => ({}));
  const originalMessage = String(body?.message ?? "").trim();
  const displayMessage = String(body?.display_message ?? originalMessage).trim() || originalMessage;
  const threadId = typeof body?.thread_id === "string" ? body.thread_id : null;

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let projectId = resolveExplicitProjectId(body);
  if (!projectId && threadId) {
    const { data: thread } = await userClient
      .from("ai_threads")
      .select("project_id")
      .eq("id", threadId)
      .maybeSingle();
    projectId = positiveInt(thread?.project_id);
  }

  let preferences: any[] = [];
  const { data: preferenceData, error: preferenceError } = await userClient.rpc("ai_get_preference_context_v1", {
    p_project_id: projectId,
    p_limit: 16,
  });
  if (preferenceError) {
    console.warn("ai-chat-with-preferences preference lookup failed", { error: preferenceError.message, project_id: projectId });
  } else {
    preferences = Array.isArray(preferenceData?.preferences) ? preferenceData.preferences : [];
  }

  const preferencePrompt = learnedPreferencePrompt(preferences);
  const forwardedBody = {
    ...body,
    ...(preferencePrompt && originalMessage
      ? {
          message: `${preferencePrompt}\n\nCURRENT USER REQUEST:\n${originalMessage}`,
          display_message: displayMessage,
        }
      : {}),
  };

  const headers = new Headers();
  headers.set("Authorization", authHeader);
  headers.set("Content-Type", "application/json");
  const apiKey = req.headers.get("apikey");
  if (apiKey) headers.set("apikey", apiKey);
  const clientInfo = req.headers.get("x-client-info");
  if (clientInfo) headers.set("x-client-info", clientInfo);
  const runId = req.headers.get("x-ai-run-id");
  if (runId) headers.set("x-ai-run-id", runId);

  const upstream = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(forwardedBody),
    signal: req.signal,
  });

  const responseHeaders = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(corsHeaders)) responseHeaders.set(key, value);
  responseHeaders.set("Cache-Control", upstream.headers.get("Cache-Control") || "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
});
