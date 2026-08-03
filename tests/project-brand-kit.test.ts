import { describe, expect, it } from "vitest"
import {
  applyBrandKitOverrides,
  applyExtractedBrandSource,
  emptyBrandKitEffective,
  emptyProjectBrandKit,
  mergeBrandKitEffective,
  normalizeBrandKitEffective,
  normalizeHexColor,
  parseProjectBrandKit,
} from "../app/lib/project-brand-kit"

describe("project-brand-kit", () => {
  it("normalizes hex colors", () => {
    expect(normalizeHexColor("#abc")).toBe("#AABBCC")
    expect(normalizeHexColor("ff0000")).toBe("#FF0000")
    expect(normalizeHexColor("not-a-color")).toBeNull()
  })

  it("normalizes a Firecrawl branding payload", () => {
    const effective = normalizeBrandKitEffective(
      {
        colorScheme: "light",
        logo: "https://example.com/logo.svg",
        colors: {
          primary: "#112233",
          textPrimary: "#000000",
        },
        fonts: [{ family: "Inter" }, { family: "Roboto Mono" }],
        typography: {
          fontFamilies: { primary: "Inter", heading: "Inter", code: "Roboto Mono" },
        },
        images: { favicon: "https://example.com/favicon.ico" },
      },
      { logo_path: "projects/1/brand/logo.svg", favicon_path: "projects/1/brand/favicon.ico" },
    )

    expect(effective.color_scheme).toBe("light")
    expect(effective.logo_path).toBe("projects/1/brand/logo.svg")
    expect(effective.favicon_path).toBe("projects/1/brand/favicon.ico")
    expect(effective.colors.primary).toBe("#112233")
    expect(effective.colors.text_primary).toBe("#000000")
    expect(effective.fonts.primary).toBe("Inter")
    expect(effective.fonts.code).toBe("Roboto Mono")
  })

  it("preserves overrides across re-extract", () => {
    const source = {
      ...emptyBrandKitEffective(),
      colors: {
        ...emptyBrandKitEffective().colors,
        primary: "#111111",
        secondary: "#222222",
      },
      fonts: { primary: "Inter", heading: "Inter", code: null },
    }

    const withOverrides = applyBrandKitOverrides({
      previous: {
        ...emptyProjectBrandKit(),
        status: "ready",
        source,
        effective: source,
      },
      overrides: {
        colors: { primary: "#FF0000" },
        fonts: { heading: "Georgia" },
      },
    })

    expect(withOverrides.effective.colors.primary).toBe("#FF0000")
    expect(withOverrides.effective.fonts.heading).toBe("Georgia")

    const reExtracted = applyExtractedBrandSource({
      previous: withOverrides,
      source: {
        ...source,
        colors: { ...source.colors, primary: "#00AA00", secondary: "#00BB00" },
      },
      sourceUrl: "https://example.com",
      runId: "run-1",
      replaceAll: false,
    })

    expect(reExtracted.status).toBe("stale")
    expect(reExtracted.effective.colors.primary).toBe("#FF0000")
    expect(reExtracted.effective.colors.secondary).toBe("#00BB00")
    expect(reExtracted.effective.fonts.heading).toBe("Georgia")
  })

  it("replaceAll clears overrides", () => {
    const previous = applyBrandKitOverrides({
      previous: emptyProjectBrandKit(),
      overrides: { colors: { primary: "#FF0000" } },
    })
    const next = applyExtractedBrandSource({
      previous,
      source: {
        ...emptyBrandKitEffective(),
        colors: { ...emptyBrandKitEffective().colors, primary: "#123456" },
      },
      sourceUrl: "https://example.com",
      runId: "run-2",
      replaceAll: true,
    })
    expect(next.overrides).toEqual({})
    expect(next.effective.colors.primary).toBe("#123456")
    expect(next.status).toBe("ready")
  })

  it("parses empty brand kits", () => {
    expect(parseProjectBrandKit({})).toEqual(emptyProjectBrandKit())
    expect(parseProjectBrandKit(null).status).toBe("empty")
  })

  it("merges nested overrides", () => {
    const merged = mergeBrandKitEffective(
      {
        ...emptyBrandKitEffective(),
        colors: { ...emptyBrandKitEffective().colors, primary: "#111111", accent: "#333333" },
      },
      { colors: { primary: "#AAAAAA" } },
    )
    expect(merged.colors.primary).toBe("#AAAAAA")
    expect(merged.colors.accent).toBe("#333333")
  })
})
