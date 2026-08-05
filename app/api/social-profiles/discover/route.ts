import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { normalizeHttpUrl } from "@/lib/competitor-social"
import {
  discoverSocialProfilesFromHtml,
  type SocialProfileCandidate,
} from "@/lib/social-profile-discovery"

export const dynamic = "force-dynamic"

const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 2_000_000
/** Footer links live on the homepage; these are cheap fallbacks when it fails. */
const FALLBACK_PATHS = ["/contact", "/contacts", "/contactos", "/about"]

const PRIVATE_HOST_RE =
  /^(localhost|.*\.local|.*\.internal|127\..*|10\..*|192\.168\..*|172\.(1[6-9]|2\d|3[01])\..*|\[?::1\]?|169\.254\..*)$/i

function isPubliclyRoutable(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  return !PRIVATE_HOST_RE.test(url.hostname)
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        // Some sites serve an empty shell to unknown agents.
        "User-Agent":
          "Mozilla/5.0 (compatible; ArticulateBot/1.0; +https://articulate.pt)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const contentType = response.headers.get("content-type") ?? ""
    if (contentType && !contentType.includes("html")) return null
    const html = await response.text()
    return html.slice(0, MAX_HTML_BYTES)
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: unknown
      url?: unknown
    }

    const projectId = Number(body.projectId)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 })
    }

    const normalized = normalizeHttpUrl(typeof body.url === "string" ? body.url : null)
    if (!normalized) {
      return NextResponse.json({ error: "A valid website URL is required" }, { status: 400 })
    }
    const target = new URL(normalized)
    if (!isPubliclyRoutable(target)) {
      return NextResponse.json({ error: "Website URL is not reachable" }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: canEdit } = await supabase.rpc("fn_can_edit_project_check", {
      p_project_id: projectId,
    })
    if (!canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const pages = [target.toString(), ...FALLBACK_PATHS.map((path) => `${target.origin}${path}`)]
    const byNetwork = new Map<string, SocialProfileCandidate>()

    for (const page of pages) {
      const html = await fetchHtml(page)
      if (!html) continue
      for (const candidate of discoverSocialProfilesFromHtml(html, page)) {
        if (!byNetwork.has(candidate.network)) byNetwork.set(candidate.network, candidate)
      }
      if (byNetwork.size > 0) break
    }

    return NextResponse.json({
      url: target.toString(),
      candidates: [...byNetwork.values()],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
