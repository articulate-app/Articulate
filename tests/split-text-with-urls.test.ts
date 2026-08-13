import { describe, expect, it } from "vitest"
import { cleanUrlMatch, splitTextWithUrls } from "../features/ai-chat/split-text-with-urls"

describe("splitTextWithUrls", () => {
  it("linkifies bare https URLs", () => {
    const url =
      "https://somengil.com/us/blog/overcoming-occupational-diseases-common-illnesses-and-how-to-prevent-them"
    expect(splitTextWithUrls(`adapte este artigo: ${url}`)).toEqual([
      { type: "text", value: "adapte este artigo: " },
      { type: "url", value: url, href: url },
    ])
  })

  it("keeps trailing punctuation outside the link", () => {
    expect(splitTextWithUrls("see https://example.com.")).toEqual([
      { type: "text", value: "see " },
      { type: "url", value: "https://example.com", href: "https://example.com" },
      { type: "text", value: "." },
    ])
  })

  it("returns plain text when there are no URLs", () => {
    expect(splitTextWithUrls("hello world")).toEqual([{ type: "text", value: "hello world" }])
  })
})

describe("cleanUrlMatch", () => {
  it("preserves balanced parentheses in the URL path", () => {
    expect(cleanUrlMatch("https://example.com/a(b)")).toEqual({
      url: "https://example.com/a(b)",
      trailing: "",
    })
  })
})
