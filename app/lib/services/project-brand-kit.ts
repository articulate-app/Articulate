"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  applyBrandKitDesignFields,
  applyBrandKitOverrides,
  emptyProjectBrandKit,
  parseProjectBrandKit,
  type PartialBrandKitEffective,
  type ProjectBrandKit,
  type ProjectDesignMediaType,
  type ProjectDesignTemplate,
  type ProjectDesignTemplateAsset,
} from "@/lib/project-brand-kit"
import { PUBLIC_MEDIA_BUCKET, getImageUrl } from "@/lib/public-media"

export const PROJECT_BRAND_KIT_QUERY_KEY = "project-brand-kit" as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export type ExtractProjectBrandResult = {
  ok: boolean
  project_id: number
  run_id?: string
  root_url?: string
  brand_kit?: ProjectBrandKit
  error?: string
  error_code?: string
}

export async function fetchProjectBrandKit(
  projectId: number,
): Promise<ProjectBrandKit> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("projects")
    .select("brand_kit")
    .eq("id", projectId)
    .maybeSingle()

  if (error) throw error
  return parseProjectBrandKit(data?.brand_kit)
}

export async function extractProjectBrand(args: {
  projectId: number
  url?: string | null
  replaceAll?: boolean
  applyLegacy?: boolean
}): Promise<ExtractProjectBrandResult> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase.functions.invoke("extract-project-brand", {
    body: {
      project_id: args.projectId,
      url: args.url?.trim() || undefined,
      replace_all: args.replaceAll === true,
      apply_legacy: args.applyLegacy !== false,
    },
  })

  const record = asRecord(data)
  if (error) {
    return {
      ok: false,
      project_id: args.projectId,
      error: error.message || toTrimmedString(record?.error) || "Brand extract failed",
      error_code: toTrimmedString(record?.error_code) ?? undefined,
      run_id: toTrimmedString(record?.run_id) ?? undefined,
    }
  }

  if (!record || record.ok === false) {
    return {
      ok: false,
      project_id: args.projectId,
      error: toTrimmedString(record?.error) ?? "Brand extract failed",
      error_code: toTrimmedString(record?.error_code) ?? undefined,
      run_id: toTrimmedString(record?.run_id) ?? undefined,
    }
  }

  return {
    ok: true,
    project_id: toFiniteNumber(record.project_id) ?? args.projectId,
    run_id: toTrimmedString(record.run_id) ?? undefined,
    root_url: toTrimmedString(record.root_url) ?? undefined,
    brand_kit: parseProjectBrandKit(record.brand_kit),
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function saveProjectBrandKitOverrides(args: {
  projectId: number
  brandKit: ProjectBrandKit
  overrides: PartialBrandKitEffective
  syncLegacy?: boolean
}): Promise<{ data: ProjectBrandKit; error: Error | null }> {
  const supabase = createClientComponentClient()
  const nextKit = applyBrandKitOverrides({
    previous: args.brandKit,
    overrides: args.overrides,
  })

  const patch: Record<string, unknown> = {
    brand_kit: nextKit,
  }

  if (args.syncLegacy !== false) {
    if (nextKit.effective.colors.primary) {
      patch.color = nextKit.effective.colors.primary
    }
    if (nextKit.effective.logo_path) {
      patch.logo = nextKit.effective.logo_path
    }
  }

  const { error } = await supabase.from("projects").update(patch).eq("id", args.projectId)

  if (error) {
    return { data: emptyProjectBrandKit(), error: error as unknown as Error }
  }

  return { data: nextKit, error: null }
}

export async function resetBrandKitFieldToSource(args: {
  projectId: number
  brandKit: ProjectBrandKit
  field:
    | "logo_path"
    | "color_scheme"
    | "colors.primary"
    | "colors.secondary"
    | "colors.accent"
    | "colors.background"
    | "colors.text_primary"
    | "colors.text_secondary"
    | "fonts.primary"
    | "fonts.heading"
    | "fonts.code"
}): Promise<{ data: ProjectBrandKit; error: Error | null }> {
  const overrides: PartialBrandKitEffective = { ...args.brandKit.overrides }

  if (args.field === "logo_path") {
    delete overrides.logo_path
  } else if (args.field === "color_scheme") {
    delete overrides.color_scheme
  } else if (args.field.startsWith("colors.")) {
    const key = args.field.replace("colors.", "") as keyof NonNullable<
      PartialBrandKitEffective["colors"]
    >
    if (overrides.colors) {
      const nextColors = { ...overrides.colors }
      delete nextColors[key]
      overrides.colors = Object.keys(nextColors).length > 0 ? nextColors : undefined
      if (!overrides.colors) delete overrides.colors
    }
  } else if (args.field.startsWith("fonts.")) {
    const key = args.field.replace("fonts.", "") as keyof NonNullable<
      PartialBrandKitEffective["fonts"]
    >
    if (overrides.fonts) {
      const nextFonts = { ...overrides.fonts }
      delete nextFonts[key]
      overrides.fonts = Object.keys(nextFonts).length > 0 ? nextFonts : undefined
      if (!overrides.fonts) delete overrides.fonts
    }
  }

  return saveProjectBrandKitOverrides({
    projectId: args.projectId,
    brandKit: args.brandKit,
    overrides,
  })
}

export async function saveProjectBrandKitDesign(args: {
  projectId: number
  brandKit: ProjectBrandKit
  designDescription?: string | null
  designTemplates?: ProjectDesignTemplate[]
  approvedImageBanks?: ProjectBrandKit["approved_image_banks"]
}): Promise<{ data: ProjectBrandKit; error: Error | null }> {
  const supabase = createClientComponentClient()
  const nextKit = applyBrandKitDesignFields({
    previous: args.brandKit,
    designDescription: args.designDescription,
    designTemplates: args.designTemplates,
    approvedImageBanks: args.approvedImageBanks,
  })

  const { error } = await supabase
    .from("projects")
    .update({ brand_kit: nextKit })
    .eq("id", args.projectId)

  if (error) {
    return { data: emptyProjectBrandKit(), error: error as unknown as Error }
  }
  return { data: nextKit, error: null }
}

function mediaTypeFromFile(file: File): ProjectDesignMediaType {
  const mime = (file.type || "").toLowerCase()
  const name = file.name.toLowerCase()
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf"
  if (
    mime === "text/html"
    || mime === "application/xhtml+xml"
    || name.endsWith(".html")
    || name.endsWith(".htm")
  ) {
    return "html"
  }
  if (
    mime === "application/msword"
    || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || name.endsWith(".doc")
    || name.endsWith(".docx")
  ) {
    return "docx"
  }
  return "other"
}

function extensionForUpload(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase().trim()
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName
  const mime = (file.type || "").toLowerCase()
  if (mime === "image/png") return "png"
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/webp") return "webp"
  if (mime === "image/gif") return "gif"
  if (mime.startsWith("video/")) return "mp4"
  if (mime === "application/pdf") return "pdf"
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html"
  if (mime === "application/msword") return "doc"
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx"
  }
  return "bin"
}

