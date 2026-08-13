"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ExternalLink,
  FileCode2,
  FileText,
  Link2,
  Loader2,
  Palette,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { AddDashedButton } from "@/components/ui/add-dashed-button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  emptyBrandKitEffective,
  normalizeHexColor,
  type BrandKitEffective,
  type PartialBrandKitEffective,
  type ProjectApprovedImageBank,
  type ProjectBrandKit,
  type ProjectDesignTemplate,
  type ProjectDesignTemplateAsset,
} from "@/lib/project-brand-kit"
import {
  PROJECT_BRAND_KIT_QUERY_KEY,
  addProjectDesignTemplateLink,
  extractProjectBrand,
  fetchProjectBrandKit,
  removeProjectDesignTemplate,
  removeProjectDesignTemplateAsset,
  saveProjectBrandKitDesign,
  saveProjectBrandKitOverrides,
  updateProjectDesignTemplate,
  uploadProjectDesignTemplateFiles,
} from "@/lib/services/project-brand-kit"
import { getImageUrl } from "@/lib/public-media"
import { preserveTaskDetailsFocusWhenOpeningAi } from "@/components/tasks/ai-pane-focus-url"
import { shallowReplaceSearchParams } from "@/lib/tasks-shallow-nav"
import { cn } from "@/lib/utils"
import { ProjectApprovedImageBanksEditor } from "./project-approved-image-banks-editor"

export type ProjectBrandKitSaveControls = {
  isDirty: boolean
  isSaving: boolean
  canEdit: boolean
  save: () => void
}

type ProjectBrandKitSectionProps = {
  projectId: number
  projectUrl: string | null
  canEdit?: boolean
  onApplied?: (kit: ProjectBrandKit) => void
  onOpenDetails?: () => void
  /** Scroll to and highlight this template when Brand kit opens. */
  focusTemplateId?: string | null
  /** Keep Save brand adjustments pinned in the parent dialog footer. */
  onSaveControlsChange?: (controls: ProjectBrandKitSaveControls | null) => void
}

type ColorKey = keyof BrandKitEffective["colors"]
type FontKey = keyof BrandKitEffective["fonts"]
type FontSizeKey = keyof BrandKitEffective["typography"]["font_sizes"]
type FontWeightKey = keyof BrandKitEffective["typography"]["font_weights"]

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "text_primary", label: "Text primary" },
  { key: "text_secondary", label: "Text secondary" },
]

const FONT_FIELDS: { key: FontKey; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "heading", label: "Heading" },
  { key: "code", label: "Code" },
]

const FONT_SIZE_FIELDS: { key: FontSizeKey; label: string }[] = [
  { key: "h1", label: "H1" },
  { key: "h2", label: "H2" },
  { key: "h3", label: "H3" },
  { key: "body", label: "Body" },
]

const FONT_WEIGHT_FIELDS: { key: FontWeightKey; label: string }[] = [
  { key: "regular", label: "Regular" },
  { key: "medium", label: "Medium" },
  { key: "bold", label: "Bold" },
]

function toTrimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed || null
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function buildOverridesFromDraft(
  source: BrandKitEffective | null,
  draft: BrandKitEffective,
): PartialBrandKitEffective {
  const base = source ?? emptyBrandKitEffective()
  const overrides: PartialBrandKitEffective = {}

  if (draft.color_scheme !== base.color_scheme) {
    overrides.color_scheme = draft.color_scheme
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
    const next = toTrimmedOrNull(draft.fonts[key])
    const prev = toTrimmedOrNull(base.fonts[key])
    if (next !== prev) fontPatch[key] = next
  }
  if (Object.keys(fontPatch).length > 0) overrides.fonts = fontPatch

  const sizePatch: Partial<BrandKitEffective["typography"]["font_sizes"]> = {}
  for (const { key } of FONT_SIZE_FIELDS) {
    const next = toTrimmedOrNull(draft.typography.font_sizes[key])
    const prev = toTrimmedOrNull(base.typography.font_sizes[key])
    if (next !== prev) sizePatch[key] = next
  }
  const weightPatch: Partial<BrandKitEffective["typography"]["font_weights"]> = {}
  for (const { key } of FONT_WEIGHT_FIELDS) {
    const next = toNumberOrNull(draft.typography.font_weights[key])
    const prev = toNumberOrNull(base.typography.font_weights[key])
    if (next !== prev) weightPatch[key] = next
  }
  if (Object.keys(sizePatch).length > 0 || Object.keys(weightPatch).length > 0) {
    overrides.typography = {
      ...(Object.keys(sizePatch).length > 0 ? { font_sizes: sizePatch } : {}),
      ...(Object.keys(weightPatch).length > 0 ? { font_weights: weightPatch } : {}),
    }
  }

  const spacingPatch: Partial<BrandKitEffective["spacing"]> = {}
  if (toNumberOrNull(draft.spacing.base_unit) !== toNumberOrNull(base.spacing.base_unit)) {
    spacingPatch.base_unit = toNumberOrNull(draft.spacing.base_unit)
  }
  if (
    toTrimmedOrNull(draft.spacing.border_radius) !==
    toTrimmedOrNull(base.spacing.border_radius)
  ) {
    spacingPatch.border_radius = toTrimmedOrNull(draft.spacing.border_radius)
  }
  if (Object.keys(spacingPatch).length > 0) overrides.spacing = spacingPatch

  return overrides
}

