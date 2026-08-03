import { NextResponse } from "next/server"
import {
  validateGoogleAdsConfig,
  warmGoogleAdsAccessToken,
} from "../../../lib/googleAdsAuth"

/**
 * Prefetch / cache the Google Ads OAuth access token so the next
 * /api/keyword-ideas primary call skips the token refresh RTT.
 */
export async function POST() {
  if (!validateGoogleAdsConfig()) {
    return NextResponse.json(
      { ok: false, error: "Google Ads API not configured" },
      { status: 500 },
    )
  }

  const ok = await warmGoogleAdsAccessToken()
  return NextResponse.json({ ok })
}
