import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-build-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function uuidOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

/** Pure image/video types always go to the media worker. */
const ALWAYS_MEDIA_TYPES = new Set([
  "image", "images", "illustration", "photo", "visual",
  "video", "video_clip", "motion", "animation",
  "mixed", "document_with_images", "article_with_images",
]);

/**
 * Carousel / storyboard / presentation are usually text deliverables
 * (copy + slide script). Only route to the media worker when the plan
 * explicitly includes media_items or the instruction asks to generate visuals.
 */
const CONDITIONAL_MEDIA_TYPES = new Set([
  "carousel", "storyboard", "presentation",
]);

function hasExplicitMediaItems(unit: any): boolean {
  const spec = unit?.input_snapshot?.artifact_spec ?? {};
  const items = Array.isArray(spec?.media_items)
    ? spec.media_items
    : Array.isArray(spec?.metadata?.media_items)
      ? spec.metadata.media_items
      : null;
  return Array.isArray(items) && items.length > 0;
}

function instructionRequestsGeneratedVisuals(unit: any): boolean {
  const text = [
    unit?.instruction,
    unit?.input_snapshot?.artifact_spec?.instruction,
    unit?.input_snapshot?.request_text,
  ].filter(Boolean).join("\n");
  return /\b(gerar|generate|criar|create|desenhar|illustrat|imagem|imagens|image|images|visual|artwork|slides?\s+visuais?|ai[\s-]?image)\b/i.test(text)
    && /\b(imagem|imagens|image|images|visual|foto|illustration|artwork|slide\s+art)\b/i.test(text);
}

function resolveWorkerFunction(unit: any): string {
  const artifactType = String(unit?.input_snapshot?.artifact_spec?.artifact_type ?? "")
    .trim()
    .toLowerCase();
  if (ALWAYS_MEDIA_TYPES.has(artifactType)) return "ai-media-artifact-worker";
  if (
    CONDITIONAL_MEDIA_TYPES.has(artifactType)
    && (hasExplicitMediaItems(unit) || instructionRequestsGeneratedVisuals(unit))
  ) {
    return "ai-media-artifact-worker";
  }
  return "ai-artifact-worker";
}

