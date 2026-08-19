import { describe, expect, it } from "vitest"
import { mapPageScriptResult } from "../supabase/functions/_shared/browser-agent/controller"
import {
  annotateSearchResultsForVisualDiscovery,
  looksLikeSpecificVisualUrl,
  mergeVisualIdentityIntoAsset,
  normalizeArtifactAssetsWithVisualIdentity,
  resolveVisualSearchPage,
} from "../supabase/functions/_shared/browser-agent/visual-assets"

const STOCK_SEARCH = "https://media.example.com/search?q=healthy+food"
const STOCK_ASSET = "https://media.example.com/photos/healthy-salad-gm1234567890-0123456789"
const PHOTO_PAGE = "https://photos.example.net/items/salad-10482"
const VIDEO_PAGE = "https://watch.example.org/watch?v=clip998877"
const VIDEO_FILE = "https://cdn.example.org/clips/clip998877.mp4"

describe("visual search specific assets", () => {
  it("treats stock search/result pages as discovery only", () => {
    const resolved = resolveVisualSearchPage({
      url: STOCK_SEARCH,
      title: "Healthy food photos",
      html: `<html><head><meta property="og:image" content="https://media.example.com/og-logo.png"></head>
        <body><a href="${STOCK_ASSET}">Salad</a><a href="${STOCK_SEARCH}">More</a></body></html>`,
      links: [STOCK_ASSET, STOCK_SEARCH, "https://media.example.com/photos/healthy-food"],
    })

    expect(resolved.page_kind).toBe("listing_or_search")
    expect(resolved.visual_assets).toEqual([])
    expect(resolved.follow_candidates.map((item) => item.href)).toContain(STOCK_ASSET)
    expect(resolved.follow_candidates.every((item) => looksLikeSpecificVisualUrl(item.href))).toBe(true)
    expect(resolved.unresolved_reason).toBe("listing_or_search_page")
  })

  it("resolves an independent image page to one verified asset", () => {
    const resolved = resolveVisualSearchPage({
      url: PHOTO_PAGE,
      title: "Salad bowl",
      html: `<html><head>
        <title>Salad bowl</title>
        <link rel="canonical" href="${PHOTO_PAGE}">
        <meta property="og:image" content="https://cdn.example.net/salad-10482.jpg">
        <script type="application/ld+json">{"identifier":"salad-10482","contentUrl":"https://cdn.example.net/salad-10482.jpg"}</script>
      </head></html>`,
    })

    expect(resolved.page_kind).toBe("specific_resource")
    expect(resolved.visual_assets).toHaveLength(1)
    expect(resolved.visual_assets[0]).toMatchObject({
      type: "image",
      provider: "photos.example.net",
      title: "Salad bowl",
      asset_url: PHOTO_PAGE,
      preview_url: "https://cdn.example.net/salad-10482.jpg",
      source_url: PHOTO_PAGE,
      asset_id: "salad-10482",
      verified: true,
    })
    expect(resolved.unresolved_reason).toBeNull()
  })

  it("resolves a video watch/file URL without using a hostname allowlist", () => {
    const page = resolveVisualSearchPage({
      url: VIDEO_PAGE,
      title: "Kitchen clip",
      html: `<html><head><meta property="og:video" content="${VIDEO_FILE}"></head></html>`,
    })
    expect(page.page_kind).toBe("specific_resource")
    expect(page.visual_assets[0]).toMatchObject({
      type: "video",
      provider: "watch.example.org",
      asset_url: VIDEO_PAGE,
      verified: true,
    })

    const file = resolveVisualSearchPage({
      url: VIDEO_FILE,
      title: "Kitchen clip",
    })
    expect(file.visual_assets[0]?.asset_url).toBe(VIDEO_FILE)
    expect(file.visual_assets[0]?.type).toBe("video")
  })

  it("never invents an asset URL or ID when the listing cannot be resolved", () => {
    const resolved = resolveVisualSearchPage({
      url: "https://images.example.com/search?q=healthy+food",
      title: "Google-style image results",
      html: "<html><body>Results rendered later</body></html>",
      links: [
        "https://images.example.com/search?q=healthy+food",
        "https://images.example.com/photos/healthy-food",
      ],
    })

    expect(resolved.visual_assets).toEqual([])
    expect(resolved.follow_candidates).toEqual([])
    expect(resolved.browser_fallback_recommended).toBe(true)
    expect(resolved.unresolved_reason).toBe("specific_asset_not_resolved")
  })

  it("marks google-style search hits so listing URLs are not treated as visuals", () => {
    const annotated = annotateSearchResultsForVisualDiscovery([
      { title: "Search", link: STOCK_SEARCH },
      { title: "Asset", link: STOCK_ASSET },
      { title: "Category", link: "https://media.example.com/videos/marketing" },
    ])
    expect(annotated[0]).toMatchObject({ is_listing_or_search: true, is_specific_visual: false })
    expect(annotated[1]).toMatchObject({ is_listing_or_search: false, is_specific_visual: true })
    expect(annotated[2]).toMatchObject({ is_listing_or_search: true, is_specific_visual: false })
  })

  it("keeps enough identity on an artifact asset for later reuse", () => {
    const visual = resolveVisualSearchPage({
      url: PHOTO_PAGE,
      title: "Salad bowl",
      html: `<meta property="og:image" content="https://cdn.example.net/salad-10482.jpg">`,
    }).visual_assets[0]
    expect(visual).toBeTruthy()

    const attached = mergeVisualIdentityIntoAsset(
      { attachment_id: "att-1", media_type: "image" },
      visual!,
    )
    expect(attached.asset_url).toBe(PHOTO_PAGE)
    expect(attached.provider).toBe("photos.example.net")
    expect((attached.provenance as { visual?: { asset_url?: string } }).visual?.asset_url).toBe(PHOTO_PAGE)

    const normalized = normalizeArtifactAssetsWithVisualIdentity({
      assets: [{ attachment_id: "att-2", asset_url: PHOTO_PAGE, title: "Salad bowl" }],
    })
    expect((normalized?.assets as Array<{ asset_url?: string }>)[0]?.asset_url).toBe(PHOTO_PAGE)
  })

  it("does not present a browser listing snapshot as a visual asset", () => {
    const result = mapPageScriptResult({
      ok: true,
      url: STOCK_SEARCH,
      title: "Healthy food",
      links: [{ text: "Salad", href: STOCK_ASSET, verified: true }],
      elements: [],
      text: "cards",
      authRequired: false,
    })
    expect(result.page_kind).toBe("listing_or_search")
    expect(result.visual_assets).toEqual([])
    expect(result.visual_follow_candidates?.[0]?.href).toBe(STOCK_ASSET)
    expect(result.links[0]?.href).toContain("/photos/healthy-salad-")
  })
})
