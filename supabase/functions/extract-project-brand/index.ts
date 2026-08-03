import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  applyExtractedBrandSource,
  normalizeBrandKitEffective,
  parseProjectBrandKit,
  type BrandKitEffective,
  type ProjectBrandKit,
} from "../_shared/project-brand-kit.ts";

/**
 * Secrets:
 * - FIRECRAWL_API_KEY
 * - FIRECRAWL_BASE_URL (optional, default https://api.firecrawl.dev)
 * - SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *
 * POST body:
 * {
 *   project_id: number
 *   url?: string
 *   replace_all?: boolean  // discard overrides
 *   apply_legacy?: boolean // sync projects.color / projects.logo (default true)
 * }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const FIRECRAWL_BASE_URL = (Deno.env.get("FIRECRAWL_BASE_URL") || "https://api.firecrawl.dev")
  .replace(/\/$/, "");

const PUBLIC_MEDIA_BUCKET = "public-media";
const MAX_MIRROR_BYTES = 2_500_000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-forwarded-for",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ServiceClient = ReturnType<typeof createClient>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "") || url.origin;
  } catch {
    return null;
  }
}

function extensionFromContentType(contentType: string | null, fallbackUrl: string): string {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "image/png") return "png";
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/svg+xml") return "svg";
  if (type === "image/x-icon" || type === "image/vnd.microsoft.icon") return "ico";
  if (type === "image/gif") return "gif";

  try {
    const pathname = new URL(fallbackUrl).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
  } catch {
    // ignore
  }
  return "bin";
}

async function mirrorRemoteImage(args: {
  service: ServiceClient;
  projectId: number;
  kind: "logo" | "favicon";
  remoteUrl: string | null;
}): Promise<string | null> {
  const remoteUrl = toTrimmedString(args.remoteUrl);
  if (!remoteUrl) return null;
  if (!/^https?:\/\//i.test(remoteUrl)) return remoteUrl;

  try {
    const response = await fetch(remoteUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return remoteUrl;

    const contentType = response.headers.get("content-type");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_MIRROR_BYTES) return remoteUrl;

    const ext = extensionFromContentType(contentType, remoteUrl);
    const path =
      `projects/${args.projectId}/brand/${args.kind}-${crypto.randomUUID()}.${ext}`;

    const { error } = await args.service.storage.from(PUBLIC_MEDIA_BUCKET).upload(
      path,
      bytes,
      {
        contentType: contentType?.split(";")[0]?.trim() || `image/${ext}`,
        upsert: true,
      },
    );
    if (error) {
      console.warn("brand image mirror failed", error.message);
      return remoteUrl;
    }
    return path;
  } catch (error) {
    console.warn("brand image mirror error", error);
    return remoteUrl;
  }
}

async function scrapeBranding(url: string): Promise<Record<string, unknown>> {
  if (!FIRECRAWL_API_KEY) {
    throw Object.assign(new Error("FIRECRAWL_API_KEY not configured"), {
      code: "firecrawl_not_configured",
      status: 500,
    });
  }

  const response = await fetch(`${FIRECRAWL_BASE_URL}/v2/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["branding"],
      onlyMainContent: false,
    }),
    signal: AbortSignal.timeout(60000),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      toTrimmedString(asRecord(payload)?.error) ??
      toTrimmedString(asRecord(payload)?.message) ??
      `Firecrawl scrape failed (${response.status})`;
    throw Object.assign(new Error(message), {
      code: "firecrawl_scrape_failed",
      status: response.status >= 400 && response.status < 600 ? response.status : 502,
      details: payload,
    });
  }

  const data = asRecord(asRecord(payload)?.data) ?? asRecord(payload);
  const branding = asRecord(data?.branding);
  if (!branding) {
    throw Object.assign(new Error("Firecrawl returned no branding payload"), {
      code: "branding_missing",
      status: 502,
      details: payload,
    });
  }
  return branding;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Supabase env not configured" }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) {
      return json({ ok: false, error: "Missing Authorization header" }, 401);
    }

    const body = asRecord(await req.json().catch(() => null)) ?? {};
    const projectId = toFiniteNumber(body.project_id ?? body.projectId);
    if (projectId == null) {
      return json({ ok: false, error: "project_id is required" }, 400);
    }

    const replaceAll = body.replace_all === true || body.replaceAll === true;
    const applyLegacy = body.apply_legacy !== false && body.applyLegacy !== false;

    const userDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: allowed, error: assertError } = await userDb.rpc(
      "ai_assert_can_edit_project_v1",
      { p_project_id: projectId },
    );
    if (assertError || allowed !== true) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const { data: projectRow, error: projectError } = await service
      .from("projects")
      .select("id, project_url, brand_kit, color, logo")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError || !projectRow) {
      return json({ ok: false, error: "Project not found" }, 404);
    }

    const requestedUrl = toTrimmedString(body.url ?? body.root_url ?? body.rootUrl);
    const rootUrl = normalizeWebsiteUrl(
      requestedUrl ?? toTrimmedString(projectRow.project_url) ?? "",
    );
    if (!rootUrl) {
      return json(
        { ok: false, error: "A valid website URL is required to extract brand" },
        400,
      );
    }

    const { data: runRow, error: runInsertError } = await service
      .from("project_brand_extract_runs")
      .insert({
        project_id: projectId,
        provider: "firecrawl",
        status: "running",
        root_url: rootUrl,
        started_at: new Date().toISOString(),
        metadata: { replace_all: replaceAll },
      })
      .select("id")
      .single();

    if (runInsertError || !runRow?.id) {
      return json(
        { ok: false, error: runInsertError?.message ?? "Failed to create extract run" },
        500,
      );
    }

    const runId = String(runRow.id);

    try {
      const rawBranding = await scrapeBranding(rootUrl);
      const images = asRecord(rawBranding.images) ?? {};
      const logoRemote =
        toTrimmedString(rawBranding.logo) ?? toTrimmedString(images.logo);
      const faviconRemote = toTrimmedString(images.favicon);

      const [logoPath, faviconPath] = await Promise.all([
        mirrorRemoteImage({
          service,
          projectId,
          kind: "logo",
          remoteUrl: logoRemote,
        }),
        mirrorRemoteImage({
          service,
          projectId,
          kind: "favicon",
          remoteUrl: faviconRemote,
        }),
      ]);

      const normalizedSource: BrandKitEffective = normalizeBrandKitEffective(rawBranding, {
        logo_path: logoPath,
        favicon_path: faviconPath,
      });

      const previousKit = parseProjectBrandKit(projectRow.brand_kit);
      const nextKit: ProjectBrandKit = applyExtractedBrandSource({
        previous: previousKit,
        source: normalizedSource,
        sourceUrl: rootUrl,
        runId,
        replaceAll,
      });

      const projectPatch: Record<string, unknown> = {
        brand_kit: nextKit,
        project_url: toTrimmedString(projectRow.project_url) ?? rootUrl,
        updated_at: new Date().toISOString(),
      };

      if (applyLegacy) {
        if (nextKit.effective.colors.primary) {
          projectPatch.color = nextKit.effective.colors.primary;
        }
        if (nextKit.effective.logo_path) {
          projectPatch.logo = nextKit.effective.logo_path;
        }
      }

      const { error: projectUpdateError } = await service
        .from("projects")
        .update(projectPatch)
        .eq("id", projectId);

      if (projectUpdateError) {
        throw Object.assign(new Error(projectUpdateError.message), {
          code: "project_update_failed",
          status: 500,
        });
      }

      await service
        .from("project_brand_extract_runs")
        .update({
          status: "succeeded",
          raw_branding: rawBranding,
          normalized: normalizedSource,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            replace_all: replaceAll,
            apply_legacy: applyLegacy,
            mirrored_logo: Boolean(logoPath && logoPath !== logoRemote),
            mirrored_favicon: Boolean(faviconPath && faviconPath !== faviconRemote),
          },
        })
        .eq("id", runId);

      return json({
        ok: true,
        project_id: projectId,
        run_id: runId,
        root_url: rootUrl,
        brand_kit: nextKit,
        applied_legacy: applyLegacy,
      });
    } catch (error) {
      const err = error as Error & { code?: string; status?: number; details?: unknown };
      await service
        .from("project_brand_extract_runs")
        .update({
          status: "failed",
          error_code: err.code ?? "extract_failed",
          error_message: err.message ?? "Brand extract failed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { details: err.details ?? null },
        })
        .eq("id", runId);

      return json(
        {
          ok: false,
          project_id: projectId,
          run_id: runId,
          error: err.message ?? "Brand extract failed",
          error_code: err.code ?? "extract_failed",
        },
        typeof err.status === "number" ? err.status : 500,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ ok: false, error: message }, 500);
  }
});
