import { describe, expect, it } from "vitest"
import {
  applyBrandKitDesignFields,
  applyBrandKitOverrides,
  applyExtractedBrandSource,
  brandKitForAiFromProject,
  collectBrandTemplateVisualRefs,
  emptyBrandKitEffective,
  emptyProjectBrandKit,
  formatBrandKitForMediaPrompt,
  getEffectiveBrandKitForAi,
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

  it("builds AI payload from project rows and omits empty kits", () => {
    expect(brandKitForAiFromProject({ brand_kit: {} })).toBeNull()
    expect(brandKitForAiFromProject(null)).toBeNull()

    const ready = applyExtractedBrandSource({
      previous: emptyProjectBrandKit(),
      source: {
        ...emptyBrandKitEffective(),
        colors: { ...emptyBrandKitEffective().colors, primary: "#FF6B35" },
        fonts: { primary: "Inter", heading: "Inter", code: null },
      },
      sourceUrl: "https://example.com",
      runId: "run-ai",
      replaceAll: true,
    })

    const payload = brandKitForAiFromProject({ brand_kit: ready })
    expect(payload?.status).toBe("ready")
    expect(payload?.colors.primary).toBe("#FF6B35")
    expect(payload?.fonts.primary).toBe("Inter")
    expect(payload?.source_url).toBe("https://example.com")

    const brief = formatBrandKitForMediaPrompt(payload, "Articulate")
    expect(brief).toContain('Brand kit for "Articulate"')
    expect(brief).toContain("#FF6B35")
    expect(brief).toContain("Inter")
    expect(brief).toContain("prefer these tokens over web")
  })

  it("keeps design description/templates across extract and includes them in AI prompts", () => {
    const withDesign = applyBrandKitDesignFields({
      previous: emptyProjectBrandKit(),
      designDescription: "Bold typography, high contrast, magazine covers",
      designTemplates: [
        {
          id: "tpl-1",
          title: "Hero post",
          notes: "Full-bleed photo + bottom CTA",
          assets: [
            {
              id: "a-1",
              media_type: "image",
              title: "Hero post",
              url: "https://cdn.example.com/hero.png",
              storage_path: null,
              mime_type: "image/png",
            },
          ],
          source_artifact_id: null,
          created_at: "2026-08-03T00:00:00.000Z",
        },
      ],
    })

    expect(withDesign.status).toBe("ready")
    expect(withDesign.design_description).toContain("magazine")

    const reExtracted = applyExtractedBrandSource({
      previous: withDesign,
      source: {
        ...emptyBrandKitEffective(),
        colors: { ...emptyBrandKitEffective().colors, primary: "#123456" },
      },
      sourceUrl: "https://example.com",
      runId: "run-2",
    })
    expect(reExtracted.design_description).toContain("magazine")
    expect(reExtracted.design_templates).toHaveLength(1)
    expect(reExtracted.design_templates[0].assets).toHaveLength(1)

    const payload = brandKitForAiFromProject({ brand_kit: reExtracted })
    const brief = formatBrandKitForMediaPrompt(payload, "JCDecaux")
    expect(brief).toContain("Design direction:")
    expect(brief).toContain("magazine covers")
    expect(brief).toContain("Brand layout templates")
    expect(brief).toContain("Hero post")
    expect(brief).toContain("https://cdn.example.com/hero.png")
  })

  it("migrates legacy design_examples into design_templates", () => {
    const kit = parseProjectBrandKit({
      schema_version: 1,
      status: "ready",
      design_examples: [
        {
          id: "ex-legacy",
          kind: "example",
          media_type: "url",
          title: "Old link",
          url: "https://instagram.com/p/abc",
          storage_path: null,
          mime_type: null,
          notes: null,
          source_artifact_id: null,
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    })
    expect(kit.design_templates).toHaveLength(1)
    expect(kit.design_templates[0].id).toBe("ex-legacy")
    expect(kit.design_templates[0].assets[0].url).toBe("https://instagram.com/p/abc")
  })

  it("collects image assets from templates for multimodal generation", () => {
    const kit = applyBrandKitDesignFields({
      previous: emptyProjectBrandKit(),
      designTemplates: [
        {
          id: "tpl-1",
          title: "Feed",
          notes: null,
          assets: [
            {
              id: "img-1",
              media_type: "image",
              title: "Hero",
              url: "https://cdn.example.com/hero.png",
              storage_path: "projects/1/design-examples/a.png",
              mime_type: "image/png",
            },
            {
              id: "link-1",
              media_type: "url",
              title: "Post",
              url: "https://instagram.com/p/xyz",
              storage_path: null,
              mime_type: null,
            },
          ],
          source_artifact_id: null,
          created_at: "2026-08-03T00:00:00.000Z",
        },
      ],
    })

    const refs = collectBrandTemplateVisualRefs(kit)
    expect(refs).toHaveLength(1)
    expect(refs[0].asset_id).toBe("img-1")

    const brief = formatBrandKitForMediaPrompt(getEffectiveBrandKitForAi(kit), "Brand")
    expect(brief).toContain("Visual template images (1) are attached")
  })
})
