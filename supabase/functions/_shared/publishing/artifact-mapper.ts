import type { PublishingArtifact, PublishingMedia } from "./types.ts"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/(h[1-6]|p|div|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function blocksToText(contentJson: unknown, contentText: unknown): string {
  const plain = asString(contentText)
  if (plain && !/<[a-z][\s\S]*>/i.test(plain)) return plain

  const record = asRecord(contentJson)
  const blocks = Array.isArray(record?.blocks) ? record.blocks : []
  if (!blocks.length) {
    if (plain && /<[a-z][\s\S]*>/i.test(plain)) return stripHtml(plain)
    return plain ?? ""
  }

  const parts: string[] = []
  for (const raw of blocks) {
    const block = asRecord(raw)
    if (!block) continue
    const type = String(block.type ?? "paragraph")
    const html = asString(block.html)
    if (html) {
      parts.push(stripHtml(html))
      continue
    }
    const text = asString(block.text) ?? asString(block.title) ?? ""
    if (type === "heading") {
      parts.push(text)
      continue
    }
    if (type === "list" && Array.isArray(block.items)) {
      parts.push(
        block.items
          .map((item) => {
            if (typeof item === "string") return `- ${item}`
            const itemRecord = asRecord(item)
            return `- ${asString(itemRecord?.text) ?? ""}`
          })
          .join("\n"),
      )
      continue
    }
    if (type === "image" || type === "video" || type === "file" || type === "attachment") {
      const caption = asString(block.caption) ?? asString(block.alt)
      if (caption) parts.push(`[${type}] ${caption}`)
      continue
    }
    if (text) parts.push(text)
  }
  return parts.filter(Boolean).join("\n\n").trim()
}

function mediaTypeFromMime(mime: string | null | undefined, fallback: string | null | undefined): PublishingMedia["type"] {
  const value = String(mime ?? fallback ?? "").toLowerCase()
  if (value.startsWith("image/") || value === "image") return "image"
  if (value.startsWith("video/") || value === "video") return "video"
  if (value.includes("pdf")) return "pdf"
  return "file"
}

function slugify(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return slug || undefined
}

export type MapArtifactInput = {
  artifact: Record<string, unknown>
  seo?: {
    title?: string | null
    description?: string | null
  } | null
}

/**
 * Map any existing artifact snapshot into a provider-agnostic PublishingArtifact.
 */
export function mapArtifactToPublishingArtifact(input: MapArtifactInput): PublishingArtifact {
  const artifact = input.artifact
  const id = asString(artifact.id)
  if (!id) throw new Error("Artifact id is required")

  const title = asString(artifact.title) ?? undefined
  const content = blocksToText(artifact.content_json, artifact.content_text)
  const excerpt = content ? content.slice(0, 280) : undefined
  const artifactType = asString(artifact.artifact_type) ?? "document"

  const media: PublishingMedia[] = []
  const assetData = asRecord(artifact.asset_data)
  const assets = Array.isArray(assetData?.assets) ? assetData.assets : []
  for (const raw of assets) {
    const asset = asRecord(raw)
    if (!asset) continue
    const attachmentId = asString(asset.attachment_id)
    if (!attachmentId) continue
    media.push({
      id: attachmentId,
      attachmentId,
      type: mediaTypeFromMime(asString(asset.mime_type), asString(asset.media_type)),
      name: asString(asset.file_name) ?? undefined,
      mimeType: asString(asset.mime_type) ?? undefined,
      purpose: asString(asset.role) ?? "asset",
    })
  }

  const contentJson = asRecord(artifact.content_json)
  const blocks = Array.isArray(contentJson?.blocks) ? contentJson.blocks : []
  for (const raw of blocks) {
    const block = asRecord(raw)
    if (!block) continue
    const type = String(block.type ?? "")
    if (!["image", "video", "file", "attachment"].includes(type)) continue
    const attachmentId = asString(block.attachment_id)
    if (!attachmentId) continue
    if (media.some((item) => item.attachmentId === attachmentId)) continue
    media.push({
      id: attachmentId,
      attachmentId,
      type: mediaTypeFromMime(asString(block.mime_type), type),
      name: asString(block.file_name) ?? undefined,
      mimeType: asString(block.mime_type) ?? undefined,
      purpose: asString(block.caption) ?? type,
    })
  }

  const metadata = asRecord(artifact.metadata) ?? {}
  const seoTitle = asString(input.seo?.title) ?? asString(metadata.seo_title) ?? title
  const seoDescription =
    asString(input.seo?.description) ?? asString(metadata.seo_description) ?? excerpt

  return {
    id,
    type: artifactType,
    title,
    content: content || undefined,
    excerpt,
    slug: slugify(asString(metadata.slug) ?? title),
    seo: {
      title: seoTitle,
      description: seoDescription,
    },
    media: media.length ? media : undefined,
    metadata: {
      artifact_role: asString(artifact.artifact_role),
      channel_id: artifact.channel_id ?? null,
      language_id: artifact.language_id ?? null,
      current_version: artifact.current_version ?? null,
      ...metadata,
    },
  }
}

export type InlinePublishingContentInput = {
  type?: string | null
  title?: string | null
  body?: string | null
  content?: string | null
  excerpt?: string | null
  slug?: string | null
  seo?: {
    title?: string | null
    description?: string | null
  } | null
  media?: Array<Record<string, unknown>> | null
  metadata?: Record<string, unknown> | null
}

/**
 * Normalize structured inline content (no artifact) into a PublishingArtifact snapshot.
 */
export function mapInlineContentToPublishingArtifact(
  input: InlinePublishingContentInput,
): PublishingArtifact {
  const title = asString(input.title) ?? undefined
  const body = asString(input.body) ?? asString(input.content) ?? ""
  const content = body ? (/<[a-z][\s\S]*>/i.test(body) ? stripHtml(body) : body) : ""
  const excerpt = asString(input.excerpt) ?? (content ? content.slice(0, 280) : undefined)
  const media: PublishingMedia[] = []
  for (const raw of input.media ?? []) {
    const item = asRecord(raw)
    if (!item) continue
    const attachmentId = asString(item.attachment_id) ?? asString(item.attachmentId) ?? asString(item.id)
    if (!attachmentId) continue
    media.push({
      id: attachmentId,
      attachmentId,
      type: mediaTypeFromMime(asString(item.mime_type) ?? asString(item.mimeType), asString(item.type)),
      name: asString(item.name) ?? asString(item.file_name) ?? undefined,
      mimeType: asString(item.mime_type) ?? asString(item.mimeType) ?? undefined,
      purpose: asString(item.purpose) ?? "asset",
    })
  }
  const seoTitle = asString(input.seo?.title) ?? title
  const seoDescription = asString(input.seo?.description) ?? excerpt
  return {
    id: `inline-${crypto.randomUUID()}`,
    type: asString(input.type) ?? "document",
    title,
    content: content || undefined,
    excerpt,
    slug: slugify(asString(input.slug) ?? title),
    seo: {
      title: seoTitle,
      description: seoDescription,
    },
    media: media.length ? media : undefined,
    metadata: {
      source_type: "inline",
      ...(asRecord(input.metadata) ?? {}),
    },
  }
}
