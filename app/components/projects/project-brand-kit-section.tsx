"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, RotateCcw, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { getImageUrl } from "@/lib/public-media"
import {
  emptyBrandKitEffective,
  normalizeHexColor,
  type BrandKitEffective,
  type PartialBrandKitEffective,
  type ProjectBrandKit,
} from "@/lib/project-brand-kit"
import {
  PROJECT_BRAND_KIT_QUERY_KEY,
  extractProjectBrand,
  fetchProjectBrandKit,
  saveProjectBrandKitOverrides,
} from "@/lib/services/project-brand-kit"
import { cn } from "@/lib/utils"

type ProjectBrandKitSectionProps = {
  projectId: number
  projectUrl: string | null
  canEdit?: boolean
  onApplied?: (kit: ProjectBrandKit) => void
}

type ColorKey = keyof BrandKitEffective["colors"]
type FontKey = keyof BrandKitEffective["fonts"]

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "text_primary", label: "Text primary" },
  { key: "text_secondary", label: "Text secondary" },
]

const FONT_FIELDS: { key: FontKey; label: string }[] = [
  { key: "primary", label: "Primary font" },
  { key: "heading", label: "Heading font" },
  { key: "code", label: "Code font" },
]

function buildOverridesFromDraft(
  source: BrandKitEffective | null,
  draft: BrandKitEffective,
): PartialBrandKitEffective {
  const base = source ?? emptyBrandKitEffective()
  const overrides: PartialBrandKitEffective = {}

  if (draft.color_scheme !== base.color_scheme) {
    overrides.color_scheme = draft.color_scheme
  }
  if ((draft.logo_path ?? null) !== (base.logo_path ?? null)) {
    overrides.logo_path = draft.logo_path
  }

  const colorPatch: Partial<BrandKitEffective["colors"]> = {}
  for (const { key } of COLOR_FIELDS) {
    const next = normalizeHexColor(draft.colors[key])
    const prev = normalizeHexColor(base.colors[key])
    if (next !== prev) colorPatch[key] = next
  }
  if (Object.keys(colorPatch).length > 0) overrides.colors = colorPatch

  const fontPatch: Partial<BrandKitEffective["fonts"]> = {}
  for (const { key } of FONT_FIELDS) {
    const next = (draft.fonts[key] ?? "").trim() || null
    const prev = (base.fonts[key] ?? "").trim() || null
    if (next !== prev) fontPatch[key] = next
  }
  if (Object.keys(fontPatch).length > 0) overrides.fonts = fontPatch

  return overrides
}

function ColorSwatch({
  label,
  value,
  disabled,
  onChange,
  onReset,
  canReset,
}: {
  label: string
  value: string | null
  disabled?: boolean
  onChange: (next: string | null) => void
  onReset?: () => void
  canReset?: boolean
}) {
  const hex = normalizeHexColor(value) ?? "#000000"
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-gray-600">{label}</Label>
        {canReset && onReset ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800"
            onClick={onReset}
            disabled={disabled}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border border-gray-200 bg-white p-1"
        />
        <Input
          value={value ?? ""}
          disabled={disabled}
          placeholder="#000000"
          onChange={(e) => onChange(e.target.value || null)}
          className="h-9 font-mono text-xs"
        />
      </div>
    </div>
  )
}

