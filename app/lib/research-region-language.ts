import { mapRegionIdToGl } from "./google-autocomplete"

/**
 * Map a Google Ads / DataForSEO region id to an ISO language code for AI Overview.
 * Used when the Research market selector drives Google AI Overview (not ChatGPT).
 */
export function languageCodeFromRegionId(regionId?: string | null): string {
  const gl = mapRegionIdToGl(regionId)
  if (gl === "us" || gl === "uk") return "en"
  if (gl === "pt" || gl === "br") return "pt"
  if (gl === "es") return "es"
  if (gl === "de") return "de"
  if (gl === "fr") return "fr"
  // "Any" / unknown — keep historical default used by prompt research.
  return "pt"
}
