import { describe, expect, it } from "vitest"
import {
  countInHtmlTextNodes,
  replaceInHtmlTextNodes,
} from "../features/artifacts/artifact-find-replace"

describe("artifact-find-replace", () => {
  it("replaces text inside tags without touching markup", () => {
    const html =
      '<p>For projects that need a broader material view, the products overview is a useful place.</p>'
    const { html: next, replacements } = replaceInHtmlTextNodes(
      html,
      "For projects that need a broader material view, the products overview is a useful place.",
      "For a broader material view, the products overview shows how cork is transformed.",
    )
    expect(replacements).toBe(1)
    expect(next).toContain("For a broader material view, the products overview shows")
    expect(next).toContain("<p>")
    expect(next).not.toContain("For projects that need")
  })

  it("counts case-insensitive matches across text nodes", () => {
    const html = "<p>Cork <strong>cork</strong> and CORK</p>"
    expect(countInHtmlTextNodes(html, "cork")).toBe(3)
    expect(countInHtmlTextNodes(html, "cork", { caseSensitive: true })).toBe(1)
  })

  it("replace-first leaves later matches", () => {
    const html = "<p>alpha beta alpha</p>"
    const { html: next, replacements } = replaceInHtmlTextNodes(html, "alpha", "Ω", {
      all: false,
    })
    expect(replacements).toBe(1)
    expect(next).toBe("<p>Ω beta alpha</p>")
  })
})
