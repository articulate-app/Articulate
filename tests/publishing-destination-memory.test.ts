import { describe, expect, it } from "vitest"
import {
  isUsefulPublishingEntryUrl,
  learnDestinationMemoryFromRun,
  resolveAutoAnswerFromDestinationMemory,
  resolvePublicationStartUrl,
} from "../supabase/functions/_shared/publishing/destination-memory"

describe("resolvePublicationStartUrl", () => {
  it("prefers content-type entry point over last success and default", () => {
    const resolved = resolvePublicationStartUrl({
      defaultStartUrl: "https://account.squarespace.com/",
      contentType: "article",
      memory: {
        entry_points: {
          article: "https://articulate-site.squarespace.com/config/blog",
        },
        last_successful_entry_url: "https://articulate-site.squarespace.com/config/pages",
      },
    })
    expect(resolved.source).toBe("content_type_entry_point")
    expect(resolved.startUrl).toContain("/config/blog")
  })

  it("falls back to last successful entry when typed entry missing", () => {
    const resolved = resolvePublicationStartUrl({
      defaultStartUrl: "https://account.squarespace.com/",
      contentType: "article",
      memory: {
        last_successful_entry_url: "https://articulate-site.squarespace.com/config/blog",
        last_learned_content_type: "article",
      },
    })
    expect(resolved.source).toBe("last_successful_entry")
  })

  it("uses default start URL when memory is empty", () => {
    const resolved = resolvePublicationStartUrl({
      defaultStartUrl: "https://account.squarespace.com/",
      contentType: "article",
      memory: {},
    })
    expect(resolved.source).toBe("default_start_url")
    expect(resolved.startUrl).toContain("account.squarespace.com")
  })
})

describe("isUsefulPublishingEntryUrl", () => {
  it("rejects login / google / live-view style URLs", () => {
    expect(isUsefulPublishingEntryUrl("https://google.com")).toBe(false)
    expect(isUsefulPublishingEntryUrl("https://account.squarespace.com/")).toBe(false)
    expect(isUsefulPublishingEntryUrl("https://live.browser-use.com/view")).toBe(false)
  })

  it("accepts CMS editor-like URLs", () => {
    expect(
      isUsefulPublishingEntryUrl("https://articulate-site.squarespace.com/config/blog", {
        defaultStartUrl: "https://account.squarespace.com/",
      }),
    ).toBe(true)
  })
})

describe("learnDestinationMemoryFromRun", () => {
  it("stores useful entry and publication URLs", () => {
    const learned = learnDestinationMemoryFromRun({
      currentMemory: {},
      contentType: "article",
      entryUrl: "https://articulate-site.squarespace.com/config/blog",
      publicationUrl: "https://www.articulate.pt/blog/hello",
      defaultStartUrl: "https://account.squarespace.com/",
    })
    expect(learned?.entry_points?.article).toContain("/config/blog")
    expect(learned?.last_successful_publication_url).toContain("articulate.pt")
  })

  it("does not overwrite with generic URLs", () => {
    const learned = learnDestinationMemoryFromRun({
      currentMemory: {
        entry_points: { article: "https://articulate-site.squarespace.com/config/blog" },
      },
      contentType: "article",
      entryUrl: "https://account.squarespace.com/",
      publicationUrl: null,
      defaultStartUrl: "https://account.squarespace.com/",
    })
    expect(learned).toBeNull()
  })
})

describe("resolveAutoAnswerFromDestinationMemory", () => {
  it("auto-answers Blog vs Insights from guidance", () => {
    const answer = resolveAutoAnswerFromDestinationMemory({
      question: "I found Blog, Insights and News. Which collection should receive this article?",
      memory: { guidance: "Articles belong in the Blog collection." },
      contentType: "article",
    })
    expect(answer).toMatch(/Blog/i)
  })

  it("does not auto-answer unrelated questions", () => {
    const answer = resolveAutoAnswerFromDestinationMemory({
      question: "Please complete MFA in the browser.",
      memory: { guidance: "Articles belong in the Blog collection." },
      contentType: "article",
    })
    expect(answer).toBeNull()
  })
})
