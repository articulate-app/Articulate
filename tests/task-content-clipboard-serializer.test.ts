import { JSDOM } from "jsdom"
import { describe, expect, it } from "vitest"
import {
  buildTaskDocxExportModel,
  serializeComponentOutputToClipboardHtml,
  serializeTaskChannelOutputsToClipboardHtml,
} from "../features/tasks/utils/task-docx-export-model"
import type { TaskChannelBootstrapResponse } from "../app/lib/types/task-channel-bootstrap"

/**
 * These tests exercise the canonical clipboard serializer in a DOM environment,
 * which is where the production copy/export paths run. The rich-text normalizer,
 * markdown-in-HTML conversion, and raw-URL autolinking all rely on `DOMParser`.
 *
 * The project runs vitest via `npx` without a local install, so the `jsdom`
 * test environment can't be resolved by that vitest binary. Instead we wire up
 * the DOM globals directly from the `jsdom` package (resolved from node_modules).
 */
const domWindow = new JSDOM("<!doctype html><html><body></body></html>").window
;(globalThis as unknown as { DOMParser: typeof domWindow.DOMParser }).DOMParser = domWindow.DOMParser
;(globalThis as unknown as { document: Document }).document = domWindow.document as unknown as Document
;(globalThis as unknown as { Node: typeof domWindow.Node }).Node = domWindow.Node
;(globalThis as unknown as { window: typeof domWindow }).window = domWindow

