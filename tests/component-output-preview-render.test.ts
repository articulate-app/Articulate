import { describe, expect, it } from "vitest"
import {
  buildStreamingPreviewBlocks,
  isStreamingComponentOutputPreviewHtml,
  renderComponentOutputPreviewHtml,
  renderFinalComponentOutputFromBlocks,
  renderStreamingComponentOutputPreview,
} from "../features/tasks/utils/component-output-preview-render"

describe("component-output-preview-render", () => {
  it("renders streaming preview as escaped plain text without list parsing", () => {
    const text = "<h3>1. Enhanced Durability</h3>\n\nBody copy."
    const html = renderStreamingComponentOutputPreview(text)

    expect(html).toContain("component-output-streaming-preview")
    expect(html).toContain("&lt;h3&gt;1. Enhanced Durability&lt;/h3&gt;")
    expect(html).not.toContain("<ol>")
    expect(html).not.toContain("<li>")
  })

  it("uses streaming preview only during started/delta phases", () => {
    const streaming = renderComponentOutputPreviewHtml({
      phase: "delta",
      contentText: "1. Enhanced Durability",
    })
    expect(streaming).toContain("component-output-streaming-preview")
    expect(streaming).not.toContain("<ol>")

    const finalHtml = renderComponentOutputPreviewHtml({
      phase: "completed",
      contentText: "<h3>1. Enhanced Durability</h3><p>Body</p>",
    })
    expect(finalHtml).toContain("<h3")
    expect(finalHtml).not.toContain("<ol>")
  })

  it("renders final output from content_json once completed", () => {
    const html = renderFinalComponentOutputFromBlocks(
      [{ type: "paragraph", text: "<h3>1. Enhanced Durability</h3><p>Body</p>" }],
      "Intro",
    )
    expect(html).toContain("<h3")
    expect(html).toContain("Enhanced Durability")
    expect(html).not.toContain("<ol>")
  })

  it("marks streaming preview blocks for pass-through rendering", () => {
    const blocks = buildStreamingPreviewBlocks("Line one\nLine two")
    expect(blocks).toHaveLength(1)
    expect(isStreamingComponentOutputPreviewHtml(blocks[0]?.text ?? "")).toBe(true)
  })
})
