/**
 * Canonical project brand kit — shared by FE and edge-function contracts.
 * Firecrawl branding payloads are normalized into this shape before persistence.
 */

export const PROJECT_BRAND_KIT_SCHEMA_VERSION = 1 as const

export type BrandColorScheme = "light" | "dark"

export type BrandKitColors = {
  primary: string | null
  secondary: string | null
  accent: string | null
  background: string | null
  text_primary: string | null
  text_secondary: string | null
}

export type BrandKitFonts = {
  primary: string | null
  heading: string | null
  code: string | null
}

export type BrandKitTypography = {
  font_sizes: {
    h1: string | null
    h2: string | null
    h3: string | null
    body: string | null
  }
  font_weights: {
    regular: number | null
    medium: number | null
    bold: number | null
  }
}

export type BrandKitSpacing = {
  base_unit: number | null
  border_radius: string | null
}

export type BrandKitEffective = {
  color_scheme: BrandColorScheme | null
  logo_path: string | null
  favicon_path: string | null
  colors: BrandKitColors
  fonts: BrandKitFonts
  typography: BrandKitTypography
  spacing: BrandKitSpacing
}

export type ProjectBrandKitStatus = "empty" | "ready" | "stale"

/** Media kinds allowed inside a design template. */
export type ProjectDesignMediaType =
  | "image"
  | "video"
  | "pdf"
  | "html"
  | "docx"
  | "url"
  | "other"

/** @deprecated Use ProjectDesignMediaType */
export type ProjectDesignExampleMediaType = ProjectDesignMediaType

/** One visual asset inside a layout template (image, video, PDF, or link). */
export type ProjectDesignTemplateAsset = {
  id: string
  media_type: ProjectDesignMediaType
  title: string | null
  /** External URL (link, hosted media, or public storage URL). */
  url: string | null
  /** Storage path in public-media when uploaded. */
  storage_path: string | null
  mime_type: string | null
}

/**
 * Layout/post template used as visual guidance for AI creatives.
 * A template may contain multiple images/assets (carousel, multi-panel, etc.).
 */
export type ProjectDesignTemplate = {
  id: string
  title: string | null
  notes: string | null
  assets: ProjectDesignTemplateAsset[]
  source_artifact_id: string | null
  created_at: string
}

function newDesignTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `tpl-${Date.now().toString(36)}`
}

