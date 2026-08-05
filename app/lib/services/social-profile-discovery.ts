"use client"

import type { SocialProfileCandidate } from "@/lib/social-profile-discovery"

export type { SocialProfileCandidate }

/**
 * Ask the server to read a website and return one social profile per network.
 * Scraping runs server-side because the browser cannot fetch third-party HTML.
 */
export async function fetchSocialProfileCandidates(args: {
  projectId: number
  websiteUrl: string
}): Promise<SocialProfileCandidate[]> {
  const response = await fetch("/api/social-profiles/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: args.projectId, url: args.websiteUrl }),
  })

  const payload = (await response.json().catch(() => null)) as
    | { candidates?: SocialProfileCandidate[]; error?: string }
    | null

  if (!response.ok) {
    throw new Error(payload?.error || "Could not read that website")
  }
  return payload?.candidates ?? []
}
