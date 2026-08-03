import { JSDOM } from "jsdom"
import { describe, expect, it } from "vitest"
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import { collectExportBlockElements } from "../features/tasks/utils/task-content-export-html"
import {
  buildExportDocxNumberingConfig,
  htmlToDocxElements,
} from "../features/tasks/utils/task-content-docx-render"

const domWindow = new JSDOM("<!doctype html><html><body></body></html>").window
;(globalThis as unknown as { DOMParser: typeof domWindow.DOMParser }).DOMParser = domWindow.DOMParser
;(globalThis as unknown as { Node: typeof domWindow.Node }).Node = domWindow.Node

describe("artifact docx table + link export", () => {
  it("collects tables as top-level export blocks instead of flattening cells", () => {
    const html = `
      <h2>Compare</h2>
      <table>
        <tbody>
          <tr><th><p>Material</p></th><th><p>Use</p></th></tr>
          <tr><td><p>Cork</p></td><td><p>Floors</p></td></tr>
        </tbody>
      </table>
      <p>See the <a href="https://example.com/products">products overview</a>.</p>
    `
    const blocks = collectExportBlockElements(html)
    expect(blocks.map((el) => el.tagName.toLowerCase())).toEqual(["h2", "table", "p"])
  })

  it("builds a real Word table and styled hyperlink runs", async () => {
    const html = `
      <table>
        <tr><th><p>A</p></th><td><p>B</p></td></tr>
      </table>
      <p>Visit <a href="https://example.com">Example</a> now.</p>
    `
    const children = htmlToDocxElements(html, {
      Paragraph,
      TextRun,
      HeadingLevel,
      ExternalHyperlink,
      Table,
      TableRow,
      TableCell,
      WidthType,
      BorderStyle,
    })

    expect(children.length).toBeGreaterThan(1)
    expect(
      children.some(
        (node) => (node as { constructor?: { name?: string } })?.constructor?.name === "Table",
      ),
    ).toBe(true)

    const doc = new Document({
      styles: {
        default: {
          hyperlink: {
            run: { color: "0563C1", underline: { type: "single" } },
          },
        },
      },
      numbering: {
        config: buildExportDocxNumberingConfig({ LevelFormat, AlignmentType }),
      },
      sections: [{ children }],
    })
    const buffer = await Packer.toBuffer(doc)
    expect(buffer.byteLength).toBeGreaterThan(1000)
  })
})