export function ProjectBrandKitSection({
  projectId,
  projectUrl,
  canEdit = true,
  onApplied,
}: ProjectBrandKitSectionProps) {
  const queryClient = useQueryClient()
  const [extractUrl, setExtractUrl] = useState(projectUrl ?? "")
  const [isExtracting, setIsExtracting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [draft, setDraft] = useState<BrandKitEffective>(emptyBrandKitEffective())

  const { data: brandKit, isLoading, error } = useQuery({
    queryKey: [PROJECT_BRAND_KIT_QUERY_KEY, projectId],
    queryFn: () => fetchProjectBrandKit(projectId),
  })

  useEffect(() => {
    setExtractUrl(projectUrl ?? "")
  }, [projectUrl])

  useEffect(() => {
    if (brandKit) setDraft(brandKit.effective)
  }, [brandKit])

  const source = brandKit?.source ?? null
  const logoUrl = useMemo(() => getImageUrl(draft.logo_path), [draft.logo_path])

  const isDirty = useMemo(() => {
    if (!brandKit) return false
    return JSON.stringify(draft) !== JSON.stringify(brandKit.effective)
  }, [brandKit, draft])

  const hasSource = Boolean(source)

  const handleExtract = async (replaceAll = false) => {
    if (!canEdit) return
    const url = extractUrl.trim()
    if (!url) {
      toast({
        title: "Website URL required",
        description: "Enter a website URL to extract brand identity.",
        variant: "destructive",
      })
      return
    }

    setIsExtracting(true)
    try {
      const result = await extractProjectBrand({
        projectId,
        url,
        replaceAll,
        applyLegacy: true,
      })
      if (!result.ok || !result.brand_kit) {
        throw new Error(result.error || "Brand extract failed")
      }

      setDraft(result.brand_kit.effective)
      queryClient.setQueryData([PROJECT_BRAND_KIT_QUERY_KEY, projectId], result.brand_kit)
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] })
      onApplied?.(result.brand_kit)

      toast({
        title: "Brand extracted",
        description: replaceAll
          ? "Brand kit replaced from the website."
          : "Brand kit updated. Existing manual overrides were kept where set.",
      })
    } catch (err) {
      toast({
        title: "Extract failed",
        description: err instanceof Error ? err.message : "Could not extract brand",
        variant: "destructive",
      })
    } finally {
      setIsExtracting(false)
    }
  }

  const handleSave = async () => {
    if (!canEdit || !brandKit) return
    setIsSaving(true)
    try {
      const overrides = buildOverridesFromDraft(source, draft)
      const { data, error: saveError } = await saveProjectBrandKitOverrides({
        projectId,
        brandKit,
        overrides,
        syncLegacy: true,
      })
      if (saveError) throw saveError

      setDraft(data.effective)
      queryClient.setQueryData([PROJECT_BRAND_KIT_QUERY_KEY, projectId], data)
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] })
      onApplied?.(data)

      toast({
        title: "Brand saved",
        description: "Brand kit adjustments were saved.",
      })
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save brand kit",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const resetColor = (key: ColorKey) => {
    if (!source) return
    setDraft((prev) => ({
      ...prev,
      colors: { ...prev.colors, [key]: source.colors[key] },
    }))
  }

  const resetFont = (key: FontKey) => {
    if (!source) return
    setDraft((prev) => ({
      ...prev,
      fonts: { ...prev.fonts, [key]: source.fonts[key] },
    }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading brand kit...
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-4 text-sm text-red-500">Failed to load brand kit.</div>
    )
  }

  return (
    <div className="space-y-5 border-t border-gray-100 pt-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-900">Brand kit</h3>
        </div>
        <p className="text-xs text-gray-500">
          Extract colors, fonts, and logo from the website, then adjust as needed.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brand-extract-url">Website URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="brand-extract-url"
            type="url"
            value={extractUrl}
            onChange={(e) => setExtractUrl(e.target.value)}
            disabled={!canEdit || isExtracting}
            placeholder="https://example.com"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || isExtracting}
            onClick={() => void handleExtract(false)}
            className="shrink-0 gap-2"
          >
            {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Extract brand
          </Button>
        </div>
        {hasSource ? (
          <button
            type="button"
            className="text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline disabled:opacity-50"
            disabled={!canEdit || isExtracting}
            onClick={() => void handleExtract(true)}
          >
            Re-extract and replace all overrides
          </button>
        ) : null}
        {brandKit?.extracted_at ? (
          <p className="text-[11px] text-gray-400">
            Last extracted {new Date(brandKit.extracted_at).toLocaleString()}
            {brandKit.status === "stale" ? " · overrides active" : ""}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border bg-gray-50">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Brand logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[10px] text-gray-400">None</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-xs text-gray-500">
              {draft.logo_path || "No logo extracted yet"}
            </p>
            {hasSource && source?.logo_path && draft.logo_path !== source.logo_path ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800"
                onClick={() =>
                  setDraft((prev) => ({ ...prev, logo_path: source.logo_path }))
                }
                disabled={!canEdit}
              >
                <RotateCcw className="h-3 w-3" />
                Reset to extracted
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {COLOR_FIELDS.map(({ key, label }) => (
          <ColorSwatch
            key={key}
            label={label}
            value={draft.colors[key]}
            disabled={!canEdit || isSaving}
            canReset={Boolean(hasSource && draft.colors[key] !== source?.colors[key])}
            onReset={() => resetColor(key)}
            onChange={(next) =>
              setDraft((prev) => ({
                ...prev,
                colors: { ...prev.colors, [key]: next },
              }))
            }
          />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-1">
        {FONT_FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-gray-600">{label}</Label>
              {hasSource && draft.fonts[key] !== source?.fonts[key] ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800"
                  onClick={() => resetFont(key)}
                  disabled={!canEdit || isSaving}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              ) : null}
            </div>
            <Input
              value={draft.fonts[key] ?? ""}
              disabled={!canEdit || isSaving}
              placeholder="e.g. Inter"
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  fonts: { ...prev.fonts, [key]: e.target.value || null },
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            "text-xs",
            brandKit?.status === "empty" ? "text-gray-400" : "text-gray-500",
          )}
        >
          {brandKit?.status === "empty"
            ? "No brand kit yet"
            : `${Object.values(draft.colors).filter(Boolean).length} colors · ${
                Object.values(draft.fonts).filter(Boolean).length
              } fonts`}
        </p>
        <Button
          type="button"
          size="sm"
          disabled={!canEdit || !isDirty || isSaving}
          onClick={() => void handleSave()}
          className="gap-2"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save brand adjustments
        </Button>
      </div>
    </div>
  )
}
