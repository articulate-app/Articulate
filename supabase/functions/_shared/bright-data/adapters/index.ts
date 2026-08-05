import { facebookAdapter } from "./facebook.ts"
import { instagramAdapter } from "./instagram.ts"
import { linkedinAdapter } from "./linkedin.ts"
import { tiktokAdapter } from "./tiktok.ts"
import { xAdapter } from "./x.ts"
import { youtubeAdapter } from "./youtube.ts"
import type { CompetitorSocialNetwork, NetworkAdapter } from "../types.ts"

const ADAPTERS: Record<CompetitorSocialNetwork, NetworkAdapter> = {
  linkedin: linkedinAdapter,
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  youtube: youtubeAdapter,
  tiktok: tiktokAdapter,
  x: xAdapter,
}

export function getNetworkAdapter(network: string): NetworkAdapter {
  const adapter = ADAPTERS[network as CompetitorSocialNetwork]
  if (!adapter) {
    throw new Error(`Unsupported social network: ${network}`)
  }
  return adapter
}

export {
  facebookAdapter,
  instagramAdapter,
  linkedinAdapter,
  tiktokAdapter,
  xAdapter,
  youtubeAdapter,
}