function looksLikeImagePath(value: string | null | undefined): boolean {
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value ?? "")
}

/** Only real image assets get an <img> preview — Word/PDF/HTML storage URLs must not. */
function assetPreviewUrl(asset: ProjectDesignTemplateAsset): string | null {
  if (asset.media_type && asset.media_type !== "image" && asset.media_type !== "other") {
    return null
  }
  const fromStorage = asset.storage_path ? getImageUrl(asset.storage_path) : null
  const url = asset.url?.trim() || null
  const candidate = fromStorage || url
  if (!candidate) return null
  if (asset.media_type === "image") return candidate
  if (looksLikeImagePath(asset.storage_path) || looksLikeImagePath(url) || looksLikeImagePath(candidate)) {
    return candidate
  }
  return null
}

function linkMeta(url: string | null | undefined): { host: string; path: string } | null {
  if (!url?.trim()) return null
  try {
    const parsed = new URL(url.trim())
    return {
      host: parsed.hostname.replace(/^www\./, ""),
      path: `${parsed.pathname}${parsed.search}`.replace(/\/$/, "") || "/",
    }
  } catch {
    return null
  }
}

function faviconUrlFor(url: string | null | undefined): string | null {
  const meta = linkMeta(url)
  if (!meta) return null
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(meta.host)}&sz=128`
}

function DesignTemplateAssetSnippet({
  asset,
  templateNotes,
}: {
  asset: ProjectDesignTemplateAsset
  templateNotes?: string | null
}) {
  const preview = assetPreviewUrl(asset)
  if (preview) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview} alt={asset.title || "Template asset"} className="h-full w-full object-cover" />
    )
  }

  if (asset.media_type === "video") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-900 text-white">
        <span className="text-lg">▶</span>
        <span className="text-[10px] uppercase tracking-wide text-white/70">Video</span>
      </div>
    )
  }

  const documentExcerpt = (() => {
    const notes = (templateNotes ?? "").trim()
    if (!notes) return null
    const stripped = notes
      .replace(/^HTML excerpt:\s*/i, "")
      .replace(/^Word excerpt:\s*/i, "")
      .trim()
    return stripped || null
  })()

  const looksLikeDoc =
    asset.media_type === "docx"
    || /\.(docx?|rtf)(\?|#|$)/i.test(asset.storage_path || "")
    || /\.(docx?|rtf)(\?|#|$)/i.test(asset.url || "")
    || /\.(docx?|rtf)(\?|#|$)/i.test(asset.title || "")
  const looksLikeHtml =
    asset.media_type === "html"
    || /\.html?(\?|#|$)/i.test(asset.storage_path || "")
    || /\.html?(\?|#|$)/i.test(asset.url || "")
  const looksLikePdf =
    asset.media_type === "pdf"
    || /\.pdf(\?|#|$)/i.test(asset.storage_path || "")
    || /\.pdf(\?|#|$)/i.test(asset.url || "")

  if (looksLikeHtml || looksLikeDoc || looksLikePdf) {
    const label = looksLikeHtml ? "HTML" : looksLikeDoc ? "Word" : "PDF"
    const Icon = looksLikeHtml ? FileCode2 : FileText
    return (
      <div className="flex h-full w-full flex-col bg-slate-50">
        <div className="flex items-center gap-1.5 border-b border-slate-200/80 px-2.5 py-1.5 text-slate-600">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
        </div>
        {documentExcerpt ? (
          <p className="min-h-0 flex-1 overflow-hidden px-2.5 py-2 text-left text-[11px] leading-relaxed text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6]">
            {documentExcerpt}
          </p>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 text-center text-slate-500">
            <Icon className="h-6 w-6" />
            <span className="text-[10px] uppercase tracking-wide">{label}</span>
            {asset.title ? (
              <span className="line-clamp-2 text-[10px] text-slate-400">{asset.title}</span>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  if (asset.media_type === "url" || asset.url) {
    const meta = linkMeta(asset.url)
    const favicon = faviconUrlFor(asset.url)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 px-3 text-center">
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={favicon} alt="" className="h-8 w-8 rounded-md bg-white p-1 shadow-sm" />
        ) : (
          <Link2 className="h-6 w-6 text-slate-500" />
        )}
        <div className="min-w-0 max-w-full">
          <p className="truncate text-xs font-medium text-slate-800">{meta?.host || "Link"}</p>
          {meta?.path && meta.path !== "/" ? (
            <p className="truncate text-[10px] text-slate-500">{meta.path}</p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-100 text-slate-600">
      <FileText className="h-6 w-6" />
      <span className="text-[10px] uppercase tracking-wide">File</span>
    </div>
  )
}

function DesignTemplateCard({
  template,
  canEdit,
  disabled,
  isHighlighted,
  onRemove,
  onAddFiles,
  onRename,
  onEditNotes,
  onRemoveAsset,
}: {
  template: ProjectDesignTemplate
  canEdit: boolean
  disabled?: boolean
  isHighlighted?: boolean
  onRemove: () => void
  onAddFiles: (files: FileList | File[]) => void
  onRename: (title: string) => Promise<void> | void
  onEditNotes: (notes: string) => Promise<void> | void
  onRemoveAsset: (assetId: string) => Promise<void> | void
}) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(template.title ?? "")
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState(template.notes ?? "")
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const assets = template.assets.slice(0, 4)
  const extraCount = Math.max(0, template.assets.length - assets.length)
  const primaryLink = template.assets.find((asset) => asset.url)?.url ?? null

  const commitTitle = async () => {
    const next = titleDraft.trim()
    const current = (template.title ?? "").trim()
    setIsEditingTitle(false)
    if (next === current) return
    setIsSavingTitle(true)
    try {
      await onRename(next)
    } finally {
      setIsSavingTitle(false)
    }
  }

  const commitNotes = async () => {
    const next = notesDraft.trim()
    const current = (template.notes ?? "").trim()
    setIsEditingNotes(false)
    if (next === current) return
    setIsSavingNotes(true)
    try {
      await onEditNotes(next)
    } finally {
      setIsSavingNotes(false)
    }
  }

  return (
    <div
      id={`brand-template-${template.id}`}
      className={cn(
        "group overflow-hidden rounded-lg border bg-white shadow-sm",
        isHighlighted
          ? "border-sky-400 ring-2 ring-sky-200"
          : "border-gray-200",
      )}
    >
      <div
        className={cn(
          "relative aspect-[4/3] bg-gray-100",
          assets.length > 1 && "grid grid-cols-2 grid-rows-2 gap-px",
        )}
      >
        {assets.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">
            Empty template
          </div>
        ) : (
          assets.map((asset, index) => (
            <div
              key={asset.id}
              className={cn(
                "group/asset relative min-h-0 min-w-0 overflow-hidden",
                assets.length === 1 ? "h-full w-full" : "bg-gray-200",
              )}
            >
              <DesignTemplateAssetSnippet
                asset={asset}
                templateNotes={index === 0 ? template.notes : null}
              />
              {canEdit ? (
                <button
                  type="button"
                  disabled={disabled}
                  className="absolute right-1 top-1 z-10 hidden h-6 w-6 items-center justify-center rounded-md bg-white/90 text-gray-600 shadow-sm hover:bg-red-50 hover:text-red-700 disabled:opacity-50 group-hover/asset:flex"
                  aria-label="Remove asset"
                  title="Remove this asset"
                  onClick={() => void onRemoveAsset(asset.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ))
        )}
        {extraCount > 0 ? (
          <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            +{extraCount}
          </div>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          {canEdit && isEditingTitle ? (
            <Input
              value={titleDraft}
              disabled={disabled || isSavingTitle}
              autoFocus
              className="h-8 text-sm"
              placeholder="Template name"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void commitTitle()
                }
                if (e.key === "Escape") {
                  setTitleDraft(template.title ?? "")
                  setIsEditingTitle(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              disabled={!canEdit || disabled || isSavingTitle}
              className={cn(
                "block w-full truncate text-left text-sm font-medium text-gray-900",
                canEdit && "rounded px-0.5 hover:bg-gray-50 hover:underline decoration-gray-300 underline-offset-2",
              )}
              title={canEdit ? "Click to rename" : undefined}
              onClick={() => {
                if (!canEdit) return
                setTitleDraft(template.title ?? "")
                setIsEditingTitle(true)
              }}
            >
              {template.title || "Untitled template"}
            </button>
          )}
          <p className="text-[11px] text-gray-500">
            {template.assets.length} asset{template.assets.length === 1 ? "" : "s"}
            {isSavingTitle || isSavingNotes ? " · saving…" : ""}
          </p>
          {canEdit && isEditingNotes ? (
            <Textarea
              value={notesDraft}
              disabled={disabled || isSavingNotes}
              autoFocus
              rows={3}
              className="mt-1 text-xs"
              placeholder="What should the AI reuse from this template?"
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => void commitNotes()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setNotesDraft(template.notes ?? "")
                  setIsEditingNotes(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              disabled={!canEdit || disabled || isSavingNotes}
              className={cn(
                "mt-0.5 block w-full text-left text-[11px] leading-snug",
                template.notes ? "text-gray-600" : "text-gray-400 italic",
                canEdit && "rounded px-0.5 hover:bg-gray-50",
              )}
              title={canEdit ? "Click to edit description" : undefined}
              onClick={() => {
                if (!canEdit) return
                setNotesDraft(template.notes ?? "")
                setIsEditingNotes(true)
              }}
            >
              <span className="line-clamp-3">
                {template.notes?.trim() || (canEdit ? "Add a description…" : "")}
              </span>
            </button>
          )}
          {primaryLink ? (
            <a
              href={primaryLink}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-sky-700 hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{primaryLink}</span>
            </a>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,application/pdf,text/html,.html,.htm,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx"
              multiple
              onChange={(e) => {
                if (e.target.files?.length) onAddFiles(e.target.files)
                e.target.value = ""
              }}
            />
            <button
              type="button"
              disabled={disabled}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
              aria-label="Add assets to template"
              title="Add assets"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              aria-label="Remove template"
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
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
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="color"
          value={hex}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 rounded border border-gray-200 bg-white p-1"
        />
        <Input
          value={value ?? ""}
          disabled={disabled}
          placeholder="#000000"
          onChange={(e) => onChange(e.target.value || null)}
          className="h-9 min-w-0 flex-1 font-mono text-xs"
        />
      </div>
    </div>
  )
}

function FieldResetRow({
  label,
  canReset,
  disabled,
  onReset,
  children,
}: {
  label: string
  canReset?: boolean
  disabled?: boolean
  onReset?: () => void
  children: ReactNode
}) {
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
      {children}
    </div>
  )
}

export function ProjectBrandKitSection({
  projectId,
  projectUrl,
  canEdit = true,
  onApplied,
  onOpenDetails,
  focusTemplateId = null,
  onSaveControlsChange,
}: ProjectBrandKitSectionProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingTemplate, setIsUploadingTemplate] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<"menu" | "link">("menu")
  const [isDropActive, setIsDropActive] = useState(false)
  const [draft, setDraft] = useState<BrandKitEffective>(emptyBrandKitEffective())
  const [designDescription, setDesignDescription] = useState("")
  const [approvedImageBanks, setApprovedImageBanks] = useState<ProjectApprovedImageBank[]>([])
  const [exampleLink, setExampleLink] = useState("")
  const [exampleLinkTitle, setExampleLinkTitle] = useState("")

  const { data: brandKit, isLoading, error } = useQuery({
    queryKey: [PROJECT_BRAND_KIT_QUERY_KEY, projectId],
    queryFn: () => fetchProjectBrandKit(projectId),
  })

  useEffect(() => {
    if (brandKit) {
      setDraft(brandKit.effective)
      setDesignDescription(brandKit.design_description ?? "")
      setApprovedImageBanks(brandKit.approved_image_banks ?? [])
    }
  }, [brandKit])

  useEffect(() => {
    const id = focusTemplateId?.trim()
    if (!id || !brandKit) return
    const exists = (brandKit.design_templates ?? []).some((entry) => entry.id === id)
    if (!exists) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`brand-template-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [brandKit, focusTemplateId])

  const source = brandKit?.source ?? null
  const resolvedUrl = (projectUrl ?? brandKit?.source_url ?? "").trim()
  const designTemplates = brandKit?.design_templates ?? []

  const isDirty = useMemo(() => {
    if (!brandKit) return false
    const tokensDirty = JSON.stringify(draft) !== JSON.stringify(brandKit.effective)
    const designDirty =
      (designDescription.trim() || null) !== (brandKit.design_description ?? null)
    const banksDirty =
      JSON.stringify(approvedImageBanks) !== JSON.stringify(brandKit.approved_image_banks ?? [])
    return tokensDirty || designDirty || banksDirty
  }, [approvedImageBanks, brandKit, draft, designDescription])

  const hasSource = Boolean(source)

  const syncKit = (next: ProjectBrandKit) => {
    setDraft(next.effective)
    setDesignDescription(next.design_description ?? "")
    setApprovedImageBanks(next.approved_image_banks ?? [])
    queryClient.setQueryData([PROJECT_BRAND_KIT_QUERY_KEY, projectId], next)
    queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] })
    onApplied?.(next)
  }

  const handleExtract = async (replaceAll = false) => {
    if (!canEdit) return
    if (!resolvedUrl) {
      toast({
        title: "Website URL required",
        description: "Set the project URL in Details first, then extract the brand kit.",
        variant: "destructive",
      })
      return
    }

    setIsExtracting(true)
    try {
      const result = await extractProjectBrand({
        projectId,
        url: resolvedUrl,
        replaceAll,
        applyLegacy: true,
      })
      if (!result.ok || !result.brand_kit) {
        throw new Error(result.error || "Brand extract failed")
      }

      syncKit(result.brand_kit)

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
      const tokensSaved = await saveProjectBrandKitOverrides({
        projectId,
        brandKit,
        overrides,
        syncLegacy: true,
      })
      if (tokensSaved.error) throw tokensSaved.error

      const designSaved = await saveProjectBrandKitDesign({
        projectId,
        brandKit: tokensSaved.data,
        designDescription,
        approvedImageBanks,
      })
      if (designSaved.error) throw designSaved.error

      syncKit(designSaved.data)

      toast({
        title: "Brand saved",
        description: "Design direction, image banks, and brand kit adjustments were saved.",
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

  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  useEffect(() => {
    if (!onSaveControlsChange) return
    onSaveControlsChange({
      isDirty,
      isSaving,
      canEdit,
      save: () => {
        void handleSaveRef.current()
      },
    })
    return () => onSaveControlsChange(null)
  }, [canEdit, isDirty, isSaving, onSaveControlsChange])

  const handleAddLink = async () => {
    if (!canEdit || !brandKit) return
    const url = exampleLink.trim()
    if (!url) return
    setIsUploadingTemplate(true)
    try {
      const result = await addProjectDesignTemplateLink({
        projectId,
        brandKit,
        url,
        title: exampleLinkTitle,
      })
      if (result.error || !result.data) throw result.error ?? new Error("Could not add link")
      syncKit(result.data)
      setExampleLink("")
      setExampleLinkTitle("")
      setIsAddOpen(false)
      setAddMode("menu")
      toast({ title: "Template added", description: "Link saved as a brand layout template." })
    } catch (err) {
      toast({
        title: "Could not add link",
        description: err instanceof Error ? err.message : "Upload failed",
        variant: "destructive",
      })
    } finally {
      setIsUploadingTemplate(false)
    }
  }

  const handleUploadFiles = async (
    files: FileList | File[] | null,
    templateId?: string | null,
  ) => {
    if (!canEdit || !brandKit || !files) return
    const list = Array.from(files)
    if (list.length === 0) return
    setIsUploadingTemplate(true)
    try {
      const result = await uploadProjectDesignTemplateFiles({
        projectId,
        brandKit,
        files: list,
        templateId: templateId ?? null,
      })
      if (result.error || !result.data) {
        throw result.error ?? new Error("Could not upload files")
      }
      syncKit(result.data)
      setIsAddOpen(false)
      setAddMode("menu")
      toast({
        title: templateId ? "Assets added" : "Template added",
        description: templateId
          ? "Files were added to the template."
          : list.length > 1
            ? "Multi-image template saved for AI creatives."
            : "Template saved for AI creatives.",
      })
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not upload files",
        variant: "destructive",
      })
    } finally {
      setIsUploadingTemplate(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleRemoveTemplate = async (templateId: string) => {
    if (!canEdit || !brandKit) return
    const result = await removeProjectDesignTemplate({
      projectId,
      brandKit,
      templateId,
    })
    if (result.error) {
      toast({
        title: "Remove failed",
        description: result.error.message,
        variant: "destructive",
      })
      return
    }
    syncKit(result.data)
  }

  const handleRenameTemplate = async (templateId: string, title: string) => {
    if (!canEdit || !brandKit) return
    const result = await updateProjectDesignTemplate({
      projectId,
      brandKit,
      templateId,
      patch: { title },
    })
    if (result.error) {
      toast({
        title: "Rename failed",
        description: result.error.message,
        variant: "destructive",
      })
      return
    }
    syncKit(result.data)
  }

  const handleEditTemplateNotes = async (templateId: string, notes: string) => {
    if (!canEdit || !brandKit) return
    const result = await updateProjectDesignTemplate({
      projectId,
      brandKit,
      templateId,
      patch: { notes },
    })
    if (result.error) {
      toast({
        title: "Could not save description",
        description: result.error.message,
        variant: "destructive",
      })
      return
    }
    syncKit(result.data)
  }

  const handleRemoveTemplateAsset = async (templateId: string, assetId: string) => {
    if (!canEdit || !brandKit) return
    const result = await removeProjectDesignTemplateAsset({
      projectId,
      brandKit,
      templateId,
      assetId,
    })
    if (result.error) {
      toast({
        title: "Could not remove asset",
        description: result.error.message,
        variant: "destructive",
      })
      return
    }
    syncKit(result.data)
  }

  const handleAskAiForTemplates = () => {
    if (typeof window === "undefined") return
    const current = new URLSearchParams(window.location.search)
    const next = preserveTaskDetailsFocusWhenOpeningAi(current)
    next.set("project", String(projectId))
    next.set("projectId", String(projectId))
    const prompt = [
      `For project ${projectId}, draft 2–3 social/layout templates that match this brand.`,
      designDescription.trim()
        ? `Design direction: ${designDescription.trim()}`
        : "Use the project brand kit tokens and any saved layout templates.",
      "Describe each template (format, hierarchy, safe zones, CTA placement) and generate example creatives when helpful.",
      "Save approved creatives back into Brand → Templates (they become project templates automatically).",
    ].join("\n")
    next.set("chatPreFill", encodeURIComponent(prompt))
    next.set("newAiThread", "true")
    shallowReplaceSearchParams(window.location.pathname || "/", next, "brand-ask-ai-templates")
    toast({
      title: "AI chat opened",
      description: "Refine templates in chat — anything saved on the project is a template.",
    })
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
    return <div className="py-4 text-sm text-red-500">Failed to load brand kit.</div>
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-gray-500">
            Extract the visual identity from the project website URL, describe how creatives
            should look, choose approved image banks, and save layout templates for the AI to follow.
          </p>
          {resolvedUrl ? (
            <p className="break-all text-xs text-gray-600 sm:truncate sm:break-normal">
              Source: <span className="font-medium text-gray-800">{resolvedUrl}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              Set the project URL in Details before extracting.{" "}
              {onOpenDetails ? (
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={onOpenDetails}
                >
                  Open Details
                </button>
              ) : null}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canEdit || isExtracting || !resolvedUrl}
            onClick={() => void handleExtract(false)}
            className="gap-2"
          >
            {isExtracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}
            Extract brand
          </Button>
          {hasSource ? (
            <button
              type="button"
              className="text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline disabled:opacity-50"
              disabled={!canEdit || isExtracting || !resolvedUrl}
              onClick={() => void handleExtract(true)}
            >
              Re-extract and replace all overrides
            </button>
          ) : null}
        </div>
        {brandKit?.extracted_at ? (
          <p className="text-[11px] text-gray-400">
            Last extracted {new Date(brandKit.extracted_at).toLocaleString()}
            {brandKit.status === "stale" ? " · overrides active" : ""}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-medium text-gray-900">Design direction</h3>
            <p className="text-xs text-gray-500">
              Describe the look and feel you want for posts and creatives. This is passed to the AI
              with your brand tokens.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 gap-1.5 sm:w-auto"
            onClick={handleAskAiForTemplates}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask AI for templates
          </Button>
        </div>
        <Textarea
          value={designDescription}
          disabled={!canEdit || isSaving}
          rows={4}
          placeholder="e.g. Clean editorial layouts, generous whitespace, bold headlines, photography-led with muted brand accents…"
          onChange={(e) => setDesignDescription(e.target.value)}
        />
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-5">
        <ProjectApprovedImageBanksEditor
          banks={approvedImageBanks}
          canEdit={canEdit}
          disabled={isSaving}
          onChange={setApprovedImageBanks}
        />
      </div>

      <div
        className="relative space-y-3 border-t border-gray-100 pt-5"
        onDragOver={(event) => {
          if (!canEdit) return
          event.preventDefault()
          setIsDropActive(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDropActive(false)
          }
        }}
        onDrop={(event) => {
          if (!canEdit) return
          event.preventDefault()
          event.stopPropagation()
          setIsDropActive(false)
          // Zone drops always create a new template (never append to an existing card).
          void handleUploadFiles(event.dataTransfer?.files ?? null, null)
        }}
      >
        {isDropActive ? (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-sky-400 bg-sky-50/80"
            onDragOver={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onDrop={(event) => {
              if (!canEdit) return
              event.preventDefault()
              event.stopPropagation()
              setIsDropActive(false)
              void handleUploadFiles(event.dataTransfer?.files ?? null, null)
            }}
          >
            <p className="rounded-md bg-white/95 px-3 py-1.5 text-sm font-medium text-sky-800 shadow-sm">
              Drop files to create a template
            </p>
          </div>
        ) : null}

        <div className="space-y-1">
          <h3 className="text-sm font-medium text-gray-900">Templates</h3>
          <p className="text-xs text-gray-500">
            Everything saved here is a layout template for AI creatives. A template can include
            images, videos, PDFs, Word (.doc/.docx), HTML, or a link.
          </p>
        </div>

        {designTemplates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-4 py-8 text-center">
            <p className="text-sm text-gray-500">No templates yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Drop files here, or use Add below.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {designTemplates.map((template) => (
              <li key={template.id}>
                <DesignTemplateCard
                  template={template}
                  canEdit={canEdit}
                  disabled={isUploadingTemplate}
                  isHighlighted={focusTemplateId === template.id}
                  onRemove={() => void handleRemoveTemplate(template.id)}
                  onAddFiles={(files) => void handleUploadFiles(files, template.id)}
                  onRename={(title) => handleRenameTemplate(template.id, title)}
                  onEditNotes={(notes) => handleEditTemplateNotes(template.id, notes)}
                  onRemoveAsset={(assetId) =>
                    handleRemoveTemplateAsset(template.id, assetId)
                  }
                />
              </li>
            ))}
          </ul>
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,application/pdf,text/html,.html,.htm,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx"
          multiple
          onChange={(e) => void handleUploadFiles(e.target.files)}
        />

        {canEdit ? (
          <Popover
            open={isAddOpen}
            onOpenChange={(open) => {
              setIsAddOpen(open)
              if (!open) setAddMode("menu")
            }}
          >
            <PopoverTrigger asChild>
              <AddDashedButton
                label={isUploadingTemplate ? "Adding…" : "Add"}
                disabled={isUploadingTemplate}
                className="mt-0"
              />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              {addMode === "menu" ? (
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-gray-800 hover:bg-muted"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 text-gray-500" />
                    Upload files
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-gray-800 hover:bg-muted"
                    onClick={() => setAddMode("link")}
                  >
                    <Link2 className="h-4 w-4 text-gray-500" />
                    Add link
                  </button>
                </div>
              ) : (
                <div className="space-y-2 p-1">
                  <Input
                    value={exampleLink}
                    disabled={isUploadingTemplate}
                    placeholder="https://…"
                    autoFocus
                    onChange={(e) => setExampleLink(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void handleAddLink()
                      }
                    }}
                  />
                  <Input
                    value={exampleLinkTitle}
                    disabled={isUploadingTemplate}
                    placeholder="Optional title"
                    onChange={(e) => setExampleLinkTitle(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isUploadingTemplate}
                      onClick={() => setAddMode("menu")}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isUploadingTemplate || !exampleLink.trim()}
                      onClick={() => void handleAddLink()}
                    >
                      {isUploadingTemplate ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-medium text-gray-900">Colors</h3>
          <select
            className="h-8 w-full max-w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 sm:w-auto"
            value={draft.color_scheme ?? ""}
            disabled={!canEdit || isSaving}
            onChange={(e) =>
              setDraft((prev) => ({
                ...prev,
                color_scheme:
                  e.target.value === "light" || e.target.value === "dark"
                    ? e.target.value
                    : null,
              }))
            }
          >
            <option value="">Color scheme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {COLOR_FIELDS.map(({ key, label }) => (
            <ColorSwatch
              key={key}
              label={label}
              value={draft.colors[key]}
              disabled={!canEdit || isSaving}
              canReset={Boolean(hasSource && draft.colors[key] !== source?.colors[key])}
              onReset={() =>
                source &&
                setDraft((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, [key]: source.colors[key] },
                }))
              }
              onChange={(next) =>
                setDraft((prev) => ({
                  ...prev,
                  colors: { ...prev.colors, [key]: next },
                }))
              }
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-5">
        <h3 className="text-sm font-medium text-gray-900">Font families</h3>
        <div className="grid gap-3">
          {FONT_FIELDS.map(({ key, label }) => (
            <FieldResetRow
              key={key}
              label={label}
              disabled={!canEdit || isSaving}
              canReset={Boolean(hasSource && draft.fonts[key] !== source?.fonts[key])}
              onReset={() =>
                source &&
                setDraft((prev) => ({
                  ...prev,
                  fonts: { ...prev.fonts, [key]: source.fonts[key] },
                }))
              }
            >
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
            </FieldResetRow>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-5">
        <h3 className="text-sm font-medium text-gray-900">Font sizes</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {FONT_SIZE_FIELDS.map(({ key, label }) => (
            <FieldResetRow
              key={key}
              label={label}
              disabled={!canEdit || isSaving}
              canReset={Boolean(
                hasSource &&
                  draft.typography.font_sizes[key] !== source?.typography.font_sizes[key],
              )}
              onReset={() =>
                source &&
                setDraft((prev) => ({
                  ...prev,
                  typography: {
                    ...prev.typography,
                    font_sizes: {
                      ...prev.typography.font_sizes,
                      [key]: source.typography.font_sizes[key],
                    },
                  },
                }))
              }
            >
              <Input
                value={draft.typography.font_sizes[key] ?? ""}
                disabled={!canEdit || isSaving}
                placeholder="e.g. 48px"
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    typography: {
                      ...prev.typography,
                      font_sizes: {
                        ...prev.typography.font_sizes,
                        [key]: e.target.value || null,
                      },
                    },
                  }))
                }
              />
            </FieldResetRow>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-5">
        <h3 className="text-sm font-medium text-gray-900">Font weights</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {FONT_WEIGHT_FIELDS.map(({ key, label }) => (
            <FieldResetRow
              key={key}
              label={label}
              disabled={!canEdit || isSaving}
              canReset={Boolean(
                hasSource &&
                  draft.typography.font_weights[key] !==
                    source?.typography.font_weights[key],
              )}
              onReset={() =>
                source &&
                setDraft((prev) => ({
                  ...prev,
                  typography: {
                    ...prev.typography,
                    font_weights: {
                      ...prev.typography.font_weights,
                      [key]: source.typography.font_weights[key],
                    },
                  },
                }))
              }
            >
              <Input
                type="number"
                value={draft.typography.font_weights[key] ?? ""}
                disabled={!canEdit || isSaving}
                placeholder="e.g. 400"
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    typography: {
                      ...prev.typography,
                      font_weights: {
                        ...prev.typography.font_weights,
                        [key]: toNumberOrNull(e.target.value),
                      },
                    },
                  }))
                }
              />
            </FieldResetRow>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 pt-5">
        <h3 className="text-sm font-medium text-gray-900">Spacing</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldResetRow
            label="Base unit (px)"
            disabled={!canEdit || isSaving}
            canReset={Boolean(
              hasSource && draft.spacing.base_unit !== source?.spacing.base_unit,
            )}
            onReset={() =>
              source &&
              setDraft((prev) => ({
                ...prev,
                spacing: { ...prev.spacing, base_unit: source.spacing.base_unit },
              }))
            }
          >
            <Input
              type="number"
              value={draft.spacing.base_unit ?? ""}
              disabled={!canEdit || isSaving}
              placeholder="e.g. 8"
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  spacing: {
                    ...prev.spacing,
                    base_unit: toNumberOrNull(e.target.value),
                  },
                }))
              }
            />
          </FieldResetRow>
          <FieldResetRow
            label="Border radius"
            disabled={!canEdit || isSaving}
            canReset={Boolean(
              hasSource &&
                draft.spacing.border_radius !== source?.spacing.border_radius,
            )}
            onReset={() =>
              source &&
              setDraft((prev) => ({
                ...prev,
                spacing: {
                  ...prev.spacing,
                  border_radius: source.spacing.border_radius,
                },
              }))
            }
          >
            <Input
              value={draft.spacing.border_radius ?? ""}
              disabled={!canEdit || isSaving}
              placeholder="e.g. 8px"
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  spacing: {
                    ...prev.spacing,
                    border_radius: e.target.value || null,
                  },
                }))
              }
            />
          </FieldResetRow>
        </div>
      </div>

      {!onSaveControlsChange ? (
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!canEdit || !isDirty || isSaving}
            onClick={() => void handleSave()}
            className="w-full shrink-0 gap-2 sm:w-auto"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save brand adjustments
          </Button>
        </div>
      ) : null}
    </div>
  )
}
