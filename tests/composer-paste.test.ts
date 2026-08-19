import { describe, expect, it } from "vitest"
import {
  extractClipboardHtmlFragment,
  htmlLooksRich,
  sanitizeChatComposerHtml,
  splitRichHtmlByMentionMarkers,
} from "../features/ai-chat/composer-paste"

describe("composer paste rich text", () => {
  it("extracts the Word/Docs StartFragment", () => {
    const html = [
      "<html><body>",
      "<!--StartFragment-->",
      "<p>Hello <b>world</b></p>",
      "<!--EndFragment-->",
      "</body></html>",
    ].join("")
    expect(extractClipboardHtmlFragment(html)).toBe("<p>Hello <b>world</b></p>")
  })

  it("detects formatted HTML and ignores plain wrappers", () => {
    expect(htmlLooksRich("<p>Hello <strong>world</strong></p>")).toBe(true)
    expect(htmlLooksRich("<p>one</p><p>two</p>")).toBe(true)
    expect(htmlLooksRich("<p>just a sentence</p>")).toBe(false)
    expect(htmlLooksRich("plain text")).toBe(false)
  })

  it("keeps safe formatting and strips scripts and images", () => {
    if (typeof DOMParser === "undefined") return
    const sanitized = sanitizeChatComposerHtml(
      '<p>Hello <b>world</b> <script>alert(1)</script><img src="https://x.test/a.png"> <a href="javascript:alert(1)">x</a></p>',
    )
    expect(sanitized).toContain("<b>world</b>")
    expect(sanitized).not.toContain("script")
    expect(sanitized).not.toContain("<img")
    expect(sanitized).not.toContain("javascript:")
  })

  it("splits mention markers out of rich HTML", () => {
    const parts = splitRichHtmlByMentionMarkers('<p>See <span data-ai-mention="0"></span> next</p>')
    expect(parts).toEqual([
      { type: "html", html: "<p>See " },
      { type: "mention", index: 0 },
      { type: "html", html: " next</p>" },
    ])
  })
})
