import { describe, expect, it } from "vitest"
import {
  isVerifiedPageHref,
  looksLikeCollectionOrSearchUrl,
  looksLikeSpecificResourceUrl,
  recommendBrowserFallback,
} from "../supabase/functions/_shared/browser-agent/url-verification"
import { mapPageScriptResult } from "../supabase/functions/_shared/browser-agent/controller"

describe("url verification", () => {
  it("classifies listing/search URLs without depending on hostname", () => {
    expect(looksLikeCollectionOrSearchUrl("https://example.com/search?q=healthy+food")).toBe(true)
    expect(looksLikeCollectionOrSearchUrl("https://shop.example.com/browse/chairs")).toBe(true)
    expect(looksLikeCollectionOrSearchUrl("https://news.example.com/category/science")).toBe(true)
    expect(looksLikeCollectionOrSearchUrl("https://media.example.com/photos/healthy-food")).toBe(true)
    expect(looksLikeCollectionOrSearchUrl("https://media.example.com/videos/marketing")).toBe(true)
    expect(looksLikeCollectionOrSearchUrl("https://media.example.com/collections/summer")).toBe(true)
    expect(looksLikeSpecificResourceUrl("https://example.com/search?q=healthy+food")).toBe(false)
  })

  it("classifies specific resource URLs from path shape, not host", () => {
    expect(looksLikeSpecificResourceUrl("https://shop.example.com/products/oak-chair-10482")).toBe(true)
    expect(looksLikeSpecificResourceUrl("https://news.example.com/2026/08/18/why-cork")).toBe(true)
    expect(looksLikeSpecificResourceUrl("https://cdn.example.com/images/hero-10482.jpg")).toBe(true)
    expect(looksLikeSpecificResourceUrl("https://example.com/")).toBe(false)
  })

  it("accepts only hrefs that actually appeared on the page", () => {
    const pageHrefs = ["https://shop.example.com/products/oak-chair-10482"]
    expect(isVerifiedPageHref("https://shop.example.com/products/oak-chair-10482", pageHrefs)).toBe(true)
    expect(isVerifiedPageHref("https://shop.example.com/products/invented-999999", pageHrefs)).toBe(false)
  })

  it("recommends browser fallback when a listing page has no specific resources", () => {
    expect(
      recommendBrowserFallback({
        url: "https://example.com/search?q=healthy+food",
        text: "Search results",
        links: [
          "https://example.com/search?q=healthy+food",
          "https://example.com/photos/food",
        ],
      }),
    ).toBe(true)
  })

  it("does not recommend fallback for a specific page with verified resource links", () => {
    expect(
      recommendBrowserFallback({
        url: "https://shop.example.com/products/oak-chair-10482",
        text: "Oak chair. Solid wood. In stock.",
        links: [
          "https://shop.example.com/products/oak-chair-10482",
          "https://shop.example.com/products/side-table-22001",
        ],
      }),
    ).toBe(false)
  })

  it("marks script-extracted links as verified", () => {
    const result = mapPageScriptResult({
      ok: true,
      url: "https://example.com/search?q=healthy+food",
      title: "Healthy food",
      links: [{ text: "Salad", href: "https://example.com/items/salad-10482", verified: true }],
      elements: [],
      text: "cards",
      authRequired: false,
    })
    expect(result.ok).toBe(true)
    expect(result.links[0]?.verified).toBe(true)
    expect(result.links[0]?.href).toContain("/items/salad-10482")
  })
})