function contentTypeForUpload(file: File): string | undefined {
  if (file.type) return file.type
  const mediaType = mediaTypeFromFile(file)
  if (mediaType === "html") return "text/html"
  if (mediaType === "docx") {
    return file.name.toLowerCase().endsWith(".doc")
      ? "application/msword"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
  if (mediaType === "pdf") return "application/pdf"
  return undefined
}

/** Pull a short plain-text excerpt from an HTML file for AI layout notes. */
async function htmlFileTextExcerpt(file: File, maxChars = 1200): Promise<string | null> {
  try {
    const raw = await file.text()
    const withoutScripts = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim()
    if (!withoutScripts) return null
    return withoutScripts.length > maxChars
      ? `${withoutScripts.slice(0, maxChars - 1)}…`
      : withoutScripts
  } catch {
    return null
  }
}

/** Extract readable text from a .docx (Office Open XML) for card preview + AI notes. */
async function docxFileTextExcerpt(file: File, maxChars = 1200): Promise<string | null> {
  try {
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const documentXml = await zip.file("word/document.xml")?.async("string")
    if (!documentXml) return null
    const text = documentXml
      .replace(/<w:tab[^/]*\/>/gi, "\t")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<w:br[^/]*\/>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
    if (!text) return null
    return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text
  } catch {
    return null
  }
}

async function uploadDesignAssetFile(args: {
  projectId: number
  file: File
}): Promise<{ asset: ProjectDesignTemplateAsset | null; error: Error | null }> {
  const supabase = createClientComponentClient()
  const ext = extensionForUpload(args.file)
  const storagePath =
    `projects/${args.projectId}/design-examples/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .upload(storagePath, args.file, {
      upsert: false,
      contentType: contentTypeForUpload(args.file),
    })

  if (uploadError) {
    return { asset: null, error: uploadError as unknown as Error }
  }

  const publicUrl = getImageUrl(storagePath)
  const mediaType = mediaTypeFromFile(args.file)
  return {
    asset: {
      id: crypto.randomUUID(),
      media_type: mediaType,
      title: args.file.name.replace(/\.[^.]+$/, "") || args.file.name,
      url: publicUrl,
      storage_path: storagePath,
      mime_type: contentTypeForUpload(args.file) ?? (args.file.type || null),
    },
    error: null,
  }
}

/** Upload one or more files as a single multi-asset template. */
export async function uploadProjectDesignTemplateFiles(args: {
  projectId: number
  brandKit: ProjectBrandKit
  files: File[]
  title?: string | null
  notes?: string | null
  /** When set, append assets to this template instead of creating a new one. */
  templateId?: string | null
}): Promise<{ data: ProjectBrandKit; template: ProjectDesignTemplate | null; error: Error | null }> {
  const files = args.files.filter(Boolean)
  if (files.length === 0) {
    return { data: args.brandKit, template: null, error: new Error("No files selected") }
  }

  const assets: ProjectDesignTemplateAsset[] = []
  for (const file of files) {
    const uploaded = await uploadDesignAssetFile({ projectId: args.projectId, file })
    if (uploaded.error || !uploaded.asset) {
      return {
        data: args.brandKit,
        template: null,
        error: uploaded.error ?? new Error(`Failed to upload ${file.name}`),
      }
    }
    assets.push(uploaded.asset)
  }

  if (args.templateId) {
    const nextTemplates = args.brandKit.design_templates.map((entry) => {
      if (entry.id !== args.templateId) return entry
      return { ...entry, assets: [...entry.assets, ...assets] }
    })
    const template = nextTemplates.find((entry) => entry.id === args.templateId) ?? null
    const saved = await saveProjectBrandKitDesign({
      projectId: args.projectId,
      brandKit: args.brandKit,
      designTemplates: nextTemplates,
    })
    return {
      data: saved.data,
      template: saved.error ? null : template,
      error: saved.error,
    }
  }

  const title =
    args.title?.trim()
    || (files.length === 1
      ? files[0].name.replace(/\.[^.]+$/, "") || files[0].name
      : `${files.length} assets`)

  let notes = args.notes?.trim() || null
  if (!notes) {
    const htmlFile = files.find((file) => mediaTypeFromFile(file) === "html")
    const docxFile = files.find((file) => mediaTypeFromFile(file) === "docx")
    if (htmlFile) {
      const excerpt = await htmlFileTextExcerpt(htmlFile)
      if (excerpt) notes = `HTML excerpt: ${excerpt}`
    } else if (docxFile) {
      const excerpt = await docxFileTextExcerpt(docxFile)
      if (excerpt) {
        notes = `Word excerpt: ${excerpt}`
      } else {
        notes =
          "Word document layout template — match structure, hierarchy, and formatting cues from this file."
      }
    }
  }

  const template: ProjectDesignTemplate = {
    id: crypto.randomUUID(),
    title,
    notes,
    assets,
    source_artifact_id: null,
    created_at: new Date().toISOString(),
  }

  const saved = await saveProjectBrandKitDesign({
    projectId: args.projectId,
    brandKit: args.brandKit,
    designTemplates: [...args.brandKit.design_templates, template],
  })

  return {
    data: saved.data,
    template: saved.error ? null : template,
    error: saved.error,
  }
}

export async function addProjectDesignTemplateLink(args: {
  projectId: number
  brandKit: ProjectBrandKit
  url: string
  title?: string | null
  notes?: string | null
}): Promise<{ data: ProjectBrandKit; template: ProjectDesignTemplate | null; error: Error | null }> {
  const url = args.url.trim()
  if (!url) {
    return { data: args.brandKit, template: null, error: new Error("URL is required") }
  }

  let hostname: string | null = null
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    /* ignore */
  }

  const lowerUrl = url.toLowerCase()
  const looksLikeHtml =
    lowerUrl.endsWith(".html")
    || lowerUrl.endsWith(".htm")
    || lowerUrl.includes(".html?")
    || lowerUrl.includes(".htm?")
  const looksLikeDocx =
    lowerUrl.endsWith(".docx")
    || lowerUrl.endsWith(".doc")
    || lowerUrl.includes(".docx?")
    || lowerUrl.includes(".doc?")

  const template: ProjectDesignTemplate = {
    id: crypto.randomUUID(),
    title: args.title?.trim() || hostname || url,
    notes: args.notes?.trim() || null,
    assets: [
      {
        id: crypto.randomUUID(),
        media_type: looksLikeHtml ? "html" : looksLikeDocx ? "docx" : "url",
        title: args.title?.trim() || hostname || url,
        url,
        storage_path: null,
        mime_type: looksLikeHtml
          ? "text/html"
          : looksLikeDocx
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : null,
      },
    ],
    source_artifact_id: null,
    created_at: new Date().toISOString(),
  }

  const saved = await saveProjectBrandKitDesign({
    projectId: args.projectId,
    brandKit: args.brandKit,
    designTemplates: [...args.brandKit.design_templates, template],
  })

  return {
    data: saved.data,
    template: saved.error ? null : template,
    error: saved.error,
  }
}

export async function updateProjectDesignTemplate(args: {
  projectId: number
  brandKit: ProjectBrandKit
  templateId: string
  patch: Partial<Pick<ProjectDesignTemplate, "title" | "notes">>
}): Promise<{ data: ProjectBrandKit; error: Error | null }> {
  const nextTemplates = args.brandKit.design_templates.map((entry) => {
    if (entry.id !== args.templateId) return entry
    return {
      ...entry,
      title: args.patch.title !== undefined ? (args.patch.title?.trim() || null) : entry.title,
      notes: args.patch.notes !== undefined ? (args.patch.notes?.trim() || null) : entry.notes,
    }
  })
  return saveProjectBrandKitDesign({
    projectId: args.projectId,
    brandKit: args.brandKit,
    designTemplates: nextTemplates,
  })
}

export async function removeProjectDesignTemplate(args: {
  projectId: number
  brandKit: ProjectBrandKit
  templateId: string
}): Promise<{ data: ProjectBrandKit; error: Error | null }> {
  const nextTemplates = args.brandKit.design_templates.filter(
    (entry) => entry.id !== args.templateId,
  )
  return saveProjectBrandKitDesign({
    projectId: args.projectId,
    brandKit: args.brandKit,
    designTemplates: nextTemplates,
  })
}

export async function removeProjectDesignTemplateAsset(args: {
  projectId: number
  brandKit: ProjectBrandKit
  templateId: string
  assetId: string
}): Promise<{ data: ProjectBrandKit; error: Error | null }> {
  const nextTemplates = args.brandKit.design_templates.map((entry) => {
    if (entry.id !== args.templateId) return entry
    return {
      ...entry,
      assets: entry.assets.filter((asset) => asset.id !== args.assetId),
    }
  })

  return saveProjectBrandKitDesign({
    projectId: args.projectId,
    brandKit: args.brandKit,
    designTemplates: nextTemplates,
  })
}

/** @deprecated Use uploadProjectDesignTemplateFiles */
export async function uploadProjectDesignExampleFile(args: {
  projectId: number
  brandKit: ProjectBrandKit
  file: File
  notes?: string | null
}): Promise<{ data: ProjectBrandKit; example: ProjectDesignTemplate | null; error: Error | null }> {
  const result = await uploadProjectDesignTemplateFiles({
    projectId: args.projectId,
    brandKit: args.brandKit,
    files: [args.file],
    notes: args.notes,
  })
  return { data: result.data, example: result.template, error: result.error }
}

/** @deprecated Use addProjectDesignTemplateLink */
export async function addProjectDesignExampleLink(args: {
  projectId: number
  brandKit: ProjectBrandKit
  url: string
  title?: string | null
  notes?: string | null
}): Promise<{ data: ProjectBrandKit; example: ProjectDesignTemplate | null; error: Error | null }> {
  const result = await addProjectDesignTemplateLink(args)
  return { data: result.data, example: result.template, error: result.error }
}

/** @deprecated Use removeProjectDesignTemplate */
export async function removeProjectDesignExample(args: {
  projectId: number
  brandKit: ProjectBrandKit
  exampleId: string
}): Promise<{ data: ProjectBrandKit; error: Error | null }> {
  return removeProjectDesignTemplate({
    projectId: args.projectId,
    brandKit: args.brandKit,
    templateId: args.exampleId,
  })
}
