"use client"

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import {
  applyBrandKitOverrides,
  emptyProjectBrandKit,
  parseProjectBrandKit,
  type PartialBrandKitEffective,
  type ProjectBrandKit,
} from "@/lib/project-brand-kit"

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