describe("canonical clipboard serializer (DOM)", () => {
  it("keeps standalone heading blocks unwrapped instead of nesting them in <p>", () => {
    const html = serializeComponentOutputToClipboardHtml({
      content_json: [{ type: "paragraph", text: "<h3>1. Enhanced Durability</h3>" }],
      attachments: [],
      attachment_map: null,
    })
    expect(html).toContain("<h3>1. Enhanced Durability</h3>")
    expect(html).not.toContain("<p><h3>")
  })

  it("converts markdown links inside HTML paragraph strings into real anchors", () => {
    const html = serializeComponentOutputToClipboardHtml({
      content_json: [
        { type: "paragraph", text: "<p>Read [Sustainable Design with Cork](https://example.com)</p>" },
      ],
      attachments: [],
      attachment_map: null,
    })
    expect(html).toContain('<a href="https://example.com">Sustainable Design with Cork</a>')
    expect(html).not.toContain("[Sustainable Design with Cork]")
  })

  it("preserves existing HTML anchors", () => {
    const html = serializeComponentOutputToClipboardHtml({
      content_json: [
        { type: "paragraph", text: '<p>See <a href="https://example.com/page">Anchor text</a> now.</p>' },
      ],
      attachments: [],
      attachment_map: null,
    })
    expect(html).toContain('<a href="https://example.com/page">Anchor text</a>')
  })

  it("autolinks bare URLs typed as plain text", () => {
    const html = serializeComponentOutputToClipboardHtml({
      content_json: [{ type: "paragraph", text: "<p>Visit https://example.com/page for details.</p>" }],
      attachments: [],
      attachment_map: null,
    })
    expect(html).toContain('<a href="https://example.com/page">https://example.com/page</a>')
  })

  it("does not double-wrap URLs that are already anchors", () => {
    const html = serializeComponentOutputToClipboardHtml({
      content_json: [
        { type: "paragraph", text: '<p><a href="https://example.com/x">https://example.com/x</a></p>' },
      ],
      attachments: [],
      attachment_map: null,
    })
    expect(html).toContain('<a href="https://example.com/x">https://example.com/x</a>')
    expect((html.match(/<a /g) ?? []).length).toBe(1)
  })

  it("preserves markdown headings, lists, bold, italic and links from a single markdown block", () => {
    const markdown = [
      "## Section",
      "",
      "Intro with **bold** and *italic* and a [link](https://example.com).",
      "",
      "### Subsection",
      "",
      "- One",
      "- Two",
      "",
      "1. First",
      "2. Second",
    ].join("\n")
    const html = serializeComponentOutputToClipboardHtml({
      content_json: [{ type: "paragraph", text: markdown }],
      attachments: [],
      attachment_map: null,
    })
    expect(html).toContain("<h2>Section</h2>")
    expect(html).toContain("<h3>Subsection</h3>")
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain("<em>italic</em>")
    expect(html).toContain('<a href="https://example.com">link</a>')
    expect(html).toContain("<ul>")
    expect(html).toContain("<ol>")
    expect(html).toContain("<li>")
  })

  it("serializes a whole channel by position, skips empties, and joins without empty <p></p>", () => {
    const html = serializeTaskChannelOutputsToClipboardHtml([
      {
        position: 2,
        title: "Second",
        output: {
          content_json: [{ type: "paragraph", text: "<h2>Second section</h2><p>Body two.</p>" }],
          attachments: [],
          attachment_map: null,
        },
      },
      {
        position: 0,
        title: "First",
        output: {
          content_json: [
            { type: "paragraph", text: "<h2>First section</h2>" },
            { type: "paragraph", text: "<p>Read [docs](https://example.com).</p>" },
          ],
          attachments: [],
          attachment_map: null,
        },
      },
      {
        position: 1,
        title: "Empty",
        output: { content_json: [], attachments: [], attachment_map: null },
      },
    ])

    expect(html).toContain("<h2>First section</h2>")
    expect(html).toContain("<h2>Second section</h2>")
    expect(html).toContain('<a href="https://example.com">docs</a>')
    expect(html.indexOf("First section")).toBeLessThan(html.indexOf("Second section"))
    expect(html).not.toContain("<p></p>")
  })

  it("keeps hyperlinks on the DOCX export model component (Word download input)", () => {
    const bootstrap: TaskChannelBootstrapResponse = {
      task_id: 1001,
      channel_id: 1,
      channel: { id: 1, name: "Blog" },
      briefing: { briefing_type_id: 10, disable_briefing: false },
      seo: null,
      composed_output: [
        {
          task_component_id: "tc-links",
          briefing_component_id: 1,
          task_component_output_id: "out-tc-links",
          title: "Links",
          description: null,
          content_text: null,
          content: [
            { type: "paragraph", text: '<p>See <a href="https://example.com/a">Anchor</a>.</p>' },
            { type: "paragraph", text: "<p>Read [markdown link](https://example.com/b).</p>" },
          ],
          resolved_content_json: null,
          content_json: [
            { type: "paragraph", text: '<p>See <a href="https://example.com/a">Anchor</a>.</p>' },
            { type: "paragraph", text: "<p>Read [markdown link](https://example.com/b).</p>" },
          ],
          attachment_map: null,
          attachments: [],
          position: 0,
          updated_at: "2026-06-23T12:00:00.000Z",
          is_autogenerated: false,
          comment_thread_count: 0,
          open_comment_thread_count: 0,
        },
      ],
      components: [
        {
          task_component_id: "tc-links",
          briefing_component_id: 1,
          title: "Links",
          description: null,
          selected: true,
          position: 0,
          template_layer: "task_channel",
          is_ad_hoc: false,
          origin: "task_global",
          global_overridden: false,
          template_title: "Links",
          template_description: null,
          project_template_title: null,
          project_template_description: null,
          component_key: "g:1",
          kind: "global",
        },
      ],
      available_components: [],
      meta: { bootstrap_version: 1, fetched_at: "2026-06-23T12:00:00.000Z" },
    }

    const model = buildTaskDocxExportModel({
      taskTitle: "Links task",
      channels: [{ bootstrap, channelName: "Blog" }],
    })
    const component = model.channels[0].components[0]
    expect(component.clipboardHtml).toContain('<a href="https://example.com/a">Anchor</a>')
    expect(component.clipboardHtml).toContain('<a href="https://example.com/b">markdown link</a>')
  })
})
