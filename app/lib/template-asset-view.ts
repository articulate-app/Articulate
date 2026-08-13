/**
 * Helpers to classify brand-kit template assets for in-app viewing.
 */

import { getImageUrl } from "./public-media"
import type { ProjectDesignTemplateAsset } from "./project-brand-kit"

export type TemplateAssetViewKind = "docx" | "url" | "image" | "video" | "pdf" | "html" | "other"

function looksLikeImagePath(value: string | null | undefined): boolean {
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value ?? "")
}

export function isDocxTemplateAsset(asset: ProjectDesignTemplateAsset): boolean {
  if (asset.media_type === "docx") return true
  const haystack = `${asset.storage_path || ""} ${asset.url || ""} ${asset.title || ""} ${asset.mime_type || ""}`
  return /\.docx(\?|#|$)/i.test(haystack) || /wordprocessingml/i.test(haystack)
}

export function isLinkTemplateAsset(asset: ProjectDesignTemplateAsset): boolean {
  if (asset.media_type === "url") return Boolean(asset.url?.trim())
  const url = asset.url?.trim() || ""
  if (!url) return false
  if (asset.storage_path) return false
  if (isDocxTemplateAsset(asset)) return false
  if (looksLikeImagePath(url)) return false
  if (/\.(pdf|docx?|html?|mp4|webm|mov)(\?|#|$)/i.test(url)) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export function templateAssetViewKind(asset: ProjectDesignTemplateAsset): TemplateAssetViewKind {
  if (isDocxTemplateAsset(asset)) return "docx"
  if (isLinkTemplateAsset(asset)) return "url"
  if (asset.media_type === "video") return "video"
  if (asset.media_type === "pdf" || /\.pdf(\?|#|$)/i.test(asset.storage_path || asset.url || "")) {
    return "pdf"
  }
  if (asset.media_type === "html" || /\.html?(\?|#|$)/i.test(asset.storage_path || asset.url || "")) {
    return "html"
  }
  if (
    asset.media_type === "image" ||
    looksLikeImagePath(asset.storage_path) ||
    looksLikeImagePath(asset.url)
  ) {
    return "image"
  }
  return "other"
}

export function templateAssetHref(asset: ProjectDesignTemplateAsset): string | null {
  return (
    getImageUrl(asset.storage_path) ||
    (asset.url?.trim() ? asset.url.trim() : null) ||
    null
  )
}

/** Prefer Word, then HTML, then link, then first asset — drives how we open the template. */
export function pickPrimaryTemplateAsset(
  assets: ProjectDesignTemplateAsset[],
): ProjectDesignTemplateAsset | null {
  if (!assets.length) return null
  return (
    assets.find((asset) => isDocxTemplateAsset(asset)) ||
    assets.find((asset) => templateAssetViewKind(asset) === "html") ||
    assets.find((asset) => isLinkTemplateAsset(asset)) ||
    assets[0] ||
    null
  )
}
