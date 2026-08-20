import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  buildLinkDesignTemplate,
  normalizeDesignTemplateAsset,
  type ProjectDesignTemplate,
} from "@/lib/project-brand-kit"
import { uploadDesignAssetFile } from "./project-brand-kit"

export const TEMPLATE_FILE_ACCEPT =
  "image/*,video/*,application/pdf,text/html,.html,.htm,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

export function rowToUserDesignTemplate(raw: unknown): ProjectDesignTemplate | null {
  const record = asRecord(raw)
  if (!record) return null
  const id = toTrimmedString(record.id)
  if (!id) return null
  const assetsRaw = Array.isArray(record.assets) ? record.assets : []
  return {
    id,
    title: toTrimmedString(record.title),
    notes: toTrimmedString(record.notes),
    assets: assetsRaw
      .map((entry) => normalizeDesignTemplateAsset(entry))
      .filter((asset): asset is NonNullable<typeof asset> => asset != null),
    source_artifact_id: toTrimmedString(record.source_artifact_id),
    created_at:
      toTrimmedString(record.created_at) ?? new Date().toISOString(),
  }
}

export async function fetchUserDesignTemplates(): Promise<ProjectDesignTemplate[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("user_design_templates")
    .select("id,title,notes,assets,source_artifact_id,created_at")
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? [])
    .map((row) => rowToUserDesignTemplate(row))
    .filter((row): row is ProjectDesignTemplate => row != null)
}

export async function fetchUserDesignTemplate(
  templateId: string,
): Promise<ProjectDesignTemplate | null> {
  const id = templateId.trim()
  if (!id) return null
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("user_design_templates")
    .select("id,title,notes,assets,source_artifact_id,created_at")
    .eq("id", id)
    .maybeSingle()
  if (error) throw error
  return rowToUserDesignTemplate(data)
}

async function insertUserDesignTemplate(
  template: ProjectDesignTemplate,
): Promise<ProjectDesignTemplate> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("user_design_templates")
    .insert({
      id: template.id,
      title: template.title?.trim() || "Untitled template",
      notes: template.notes,
      assets: template.assets,
      source_artifact_id: template.source_artifact_id,
      created_at: template.created_at,
    })
    .select("id,title,notes,assets,source_artifact_id,created_at")
    .single()
  if (error) throw error
  const saved = rowToUserDesignTemplate(data)
  if (!saved) throw new Error("user_template_insert_failed")
  return saved
}

export async function createUserDesignTemplateFromUrl(args: {
  url: string
  title?: string | null
}): Promise<ProjectDesignTemplate> {
  return insertUserDesignTemplate(
    buildLinkDesignTemplate({ url: args.url, title: args.title }),
  )
}

export async function createUserDesignTemplateFromFiles(args: {
  files: File[]
  title?: string | null
}): Promise<ProjectDesignTemplate> {
  const files = args.files.filter((file) => file.size > 0)
  if (files.length === 0) throw new Error("No files selected")

  const assets = []
  for (const file of files) {
    const uploaded = await uploadDesignAssetFile({ file })
    if (uploaded.error || !uploaded.asset) {
      throw uploaded.error ?? new Error(`Failed to upload ${file.name}`)
    }
    assets.push(uploaded.asset)
  }

  const title =
    args.title?.trim()
    || (files.length === 1
      ? files[0].name.replace(/\.[^.]+$/, "") || files[0].name
      : `${files.length} assets`)

  return insertUserDesignTemplate({
    id: crypto.randomUUID(),
    title,
    notes: null,
    assets,
    source_artifact_id: null,
    created_at: new Date().toISOString(),
  })
}