/** Build a URL/link template card (project or personal). */
export function buildLinkDesignTemplate(args: {
  url: string
  title?: string | null
  notes?: string | null
}): ProjectDesignTemplate {
  const url = args.url.trim()
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
  const title = args.title?.trim() || hostname || url
  return {
    id: newDesignTemplateId(),
    title,
    notes: args.notes?.trim() || null,
    assets: [
      {
        id: newDesignTemplateId(),
        media_type: looksLikeHtml ? "html" : looksLikeDocx ? "docx" : "url",
        title,
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
}

/** Known stock / photography libraries teams often approve for creatives. */
export type ProjectApprovedImageBankProvider =
  | "istock"
  | "shutterstock"
  | "adobe_stock"
  | "getty"
  | "unsplash"
  | "pexels"
  | "custom"

export type ProjectApprovedImageBank = {
  id: string
  provider: ProjectApprovedImageBankProvider
  /** Display name (defaults from provider when empty). */
  label: string
  /** Catalog / account / collection URL when useful for the AI or team. */
  url: string | null
  /** License constraints, preferred collections, search tips, etc. */
  notes: string | null
  enabled: boolean
}

export const APPROVED_IMAGE_BANK_PRESETS: Array<{
  provider: Exclude<ProjectApprovedImageBankProvider, "custom">
  label: string
  url: string
}> = [
  { provider: "istock", label: "iStock", url: "https://www.istockphoto.com/" },
  { provider: "shutterstock", label: "Shutterstock", url: "https://www.shutterstock.com/" },
  { provider: "adobe_stock", label: "Adobe Stock", url: "https://stock.adobe.com/" },
  { provider: "getty", label: "Getty Images", url: "https://www.gettyimages.com/" },
  { provider: "unsplash", label: "Unsplash", url: "https://unsplash.com/" },
  { provider: "pexels", label: "Pexels", url: "https://www.pexels.com/" },
]

export function defaultLabelForImageBankProvider(
  provider: ProjectApprovedImageBankProvider,
): string {
  const preset = APPROVED_IMAGE_BANK_PRESETS.find((entry) => entry.provider === provider)
  if (preset) return preset.label
  return "Custom library"
}

/** @deprecated Flat single-asset shape — migrated into ProjectDesignTemplate on parse. */
export type ProjectDesignExample = {
  id: string
  kind?: "example" | "template"
  media_type: ProjectDesignMediaType
  title: string | null
  url: string | null
  storage_path: string | null
  mime_type: string | null
  notes: string | null
  source_artifact_id: string | null
  created_at: string
}

export type ProjectBrandKit = {
  schema_version: typeof PROJECT_BRAND_KIT_SCHEMA_VERSION
  status: ProjectBrandKitStatus
  source_url: string | null
  extracted_at: string | null
  last_run_id: string | null
  /** Free-text description of the desired design / visual system. */
  design_description: string | null
  /** Layout templates (multi-asset) for AI visual reference. */
  design_templates: ProjectDesignTemplate[]
  /** Stock / image libraries the team may source photography from. */
  approved_image_banks: ProjectApprovedImageBank[]
  effective: BrandKitEffective
  overrides: PartialBrandKitEffective
  source: BrandKitEffective | null
}

export type PartialBrandKitEffective = {
  color_scheme?: BrandColorScheme | null
  logo_path?: string | null
  favicon_path?: string | null
  colors?: Partial<BrandKitColors>
  fonts?: Partial<BrandKitFonts>
  typography?: {
    font_sizes?: Partial<BrandKitTypography["font_sizes"]>
    font_weights?: Partial<BrandKitTypography["font_weights"]>
  }
  spacing?: Partial<BrandKitSpacing>
}

export function emptyBrandKitColors(): BrandKitColors {
  return {
    primary: null,
    secondary: null,
    accent: null,
    background: null,
    text_primary: null,
    text_secondary: null,
  }
}

export function emptyBrandKitFonts(): BrandKitFonts {
  return {
    primary: null,
    heading: null,
    code: null,
  }
}

export function emptyBrandKitTypography(): BrandKitTypography {
  return {
    font_sizes: { h1: null, h2: null, h3: null, body: null },
    font_weights: { regular: null, medium: null, bold: null },
  }
}

export function emptyBrandKitSpacing(): BrandKitSpacing {
  return {
    base_unit: null,
    border_radius: null,
  }
}

export function emptyBrandKitEffective(): BrandKitEffective {
  return {
    color_scheme: null,
    logo_path: null,
    favicon_path: null,
    colors: emptyBrandKitColors(),
    fonts: emptyBrandKitFonts(),
    typography: emptyBrandKitTypography(),
    spacing: emptyBrandKitSpacing(),
  }
}

export function emptyProjectBrandKit(): ProjectBrandKit {
  return {
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    status: "empty",
    source_url: null,
    extracted_at: null,
    last_run_id: null,
    design_description: null,
    design_templates: [],
    approved_image_banks: [],
    effective: emptyBrandKitEffective(),
    overrides: {},
    source: null,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function normalizeHexColor(value: unknown): string | null {
  const raw = toTrimmedString(value)
  if (!raw) return null
  const withHash = raw.startsWith("#") ? raw : `#${raw}`
  if (!HEX_RE.test(withHash)) return null
  if (withHash.length === 4) {
    const [, r, g, b] = withHash
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return withHash.toUpperCase()
}

function normalizeColorScheme(value: unknown): BrandColorScheme | null {
  const raw = toTrimmedString(value)?.toLowerCase()
  if (raw === "light" || raw === "dark") return raw
  return null
}

function normalizeColors(raw: unknown): BrandKitColors {
  const record = asRecord(raw) ?? {}
  return {
    primary: normalizeHexColor(record.primary ?? record.primaryColor),
    secondary: normalizeHexColor(record.secondary ?? record.secondaryColor),
    accent: normalizeHexColor(record.accent ?? record.accentColor),
    background: normalizeHexColor(record.background ?? record.backgroundColor),
    text_primary: normalizeHexColor(
      record.text_primary ?? record.textPrimary ?? record.text,
    ),
    text_secondary: normalizeHexColor(
      record.text_secondary ?? record.textSecondary ?? record.mutedText,
    ),
  }
}

function normalizeFonts(raw: unknown, typographyFamilies: unknown): BrandKitFonts {
  const families = asRecord(typographyFamilies) ?? {}
  const fontsRecord = asRecord(raw)
  const fontsList = Array.isArray(raw) ? raw : null

  const fromList = (index: number): string | null => {
    const item = fontsList?.[index]
    if (typeof item === "string") return toTrimmedString(item)
    const record = asRecord(item)
    return toTrimmedString(record?.family ?? record?.name)
  }

  return {
    primary:
      toTrimmedString(families.primary) ??
      toTrimmedString(fontsRecord?.primary) ??
      fromList(0),
    heading:
      toTrimmedString(families.heading) ??
      toTrimmedString(fontsRecord?.heading) ??
      fromList(0),
    code:
      toTrimmedString(families.code) ??
      toTrimmedString(fontsRecord?.code) ??
      fromList(1),
  }
}

function normalizeTypography(raw: unknown): BrandKitTypography {
  const record = asRecord(raw) ?? {}
  const sizes = asRecord(record.font_sizes ?? record.fontSizes) ?? {}
  const weights = asRecord(record.font_weights ?? record.fontWeights) ?? {}
  return {
    font_sizes: {
      h1: toTrimmedString(sizes.h1),
      h2: toTrimmedString(sizes.h2),
      h3: toTrimmedString(sizes.h3),
      body: toTrimmedString(sizes.body),
    },
    font_weights: {
      regular: toFiniteNumber(weights.regular),
      medium: toFiniteNumber(weights.medium),
      bold: toFiniteNumber(weights.bold),
    },
  }
}

function normalizeSpacing(raw: unknown): BrandKitSpacing {
  const record = asRecord(raw) ?? {}
  return {
    base_unit: toFiniteNumber(record.base_unit ?? record.baseUnit),
    border_radius: toTrimmedString(record.border_radius ?? record.borderRadius),
  }
}

export function normalizeBrandKitEffective(
  raw: unknown,
  extras?: { logo_path?: string | null; favicon_path?: string | null },
): BrandKitEffective {
  const record = asRecord(raw) ?? {}
  const images = asRecord(record.images) ?? {}
  const typography = asRecord(record.typography) ?? {}
  const empty = emptyBrandKitEffective()

  return {
    color_scheme: normalizeColorScheme(record.color_scheme ?? record.colorScheme),
    logo_path:
      extras?.logo_path !== undefined
        ? extras.logo_path
        : toTrimmedString(record.logo_path ?? record.logo ?? images.logo),
    favicon_path:
      extras?.favicon_path !== undefined
        ? extras.favicon_path
        : toTrimmedString(record.favicon_path ?? images.favicon),
    colors: { ...empty.colors, ...normalizeColors(record.colors) },
    fonts: {
      ...empty.fonts,
      ...normalizeFonts(record.fonts, typography.fontFamilies ?? typography.font_families),
    },
    typography: normalizeTypography(record.typography),
    spacing: normalizeSpacing(record.spacing),
  }
}

function mergePartialColors(
  base: BrandKitColors,
  patch: Partial<BrandKitColors> | undefined,
): BrandKitColors {
  if (!patch) return base
  return {
    primary: patch.primary !== undefined ? normalizeHexColor(patch.primary) : base.primary,
    secondary:
      patch.secondary !== undefined ? normalizeHexColor(patch.secondary) : base.secondary,
    accent: patch.accent !== undefined ? normalizeHexColor(patch.accent) : base.accent,
    background:
      patch.background !== undefined ? normalizeHexColor(patch.background) : base.background,
    text_primary:
      patch.text_primary !== undefined
        ? normalizeHexColor(patch.text_primary)
        : base.text_primary,
    text_secondary:
      patch.text_secondary !== undefined
        ? normalizeHexColor(patch.text_secondary)
        : base.text_secondary,
  }
}

function mergePartialFonts(
  base: BrandKitFonts,
  patch: Partial<BrandKitFonts> | undefined,
): BrandKitFonts {
  if (!patch) return base
  return {
    primary: patch.primary !== undefined ? toTrimmedString(patch.primary) : base.primary,
    heading: patch.heading !== undefined ? toTrimmedString(patch.heading) : base.heading,
    code: patch.code !== undefined ? toTrimmedString(patch.code) : base.code,
  }
}

export function mergeBrandKitEffective(
  source: BrandKitEffective,
  overrides: PartialBrandKitEffective | null | undefined,
): BrandKitEffective {
  if (!overrides || Object.keys(overrides).length === 0) return source

  const typographyOverride = overrides.typography
  const spacingOverride = overrides.spacing

  return {
    color_scheme:
      overrides.color_scheme !== undefined
        ? normalizeColorScheme(overrides.color_scheme)
        : source.color_scheme,
    logo_path:
      overrides.logo_path !== undefined
        ? toTrimmedString(overrides.logo_path)
        : source.logo_path,
    favicon_path:
      overrides.favicon_path !== undefined
        ? toTrimmedString(overrides.favicon_path)
        : source.favicon_path,
    colors: mergePartialColors(source.colors, overrides.colors),
    fonts: mergePartialFonts(source.fonts, overrides.fonts),
    typography: {
      font_sizes: {
        ...source.typography.font_sizes,
        ...(typographyOverride?.font_sizes ?? {}),
      },
      font_weights: {
        ...source.typography.font_weights,
        ...(typographyOverride?.font_weights ?? {}),
      },
    },
    spacing: {
      base_unit:
        spacingOverride?.base_unit !== undefined
          ? toFiniteNumber(spacingOverride.base_unit)
          : source.spacing.base_unit,
      border_radius:
        spacingOverride?.border_radius !== undefined
          ? toTrimmedString(spacingOverride.border_radius)
          : source.spacing.border_radius,
    },
  }
}

function normalizeDesignMediaType(value: unknown): ProjectDesignMediaType {
  const raw = toTrimmedString(value)?.toLowerCase()
  if (
    raw === "image"
    || raw === "video"
    || raw === "pdf"
    || raw === "html"
    || raw === "docx"
    || raw === "url"
    || raw === "other"
  ) {
    return raw
  }
  // Legacy aliases
  if (raw === "htm" || raw === "xhtml") return "html"
  if (raw === "doc" || raw === "word" || raw === "msword") return "docx"
  return "other"
}

export function normalizeDesignTemplateAsset(raw: unknown): ProjectDesignTemplateAsset | null {
  const record = asRecord(raw)
  if (!record) return null
  const id = toTrimmedString(record.id)
  if (!id) return null
  return {
    id,
    media_type: normalizeDesignMediaType(record.media_type ?? record.mediaType),
    title: toTrimmedString(record.title),
    url: toTrimmedString(record.url),
    storage_path: toTrimmedString(record.storage_path ?? record.storagePath),
    mime_type: toTrimmedString(record.mime_type ?? record.mimeType),
  }
}

/** Migrate legacy flat design_examples entries into a single-asset template. */
function templateFromLegacyExample(raw: unknown): ProjectDesignTemplate | null {
  const record = asRecord(raw)
  if (!record) return null
  const id = toTrimmedString(record.id)
  if (!id) return null
  const asset: ProjectDesignTemplateAsset = {
    id: `${id}-asset`,
    media_type: normalizeDesignMediaType(record.media_type ?? record.mediaType),
    title: toTrimmedString(record.title),
    url: toTrimmedString(record.url),
    storage_path: toTrimmedString(record.storage_path ?? record.storagePath),
    mime_type: toTrimmedString(record.mime_type ?? record.mimeType),
  }
  return {
    id,
    title: toTrimmedString(record.title),
    notes: toTrimmedString(record.notes),
    assets: [asset],
    source_artifact_id: toTrimmedString(record.source_artifact_id ?? record.sourceArtifactId),
    created_at: toTrimmedString(record.created_at ?? record.createdAt) ?? new Date().toISOString(),
  }
}

export function normalizeDesignTemplate(raw: unknown): ProjectDesignTemplate | null {
  const record = asRecord(raw)
  if (!record) return null
  const id = toTrimmedString(record.id)
  if (!id) return null

  const assetsRaw = record.assets
  if (Array.isArray(assetsRaw)) {
    const assets: ProjectDesignTemplateAsset[] = []
    for (const entry of assetsRaw) {
      const asset = normalizeDesignTemplateAsset(entry)
      if (asset) assets.push(asset)
    }
    if (assets.length === 0) return null
    return {
      id,
      title: toTrimmedString(record.title),
      notes: toTrimmedString(record.notes),
      assets,
      source_artifact_id: toTrimmedString(record.source_artifact_id ?? record.sourceArtifactId),
      created_at: toTrimmedString(record.created_at ?? record.createdAt) ?? new Date().toISOString(),
    }
  }

  // Flat legacy shape (design_examples item without assets[]).
  return templateFromLegacyExample(record)
}

export function normalizeDesignTemplates(raw: unknown): ProjectDesignTemplate[] {
  if (!Array.isArray(raw)) return []
  const out: ProjectDesignTemplate[] = []
  for (const entry of raw) {
    const normalized = normalizeDesignTemplate(entry)
    if (normalized) out.push(normalized)
  }
  return out
}

/** Resolve templates from either the new field or legacy design_examples. */
export function resolveDesignTemplates(record: Record<string, unknown>): ProjectDesignTemplate[] {
  const fromTemplates = normalizeDesignTemplates(
    record.design_templates ?? record.designTemplates,
  )
  if (fromTemplates.length > 0) return fromTemplates
  return normalizeDesignTemplates(record.design_examples ?? record.designExamples)
}

const IMAGE_BANK_PROVIDERS = new Set<ProjectApprovedImageBankProvider>([
  "istock",
  "shutterstock",
  "adobe_stock",
  "getty",
  "unsplash",
  "pexels",
  "custom",
])

function normalizeImageBankProvider(value: unknown): ProjectApprovedImageBankProvider {
  const raw = toTrimmedString(value)?.toLowerCase().replace(/[\s-]+/g, "_")
  if (raw && IMAGE_BANK_PROVIDERS.has(raw as ProjectApprovedImageBankProvider)) {
    return raw as ProjectApprovedImageBankProvider
  }
  // Soft aliases from free-text labels.
  if (raw?.includes("istock")) return "istock"
  if (raw?.includes("shutter")) return "shutterstock"
  if (raw?.includes("adobe")) return "adobe_stock"
  if (raw?.includes("getty")) return "getty"
  if (raw?.includes("unsplash")) return "unsplash"
  if (raw?.includes("pexels")) return "pexels"
  return "custom"
}

export function normalizeApprovedImageBank(raw: unknown): ProjectApprovedImageBank | null {
  const record = asRecord(raw)
  if (!record) return null
  const id = toTrimmedString(record.id) || cryptoRandomId()
  const provider = normalizeImageBankProvider(record.provider ?? record.name ?? record.label)
  const label =
    toTrimmedString(record.label ?? record.name ?? record.title)
    || defaultLabelForImageBankProvider(provider)
  const url = toTrimmedString(record.url ?? record.href)
  const notes = toTrimmedString(record.notes ?? record.description)
  const enabled =
    typeof record.enabled === "boolean"
      ? record.enabled
      : record.enabled == null
        ? true
        : Boolean(record.enabled)
  return { id, provider, label, url, notes, enabled }
}

export function normalizeApprovedImageBanks(raw: unknown): ProjectApprovedImageBank[] {
  if (!Array.isArray(raw)) return []
  const out: ProjectApprovedImageBank[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const normalized = normalizeApprovedImageBank(entry)
    if (!normalized) continue
    const key = `${normalized.provider}:${normalized.label.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `bank_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function createApprovedImageBank(args: {
  provider: ProjectApprovedImageBankProvider
  label?: string | null
  url?: string | null
  notes?: string | null
  enabled?: boolean
}): ProjectApprovedImageBank {
  const preset = APPROVED_IMAGE_BANK_PRESETS.find((entry) => entry.provider === args.provider)
  return {
    id: cryptoRandomId(),
    provider: args.provider,
    label: toTrimmedString(args.label) || preset?.label || defaultLabelForImageBankProvider(args.provider),
    url: toTrimmedString(args.url) || preset?.url || null,
    notes: toTrimmedString(args.notes),
    enabled: args.enabled ?? true,
  }
}

function effectiveHasVisualTokens(effective: BrandKitEffective): boolean {
  const colors = Object.values(effective.colors).some(Boolean)
  const fonts = Object.values(effective.fonts).some(Boolean)
  return Boolean(
    colors
    || fonts
    || effective.color_scheme
    || effective.logo_path
    || effective.favicon_path
    || effective.spacing.base_unit != null
    || effective.spacing.border_radius,
  )
}

/** True when the kit has nothing useful for humans or AI. */
export function isProjectBrandKitVacant(kit: ProjectBrandKit): boolean {
  if (kit.design_description?.trim()) return false
  if (kit.design_templates.length > 0) return false
  if (kit.approved_image_banks.some((bank) => bank.enabled)) return false
  if (kit.source) return false
  return !effectiveHasVisualTokens(kit.effective)
}

function resolveBrandKitStatus(args: {
  statusRaw: string | null
  source: BrandKitEffective | null
  overrides: PartialBrandKitEffective
  designDescription: string | null
  designTemplates: ProjectDesignTemplate[]
  approvedImageBanks?: ProjectApprovedImageBank[]
}): ProjectBrandKitStatus {
  const hasOverrides = hasOverrideKeys(args.overrides)
  const hasDesign =
    Boolean(args.designDescription?.trim())
    || args.designTemplates.length > 0
    || (args.approvedImageBanks ?? []).some((bank) => bank.enabled)

  if (args.source) return hasOverrides ? "stale" : "ready"
  if (hasDesign || effectiveHasVisualTokens(args.source ?? emptyBrandKitEffective())) {
    return "ready"
  }
  // When only overrides exist without source (manual-only kit).
  if (hasOverrides) return "ready"
  if (args.statusRaw === "ready" || args.statusRaw === "stale") return "ready"
  return "empty"
}

function hasOverrideKeys(overrides: PartialBrandKitEffective | null | undefined): boolean {
  if (!overrides) return false
  return Object.keys(overrides).length > 0
}

export function parseProjectBrandKit(raw: unknown): ProjectBrandKit {
  const record = asRecord(raw)
  if (!record || Object.keys(record).length === 0) return emptyProjectBrandKit()

  const source = record.source
    ? normalizeBrandKitEffective(record.source)
    : null
  const overrides = (asRecord(record.overrides) ?? {}) as PartialBrandKitEffective
  const effectiveRaw = record.effective
    ? normalizeBrandKitEffective(record.effective)
    : source
      ? mergeBrandKitEffective(source, overrides)
      : emptyBrandKitEffective()

  const designDescription = toTrimmedString(record.design_description ?? record.designDescription)
  const designTemplates = resolveDesignTemplates(record)
  const approvedImageBanks = normalizeApprovedImageBanks(
    record.approved_image_banks ?? record.approvedImageBanks,
  )
  const statusRaw = toTrimmedString(record.status)
  const status = resolveBrandKitStatus({
    statusRaw,
    source,
    overrides,
    designDescription,
    designTemplates,
    approvedImageBanks,
  })

  // Manual token edits without extract still count as ready.
  const finalStatus =
    status === "empty" && effectiveHasVisualTokens(effectiveRaw) ? "ready" : status

  return {
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    status: finalStatus,
    source_url: toTrimmedString(record.source_url),
    extracted_at: toTrimmedString(record.extracted_at),
    last_run_id: toTrimmedString(record.last_run_id),
    design_description: designDescription,
    design_templates: designTemplates,
    approved_image_banks: approvedImageBanks,
    effective: effectiveRaw,
    overrides,
    source,
  }
}

/**
 * Apply a fresh Firecrawl-normalized source onto an existing kit.
 * Preserves user overrides unless `replaceAll` is true.
 */
export function applyExtractedBrandSource(args: {
  previous: ProjectBrandKit | null | undefined
  source: BrandKitEffective
  sourceUrl: string
  runId: string
  replaceAll?: boolean
}): ProjectBrandKit {
  const previous = args.previous ?? emptyProjectBrandKit()
  const overrides = args.replaceAll ? {} : previous.overrides
  const hasOverrides = hasOverrideKeys(overrides)

  return {
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    status: hasOverrides ? "stale" : "ready",
    source_url: args.sourceUrl,
    extracted_at: new Date().toISOString(),
    last_run_id: args.runId,
    design_description: previous.design_description,
    design_templates: previous.design_templates,
    approved_image_banks: previous.approved_image_banks,
    source: args.source,
    overrides,
    effective: mergeBrandKitEffective(args.source, overrides),
  }
}

export function applyBrandKitOverrides(args: {
  previous: ProjectBrandKit
  overrides: PartialBrandKitEffective
}): ProjectBrandKit {
  const source = args.previous.source ?? emptyBrandKitEffective()
  const overrides = args.overrides
  const next: ProjectBrandKit = {
    ...args.previous,
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    status: args.previous.source ? (hasOverrideKeys(overrides) ? "stale" : "ready") : "ready",
    overrides,
    effective: mergeBrandKitEffective(source, overrides),
  }
  if (isProjectBrandKitVacant(next) && !args.previous.source) {
    next.status = "empty"
  }
  return next
}

/** Persist design direction + visual templates without touching token overrides. */
export function applyBrandKitDesignFields(args: {
  previous: ProjectBrandKit
  designDescription?: string | null
  designTemplates?: ProjectDesignTemplate[]
  approvedImageBanks?: ProjectApprovedImageBank[]
}): ProjectBrandKit {
  const designDescription =
    args.designDescription !== undefined
      ? toTrimmedString(args.designDescription)
      : args.previous.design_description
  const designTemplates =
    args.designTemplates !== undefined
      ? normalizeDesignTemplates(args.designTemplates)
      : args.previous.design_templates
  const approvedImageBanks =
    args.approvedImageBanks !== undefined
      ? normalizeApprovedImageBanks(args.approvedImageBanks)
      : args.previous.approved_image_banks

  const next: ProjectBrandKit = {
    ...args.previous,
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    design_description: designDescription,
    design_templates: designTemplates,
    approved_image_banks: approvedImageBanks,
  }
  next.status = resolveBrandKitStatus({
    statusRaw: next.status,
    source: next.source,
    overrides: next.overrides,
    designDescription: next.design_description,
    designTemplates: next.design_templates,
    approvedImageBanks: next.approved_image_banks,
  })
  if (next.status === "empty" && effectiveHasVisualTokens(next.effective)) {
    next.status = "ready"
  }
  return next
}

/** Compact payload for AI-chat / worker injection. */
export function getEffectiveBrandKitForAi(kit: ProjectBrandKit | null | undefined) {
  const effective = kit?.effective ?? emptyBrandKitEffective()
  return {
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    status: kit?.status ?? "empty",
    source_url: kit?.source_url ?? null,
    design_description: kit?.design_description ?? null,
    design_templates: kit?.design_templates ?? [],
    approved_image_banks: (kit?.approved_image_banks ?? []).filter((bank) => bank.enabled),
    ...effective,
  }
}

/**
 * Build the AI-facing brand kit from a projects row (or any object with brand_kit).
 * Returns null when empty so callers can omit it from prompts/tools.
 */
export function brandKitForAiFromProject(
  project: { brand_kit?: unknown } | null | undefined,
) {
  if (!project) return null
  const kit = parseProjectBrandKit(project.brand_kit)
  if (isProjectBrandKitVacant(kit)) return null
  return getEffectiveBrandKitForAi(kit)
}

function assetHref(asset: ProjectDesignTemplateAsset): string | null {
  return asset.url?.trim() || asset.storage_path?.trim() || null
}

export type BrandTemplateVisualRef = {
  template_id: string
  template_title: string | null
  asset_id: string
  title: string | null
  url: string | null
  storage_path: string | null
  media_type: ProjectDesignMediaType
}

function looksLikeImagePath(value: string | null | undefined): boolean {
  return Boolean(value && /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value))
}

/**
 * Collect image assets from brand layout templates for multimodal generation.
 * Prefers uploaded images; includes link assets only when the URL points at an image file.
 */
export function collectBrandTemplateVisualRefs(
  brandKit:
    | ReturnType<typeof getEffectiveBrandKitForAi>
    | ProjectBrandKit
    | null
    | undefined,
  max = 8,
): BrandTemplateVisualRef[] {
  const templates = brandKit?.design_templates ?? []
  const out: BrandTemplateVisualRef[] = []
  for (const template of templates) {
    for (const asset of template.assets ?? []) {
      if (out.length >= max) return out
      const url = asset.url?.trim() || null
      const storagePath = asset.storage_path?.trim() || null
      if (!url && !storagePath) continue
      const isImage =
        asset.media_type === "image"
        || looksLikeImagePath(url)
        || looksLikeImagePath(storagePath)
      if (!isImage) continue
      out.push({
        template_id: template.id,
        template_title: template.title,
        asset_id: asset.id,
        title: asset.title,
        url,
        storage_path: storagePath,
        media_type: asset.media_type,
      })
    }
  }
  return out
}

function formatDesignTemplatesForPrompt(templates: ProjectDesignTemplate[]): string | null {
  if (!templates.length) return null
  const lines = templates.slice(0, 12).map((template, index) => {
    const label = template.title?.trim() || `template ${index + 1}`
    const notes = template.notes?.trim()
    const assets = template.assets
      .slice(0, 8)
      .map((asset, assetIndex) => {
        const href = assetHref(asset)
        const assetLabel = asset.title?.trim() || `${asset.media_type} ${assetIndex + 1}`
        return href ? `${assetLabel} → ${href}` : assetLabel
      })
      .join("; ")
    return `- [template] ${label}${assets ? ` | assets: ${assets}` : ""}${notes ? ` (${notes})` : ""}`
  })
  return `Brand layout templates (match composition, hierarchy, framing, and multi-panel structure — do not copy protected logos/faces verbatim):\n${lines.join("\n")}`
}

function formatApprovedImageBanksForPrompt(banks: ProjectApprovedImageBank[]): string | null {
  const enabled = banks.filter((bank) => bank.enabled)
  if (!enabled.length) return null
  const lines = enabled.slice(0, 12).map((bank) => {
    const label = bank.label.trim() || defaultLabelForImageBankProvider(bank.provider)
    const url = bank.url?.trim()
    const notes = bank.notes?.trim()
    return `- ${label}${url ? ` → ${url}` : ""}${notes ? ` (${notes})` : ""}`
  })
  return (
    "Approved image banks (prefer these stock libraries when choosing/sourcing photography; "
    + "respect license notes; do not invent other stock sources unless the user asks):\n"
    + lines.join("\n")
  )
}

/** Compact natural-language brand brief for image/video prompts. */
export function formatBrandKitForMediaPrompt(
  brandKit: ReturnType<typeof getEffectiveBrandKitForAi> | null | undefined,
  projectName?: string | null,
): string | null {
  if (!brandKit) return null
  if (
    brandKit.status === "empty"
    && !brandKit.design_description
    && !(brandKit.design_templates?.length > 0)
    && !(brandKit.approved_image_banks?.length > 0)
  ) {
    return null
  }
  const lines: string[] = []
  const name = String(projectName ?? "").trim()
  lines.push(
    name
      ? `Brand kit for "${name}" (prefer these tokens over web/training knowledge of the brand):`
      : "Brand kit (prefer these tokens over web/training knowledge of the brand):",
  )
  const designDescription = String(brandKit.design_description ?? "").trim()
  if (designDescription) {
    lines.push(`Design direction: ${designDescription}`)
  }
  const colors = brandKit.colors
  const colorParts = [
    colors.primary ? `primary ${colors.primary}` : null,
    colors.secondary ? `secondary ${colors.secondary}` : null,
    colors.accent ? `accent ${colors.accent}` : null,
    colors.background ? `background ${colors.background}` : null,
    colors.text_primary ? `text ${colors.text_primary}` : null,
    colors.text_secondary ? `text secondary ${colors.text_secondary}` : null,
  ].filter(Boolean)
  if (colorParts.length) lines.push(`Colors: ${colorParts.join("; ")}.`)
  const fonts = brandKit.fonts
  const fontParts = [
    fonts.primary ? `body ${fonts.primary}` : null,
    fonts.heading ? `heading ${fonts.heading}` : null,
    fonts.code ? `code ${fonts.code}` : null,
  ].filter(Boolean)
  if (fontParts.length) lines.push(`Fonts: ${fontParts.join("; ")}.`)
  if (brandKit.color_scheme) lines.push(`Color scheme: ${brandKit.color_scheme}.`)
  if (brandKit.spacing?.border_radius) lines.push(`Corner radius: ${brandKit.spacing.border_radius}.`)
  if (brandKit.logo_path) lines.push("Include/respect the project logo when it fits the creative.")
  const templatesBrief = formatDesignTemplatesForPrompt(brandKit.design_templates ?? [])
  if (templatesBrief) lines.push(templatesBrief)
  const banksBrief = formatApprovedImageBanksForPrompt(brandKit.approved_image_banks ?? [])
  if (banksBrief) lines.push(banksBrief)
  const visualCount = collectBrandTemplateVisualRefs(brandKit).length
  if (visualCount > 0) {
    lines.push(
      `Visual template images (${visualCount}) are attached as reference inputs — match their layout, spacing, typography hierarchy, and framing; invent new on-brand content rather than copying protected logos or faces.`,
    )
  }
  lines.push("Do not invent conflicting brand colors, fonts, or logo treatments.")
  return lines.join(" ")
}
