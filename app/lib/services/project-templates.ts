import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { getImageUrl } from "../public-media"
import {
  parseProjectBrandKit,
  type ProjectDesignTemplate,
  type ProjectDesignTemplateAsset,
} from "../project-brand-kit"
import {
  pickPrimaryTemplateAsset,
  templateAssetHref,
  type TemplateAssetViewKind,
  templateAssetViewKind,
} from "../template-asset-view"

export type ProjectTemplateListItem = {
  id: string
  title: string
  projectId: number
  projectName: string
  projectLogo: string | null
  projectColor: string | null
  assetCount: number
  thumbnailUrl: string | null
  createdAt: string | null
  notes: string | null
  /** How the primary asset should open in the workspace. */
  primaryKind: TemplateAssetViewKind | null
  /** Direct URL for link / file preview when available. */
  primaryHref: string | null
}

export type ProjectTemplateDetail = {
  template: ProjectDesignTemplate
  projectId: number
  projectName: string
  projectLogo: string | null
  projectColor: string | null
}

function assetThumbnail(asset: ProjectDesignTemplateAsset | undefined): string | null {
  if (!asset) return null
  if (asset.media_type === "image" || asset.media_type === "other") {
    return getImageUrl(asset.url) ?? getImageUrl(asset.storage_path)
  }
  if (asset.media_type === "url" && asset.url) {
    if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(asset.url)) {
      return getImageUrl(asset.url)
    }
  }
  return getImageUrl(asset.storage_path) ?? getImageUrl(asset.url)
}

/**
 * Flatten brand-kit design templates across all active projects the user can see.
 */
export async function fetchAllProjectTemplates(): Promise<ProjectTemplateListItem[]> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,logo,color,brand_kit,updated_at")
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(200)
  if (error) throw error

  const rows: ProjectTemplateListItem[] = []
  for (const project of (data ?? []) as Array<Record<string, unknown>>) {
    const projectId = Number(project.id)
    if (!Number.isFinite(projectId) || projectId <= 0) continue
    const projectName =
      (typeof project.name === "string" && project.name.trim()) || `Project ${projectId}`
    const projectLogo = typeof project.logo === "string" ? project.logo : null
    const projectColor = typeof project.color === "string" ? project.color : null
    const kit = parseProjectBrandKit(project.brand_kit)
    for (const template of kit.design_templates) {
      const title = template.title?.trim() || "Untitled template"
      const primary = pickPrimaryTemplateAsset(template.assets)
      const thumbAsset =
        template.assets.find((asset) => assetThumbnail(asset)) ?? primary ?? template.assets[0]
      rows.push({
        id: template.id,
        title,
        projectId,
        projectName,
        projectLogo,
        projectColor,
        assetCount: template.assets.length,
        thumbnailUrl: assetThumbnail(thumbAsset),
        createdAt: template.created_at || null,
        notes: template.notes,
        primaryKind: primary ? templateAssetViewKind(primary) : null,
        primaryHref: primary ? templateAssetHref(primary) : null,
      })
    }
  }

  rows.sort((a, b) => {
    const aMs = a.createdAt ? Date.parse(a.createdAt) : 0
    const bMs = b.createdAt ? Date.parse(b.createdAt) : 0
    if (bMs !== aMs) return bMs - aMs
    return a.title.localeCompare(b.title)
  })
  return rows
}

/** Load one brand-kit design template for the template detail pane. */
export async function fetchProjectTemplateDetail(args: {
  projectId: number
  templateId: string
}): Promise<ProjectTemplateDetail | null> {
  const supabase = createClientComponentClient()
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,logo,color,brand_kit")
    .eq("id", args.projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const projectId = Number(data.id)
  if (!Number.isFinite(projectId) || projectId <= 0) return null
  const kit = parseProjectBrandKit(data.brand_kit)
  const template = kit.design_templates.find((entry) => entry.id === args.templateId) ?? null
  if (!template) return null

  return {
    template,
    projectId,
    projectName:
      (typeof data.name === "string" && data.name.trim()) || `Project ${projectId}`,
    projectLogo: typeof data.logo === "string" ? data.logo : null,
    projectColor: typeof data.color === "string" ? data.color : null,
  }
}
