import { describe, expect, it } from "vitest"
import {
  extractUrlsFromComponentOutputSources,
  extractUrlsFromRichTextString,
} from "../features/tasks/lib/link-summary-url-extraction"

describe("extractUrlsFromRichTextString", () => {
  it("extracts Markdown links inside HTML paragraph strings", () => {
    const html =
      '<p>By incorporating cork into your designs, you can achieve superior performance and sustainability. Check out our article on [Sustainable Design with Cork](https://dimas-silva.lovable.app/blog/sustainable-design-with-cork) for more insights.</p>'

    const links = extractUrlsFromRichTextString(html)
    expect(links).toEqual([
      {
        url: "https://dimas-silva.lovable.app/blog/sustainable-design-with-cork",
        anchorText: "Sustainable Design with Cork",
      },
    ])
  })

  it("does not double-count the same href as a raw URL", () => {
    const links = extractUrlsFromRichTextString(
      '<p>Visit <a href="https://example.com/gastrenterologia">gastrenterologia</a> today.</p>',
    )
    expect(links).toHaveLength(1)
    expect(links[0]).toEqual({
      url: "https://example.com/gastrenterologia",
      anchorText: "gastrenterologia",
    })
  })

  it("extracts HTML anchor links", () => {
    const links = extractUrlsFromRichTextString(
      '<p>Visit <a href="https://example.com/page">Example</a> today.</p>',
    )
    expect(links).toContainEqual({
      url: "https://example.com/page",
      anchorText: "Example",
    })
  })

  it("extracts standalone Markdown links", () => {
    const links = extractUrlsFromRichTextString(
      "Read [anchor text with spaces](https://example.com/path?x=1) now.",
    )
    expect(links).toContainEqual({
      url: "https://example.com/path?x=1",
      anchorText: "anchor text with spaces",
    })
  })

  it("extracts raw URLs", () => {
    const links = extractUrlsFromRichTextString("See https://example.com/page for details.")
    expect(links).toContainEqual({
      url: "https://example.com/page",
      anchorText: null,
    })
  })

  it("includes internal same-domain blog links", () => {
    const links = extractUrlsFromRichTextString(
      "[Internal post](https://dimas-silva.lovable.app/blog/sustainable-design-with-cork)",
    )
    expect(links).toHaveLength(1)
    expect(links[0]?.url).toContain("dimas-silva.lovable.app")
  })
})

describe("extractUrlsFromComponentOutputSources", () => {
  it("scans content blocks and content_text together", () => {
    const links = extractUrlsFromComponentOutputSources({
      output: {
        content_text:
          "<p>Check [Sustainable Design with Cork](https://dimas-silva.lovable.app/blog/sustainable-design-with-cork)</p>",
        content: [
          {
            type: "paragraph",
            text:
              "<p>Check out our article on [Sustainable Design with Cork](https://dimas-silva.lovable.app/blog/sustainable-design-with-cork) for more insights.</p>",
          },
        ],
      },
      blocks: [
        {
          type: "paragraph",
          text:
            "<p>Check out our article on [Sustainable Design with Cork](https://dimas-silva.lovable.app/blog/sustainable-design-with-cork) for more insights.</p>",
        },
      ],
    })

    expect(links.some((link) => link.url.includes("sustainable-design-with-cork"))).toBe(true)
    expect(links.some((link) => link.anchorText === "Sustainable Design with Cork")).toBe(true)
  })

  it("does not list the same URL twice from mirrored content_text and content_json", () => {
    const html =
      '<p>Visit <a href="https://example.com/gastrenterologia">Gastrenterologia</a>.</p>'
    const links = extractUrlsFromComponentOutputSources({
      output: {
        content_text: html,
        content_json: {
          version: 1,
          blocks: [{ id: "body", type: "rich_text", html, text: "Visit Gastrenterologia." }],
        },
        content: null,
        resolved_content_json: null,
      },
      blocks: [],
    })
    const matches = links.filter((link) =>
      link.url.toLowerCase().includes("gastrenterologia"),
    )
    expect(matches).toHaveLength(1)
  })
})
