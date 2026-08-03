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

export type ProjectBrandKit = {
  schema_version: typeof PROJECT_BRAND_KIT_SCHEMA_VERSION
  status: ProjectBrandKitStatus
  source_url: string | null
  extracted_at: string | null
  last_run_id: string | null
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

  const statusRaw = toTrimmedString(record.status)
  const status: ProjectBrandKitStatus =
    statusRaw === "ready" || statusRaw === "stale" || statusRaw === "empty"
      ? statusRaw
      : source
        ? "ready"
        : "empty"

  return {
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    status,
    source_url: toTrimmedString(record.source_url),
    extracted_at: toTrimmedString(record.extracted_at),
    last_run_id: toTrimmedString(record.last_run_id),
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
  return {
    ...args.previous,
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    status: args.previous.source ? "ready" : "empty",
    overrides,
    effective: mergeBrandKitEffective(source, overrides),
  }
}

/** Compact payload for future AI-chat injection. */
export function getEffectiveBrandKitForAi(kit: ProjectBrandKit | null | undefined) {
  const effective = kit?.effective ?? emptyBrandKitEffective()
  return {
    schema_version: PROJECT_BRAND_KIT_SCHEMA_VERSION,
    status: kit?.status ?? "empty",
    source_url: kit?.source_url ?? null,
    ...effective,
  }
}