async function dispatchWorker(args: {
  authorization: string;
  buildId: string;
  unit: any;
  supabase: any;
}) {
  const unitType = String(args.unit?.unit_type ?? "").trim().toLowerCase();
  if (unitType !== "artifact") {
    const message = `Unsupported work unit type: ${unitType || "missing"}. The orchestrator is artifact-only.`;
    const { error: completeError } = await args.supabase.rpc("ai_complete_build_work_unit_v1", {
      p_build_id: args.buildId,
      p_unit_id: args.unit.id,
      p_lease_token: args.unit.lease_token,
      p_status: "failed",
      p_result: { saved: [], failed: [{ error: "unsupported_work_unit_type", message }], saved_count: 0, failed_count: 1 },
      p_usage: {},
      p_error_code: "unsupported_work_unit_type",
      p_error_message: message,
    });
    if (completeError) console.error("ai-build-orchestrator unsupported unit completion failed", completeError.message);
    return;
  }

  const workerFunction = resolveWorkerFunction(args.unit);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${workerFunction}`, {
    method: "POST",
    headers: {
      Authorization: args.authorization,
      "Content-Type": "application/json",
      "X-AI-Build-Id": args.buildId,
    },
    body: JSON.stringify({
      build_id: args.buildId,
      unit_id: args.unit.id,
      lease_token: args.unit.lease_token,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("ai-build-orchestrator worker dispatch failed", {
      build_id: args.buildId,
      unit_id: args.unit.id,
      status: response.status,
      detail: detail.slice(0, 1000),
      worker_function: workerFunction,
      unit_type: args.unit?.unit_type ?? null,
    });
    const errorCode = `worker_dispatch_http_${response.status}`;
    const errorMessage = detail.slice(0, 1000) || "The worker dispatch did not complete.";
    // 546 / WORKER_RESOURCE_LIMIT is usually parallel memory pressure on the
    // Edge isolate (~256MB), not a permanently fatal unit. Degrade the build
    // toward sequential dispatch and requeue so the queue can drain safely.
    const isResourceLimit =
      response.status === 546
      || /WORKER_RESOURCE_LIMIT|not having enough compute resources/i.test(detail);
    if (isResourceLimit) {
      const { data: degrade, error: degradeError } = await args.supabase.rpc(
        "ai_degrade_build_concurrency_v1",
        {
          p_build_id: args.buildId,
          p_target: 1,
          p_reason: "worker_resource_limit",
        },
      );
      if (degradeError) {
        console.warn("ai-build-orchestrator concurrency degrade skipped", degradeError.message);
      } else {
        console.warn("ai-build-orchestrator concurrency degraded for resource limit", {
          build_id: args.buildId,
          unit_id: args.unit.id,
          previous_concurrency_limit: degrade?.previous_concurrency_limit ?? null,
          concurrency_limit: degrade?.concurrency_limit ?? 1,
        });
      }

      const { error: requeueError } = await args.supabase.rpc("ai_requeue_build_work_unit_v1", {
        p_build_id: args.buildId,
        p_unit_id: args.unit.id,
        p_lease_token: args.unit.lease_token,
        p_error_code: errorCode,
        p_error_message: errorMessage,
        p_usage: {},
      });
      if (requeueError) {
        // Lease may already be terminal, or retries exhausted (requeue RPC fails
        // the unit itself when attempt >= max_attempts).
        console.warn("ai-build-orchestrator resource-limit requeue skipped", requeueError.message);
      }
      return;
    }
    const { error: requeueError } = await args.supabase.rpc("ai_requeue_build_work_unit_v1", {
      p_build_id: args.buildId,
      p_unit_id: args.unit.id,
      p_lease_token: args.unit.lease_token,
      p_error_code: errorCode,
      p_error_message: errorMessage,
      p_usage: {},
    });
    // A worker can finish the unit before its non-2xx response reaches the
    // orchestrator. In that case the lease is already terminal and requeue is
    // expected to fail harmlessly.
    if (requeueError) console.warn("ai-build-orchestrator dispatch requeue skipped", requeueError.message);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: { code: "authentication_required" } }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const buildId = uuidOrNull((body as any).build_id ?? url.searchParams.get("build_id") ?? request.headers.get("X-AI-Build-Id"));
    if (!buildId) return json({ error: { code: "build_id_required" } }, 400);

    if (request.method === "GET") {
      const afterSequence = Math.max(0, Number(url.searchParams.get("after_sequence") ?? 0) || 0);
      const { data, error } = await supabase.rpc("ai_get_orchestrated_build_v1", {
        p_build_id: buildId,
        p_after_sequence: afterSequence,
        p_event_limit: 500,
      });
      if (error) return json({ error: { code: "build_read_failed", message: error.message } }, 403);
      return json(data, 200, { "X-AI-Build-Id": buildId });
    }

    const action = String((body as any).action ?? "pump");
    if (action === "cancel") {
      const { data, error } = await supabase.rpc("ai_cancel_orchestrated_build_v1", {
        p_build_id: buildId,
        p_reason: String((body as any).reason ?? "User cancelled the build.").slice(0, 1000),
      });
      if (error) return json({ error: { code: "build_cancel_failed", message: error.message } }, 409);
      return json(data, 200, { "X-AI-Build-Id": buildId });
    }
    if (action !== "pump") return json({ error: { code: "unsupported_action" } }, 400);

    const { data: claim, error: claimError } = await supabase.rpc("ai_claim_build_work_units_v1", {
      p_build_id: buildId,
      p_limit: Math.max(1, Math.min(Number((body as any).limit ?? 8) || 8, 8)),
      // Image generation often takes 45–90s per slide; give media units more headroom.
      p_lease_seconds: 600,
    });
    if (claimError) return json({ error: { code: "build_claim_failed", message: claimError.message } }, 409);

    const claimed = Array.isArray(claim?.claimed) ? claim.claimed : [];
    const dispatch = Promise.allSettled(claimed.map((unit: any) => dispatchWorker({
      authorization,
      buildId,
      unit,
      supabase,
    })));
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(dispatch);
    else await dispatch;

    const { data: snapshot, error: snapshotError } = await supabase.rpc("ai_get_orchestrated_build_v1", {
      p_build_id: buildId,
      p_after_sequence: 0,
      p_event_limit: 200,
    });
    if (snapshotError) return json({ error: { code: "build_read_failed", message: snapshotError.message } }, 409);

    return json({
      ...snapshot,
      dispatch: { claimed_count: claimed.length, terminal: claim?.terminal === true },
    }, 202, { "X-AI-Build-Id": buildId });
  } catch (error: any) {
    console.error("ai-build-orchestrator failed", error);
    return json({ error: { code: "orchestrator_failed", message: error?.message ?? String(error) } }, 500);
  }
});
