import { collectExportBlockElements, mapHtmlHeadingTagToDocxLevel } from "./task-content-export-html"

export const DOCX_PARAGRAPH_SPACING = { after: 160, line: 276 } as const
export const DOCX_HEADING_SPACING = { before: 240, after: 120 } as const
export const DOCX_LIST_ITEM_SPACING = { after: 80 } as const

export const EXPORT_BULLET_LIST_REF = "export-bullet-list"
export const EXPORT_NUMBERED_LIST_REF = "export-numbered-list"

export function buildExportDocxNumberingConfig(docx: {
  LevelFormat: { BULLET: unknown; DECIMAL: unknown }
  AlignmentType: { LEFT: unknown }
}) {
  const { LevelFormat, AlignmentType } = docx
  const bulletLevels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: "\u2022",
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: 720 + level * 360, hanging: 360 },
      },
    },
  }))
  const numberedLevels = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: 720 + level * 360, hanging: 360 },
      },
    },
  }))
  return [
    { reference: EXPORT_BULLET_LIST_REF, levels: bulletLevels },
    { reference: EXPORT_NUMBERED_LIST_REF, levels: numberedLevels },
  ]
}

function extractText(el: Element): string {
  return (el.textContent || "").replaceAll("\u00A0", " ").trim()
}

type DocxInlineBundle = {
  Paragraph: new (options: Record<string, unknown>) => unknown
  TextRun: new (options: Record<string, unknown>) => unknown
  HeadingLevel: Record<string, unknown>
  ExternalHyperlink?: new (options: Record<string, unknown>) => unknown
  Table?: new (options: Record<string, unknown>) => unknown
  TableRow?: new (options: Record<string, unknown>) => unknown
  TableCell?: new (options: Record<string, unknown>) => unknown
  WidthType?: { DXA: unknown; PERCENTAGE?: unknown }
  BorderStyle?: { SINGLE: unknown; NONE?: unknown }
}

/** Word's default hyperlink look. */
const DOCX_HYPERLINK_COLOR = "0563C1"
const DOCX_TABLE_WIDTH_DXA = 9000
const DOCX_TABLE_BORDER = { style: "single", size: 4, color: "BFBFBF" } as const

type DocxImageBundle = DocxInlineBundle & {
  ImageRun: new (options: Record<string, unknown>) => unknown
  fetchImageBytes?: (url: string | null | undefined) => Promise<Uint8Array | null>
}

function inferImageType(url: string, bytes: Uint8Array): "png" | "jpg" | "gif" | "bmp" {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg"
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "gif"
  if (url.toLowerCase().includes(".jpg") || url.toLowerCase().includes(".jpeg")) return "jpg"
  if (url.toLowerCase().includes(".gif")) return "gif"
  return "png"
}

function imageDimensions(bytes: Uint8Array, maxWidth = 520): { width: number; height: number } {
  // Default landscape-ish box when we cannot parse intrinsic size.
  let width = maxWidth
  let height = Math.round(maxWidth * 0.62)
  try {
    // PNG IHDR
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) {
      const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
      const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
      if (w > 0 && h > 0) {
        const scale = Math.min(1, maxWidth / w)
        width = Math.max(1, Math.round(w * scale))
        height = Math.max(1, Math.round(h * scale))
      }
    }
  } catch {
    /* keep defaults */
  }
  return { width, height }
}

export function htmlToDocxElements(html: string, docx: DocxInlineBundle): unknown[] {
  // Sync path keeps figure placeholders; use htmlToDocxElementsAsync to embed images.
  return htmlToDocxElementsSyncOrAsync(html, docx, null) as unknown[]
}

/**
 * Like htmlToDocxElements, but embeds fetchable `<img>` / `<figure>` images via ImageRun.
 */
export async function htmlToDocxElementsAsync(
  html: string,
  docx: DocxImageBundle,
): Promise<unknown[]> {
  return htmlToDocxElementsSyncOrAsync(html, docx, docx)
}

function htmlToDocxElementsSyncOrAsync(
  html: string,
  docx: DocxInlineBundle,
  imageDocx: DocxImageBundle | null,
): unknown[] | Promise<unknown[]> {
  const { Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow, TableCell, WidthType, BorderStyle } = docx
  const paragraphs: unknown[] = []
  if (!html?.trim()) return imageDocx ? Promise.resolve(paragraphs) : paragraphs
  if (typeof DOMParser === "undefined") {
    return imageDocx ? Promise.resolve(paragraphs) : paragraphs
  }

  const createInlineRuns = (
    node: Node,
    active: {
      bold?: boolean
      italics?: boolean
      underline?: boolean
      color?: string
      isLink?: boolean
    },
  ): unknown[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replaceAll("\u00A0", " ")
      if (!text.trim()) return []
      const isLink = !!active.isLink
      return [
        new TextRun({
          text,
          bold: !!active.bold,
          italics: !!active.italics,
          underline: isLink || active.underline ? {} : undefined,
          color: active.color || (isLink ? DOCX_HYPERLINK_COLOR : undefined),
          style: isLink ? "Hyperlink" : undefined,
        }),
      ]
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return []

    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === "ul" || tag === "ol" || tag === "table") return []

    if (tag === "br") {
      return [new TextRun({ text: "", break: 1 })]
    }

    const nextActive = { ...active }
    if (tag === "strong" || tag === "b") nextActive.bold = true
    if (tag === "em" || tag === "i") nextActive.italics = true
    if (tag === "u") nextActive.underline = true

    if (tag === "a") {
      const href = (el.getAttribute("href") || "").trim()
      const linkRuns: unknown[] = []
      const linkActive = {
        ...nextActive,
        isLink: true,
        underline: true,
        color: DOCX_HYPERLINK_COLOR,
      }
      el.childNodes.forEach((child) => {
        linkRuns.push(...createInlineRuns(child, linkActive))
      })
      if (linkRuns.length === 0) {
        const label = extractText(el) || href
        if (label) {
          linkRuns.push(
            new TextRun({
              text: label,
              underline: {},
              color: DOCX_HYPERLINK_COLOR,
              style: "Hyperlink",
            }),
          )
        }
      }
      if (href && ExternalHyperlink && linkRuns.length > 0) {
        return [new ExternalHyperlink({ children: linkRuns, link: href })]
      }
      return linkRuns
    }

    const runs: unknown[] = []
    el.childNodes.forEach((child) => {
      runs.push(...createInlineRuns(child, nextActive))
    })
    return runs
  }

  const createRunsExcludingLists = (el: Element): unknown[] => {
    const runs: unknown[] = []
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childTag = (child as Element).tagName.toLowerCase()
        if (childTag === "ul" || childTag === "ol" || childTag === "table") return
      }
      runs.push(...createInlineRuns(child, {}))
    })
    return runs
  }

  const pushParagraph = (runs: unknown[], spacing: Record<string, number> = DOCX_PARAGRAPH_SPACING) => {
    if (runs.length === 0) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing }))
      return
    }
    paragraphs.push(new Paragraph({ children: runs, spacing }))
  }

  const pushHeading = (level: 1 | 2 | 3 | 4 | 5 | 6, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const headingKey = `HEADING_${level}` as keyof typeof HeadingLevel
    paragraphs.push(
      new Paragraph({
        text: trimmed,
        heading: HeadingLevel[headingKey],
        spacing: DOCX_HEADING_SPACING,
      }),
    )
  }

  const processList = (el: Element, listTag: "ul" | "ol", depth: number) => {
    const reference = listTag === "ul" ? EXPORT_BULLET_LIST_REF : EXPORT_NUMBERED_LIST_REF
    const items = Array.from(el.children).filter((child) => child.tagName.toLowerCase() === "li")
    for (const li of items) {
      const runs = createRunsExcludingLists(li)
      paragraphs.push(
        new Paragraph({
          children: runs.length > 0 ? runs : [new TextRun({ text: "" })],
          numbering: { reference, level: Math.min(depth, 8) },
          spacing: DOCX_LIST_ITEM_SPACING,
        }),
      )
      for (const child of Array.from(li.children)) {
        const childTag = child.tagName.toLowerCase()
        if (childTag === "ul" || childTag === "ol") {
          processList(child, childTag as "ul" | "ol", depth + 1)
        }
      }
    }
  }

  const cellChildrenFromElement = (cell: Element, asHeader: boolean): unknown[] => {
    const out: unknown[] = []
    const pushCellParagraph = (runs: unknown[]) => {
      out.push(
        new Paragraph({
          children: runs.length > 0 ? runs : [new TextRun({ text: "" })],
          spacing: { after: 40 },
        }),
      )
    }

    const blockKids = Array.from(cell.children).filter((child) => {
      const tag = child.tagName.toLowerCase()
      return (
        tag === "p"
        || tag === "div"
        || tag.startsWith("h")
        || tag === "ul"
        || tag === "ol"
      )
    })

    if (blockKids.length === 0) {
      pushCellParagraph(createInlineRuns(cell, { bold: asHeader }))
      return out.length > 0 ? out : [new Paragraph({ children: [new TextRun({ text: "" })] })]
    }

    for (const child of blockKids) {
      const tag = child.tagName.toLowerCase()
      if (tag === "ul" || tag === "ol") {
        const items = Array.from(child.children).filter((li) => li.tagName.toLowerCase() === "li")
        for (const li of items) {
          const bullet = tag === "ul" ? "• " : ""
          const runs = createInlineRuns(li, { bold: asHeader })
          pushCellParagraph(
            runs.length > 0
              ? [new TextRun({ text: bullet, bold: asHeader }), ...runs]
              : [new TextRun({ text: `${bullet}${extractText(li)}`, bold: asHeader })],
          )
        }
        continue
      }
      const headingLevel = mapHtmlHeadingTagToDocxLevel(tag)
      pushCellParagraph(
        createInlineRuns(child, { bold: asHeader || headingLevel != null }),
      )
    }

    return out.length > 0 ? out : [new Paragraph({ children: [new TextRun({ text: "" })] })]
  }

  const pushTable = (tableEl: Element) => {
    if (!Table || !TableRow || !TableCell) {
      // Fallback: flatten cells to paragraphs if table constructors were not provided.
      tableEl.querySelectorAll("tr").forEach((row) => {
        const cells = Array.from(row.children).filter((c) => {
          const tag = c.tagName.toLowerCase()
          return tag === "td" || tag === "th"
        })
        const text = cells.map((c) => extractText(c)).filter(Boolean).join(" | ")
        if (text) pushParagraph([new TextRun({ text })])
      })
      return
    }

    const rows = Array.from(tableEl.querySelectorAll("tr"))
    if (rows.length === 0) return

    const colCount = Math.max(
      1,
      ...rows.map(
        (row) =>
          Array.from(row.children).filter((c) => {
            const tag = c.tagName.toLowerCase()
            return tag === "td" || tag === "th"
          }).length,
      ),
    )
    const colWidth = Math.floor(DOCX_TABLE_WIDTH_DXA / colCount)
    const borderStyle = BorderStyle?.SINGLE ?? DOCX_TABLE_BORDER.style
    const borders = {
      top: { style: borderStyle, size: DOCX_TABLE_BORDER.size, color: DOCX_TABLE_BORDER.color },
      bottom: { style: borderStyle, size: DOCX_TABLE_BORDER.size, color: DOCX_TABLE_BORDER.color },
      left: { style: borderStyle, size: DOCX_TABLE_BORDER.size, color: DOCX_TABLE_BORDER.color },
      right: { style: borderStyle, size: DOCX_TABLE_BORDER.size, color: DOCX_TABLE_BORDER.color },
    }

    const docxRows = rows.map((row) => {
      const cells = Array.from(row.children).filter((c) => {
        const tag = c.tagName.toLowerCase()
        return tag === "td" || tag === "th"
      })
      while (cells.length < colCount) {
        const pad = row.ownerDocument.createElement("td")
        cells.push(pad)
      }
      return new TableRow({
        children: cells.map((cell) => {
          const isHeader = cell.tagName.toLowerCase() === "th"
          return new TableCell({
            borders,
            width: { size: colWidth, type: WidthType?.DXA ?? "dxa" },
            children: cellChildrenFromElement(cell, isHeader),
          })
        }),
      })
    })

    paragraphs.push(
      new Table({
        width: { size: DOCX_TABLE_WIDTH_DXA, type: WidthType?.DXA ?? "dxa" },
        columnWidths: Array.from({ length: colCount }, () => colWidth),
        rows: docxRows,
      }),
    )
    // Spacing after table
    paragraphs.push(new Paragraph({ children: [new TextRun({ text: "" })], spacing: { after: 160 } }))
  }

  const pushFigurePlaceholder = (el: Element) => {
    const img = el.querySelector("img")
    const alt = img?.getAttribute("alt")?.trim() || extractText(el) || "Image"
    pushParagraph([new TextRun({ text: `[Image: ${alt}]`, italics: true })])
  }

  const pushFigureWithImage = async (el: Element) => {
    if (!imageDocx) {
      pushFigurePlaceholder(el)
      return
    }
    const img = el.querySelector("img")
    const src = img?.getAttribute("src")?.trim() || ""
    const alt = img?.getAttribute("alt")?.trim() || extractText(el) || "Image"
    const caption = el.querySelector("figcaption")?.textContent?.trim() || ""
    const fetchBytes = imageDocx.fetchImageBytes ?? fetchImageBytesForDocx
    const bytes = src ? await fetchBytes(src) : null
    if (!bytes) {
      pushFigurePlaceholder(el)
      return
    }
    try {
      const dims = imageDimensions(bytes)
      paragraphs.push(
        new Paragraph({
          children: [
            new imageDocx.ImageRun({
              type: inferImageType(src, bytes),
              data: bytes,
              transformation: dims,
              altText: { title: alt, description: alt, name: alt },
            }),
          ],
          spacing: { after: caption ? 80 : 160 },
        }),
      )
      if (caption) {
        pushParagraph([new TextRun({ text: caption, italics: true })], { after: 160 })
      }
    } catch {
      pushFigurePlaceholder(el)
    }
  }

  const blocks = collectExportBlockElements(html)

  const processBlock = async (el: Element) => {
    const tag = el.tagName.toLowerCase()
    const headingLevel = mapHtmlHeadingTagToDocxLevel(tag)
    if (headingLevel != null) {
      pushHeading(headingLevel, extractText(el))
      return
    }
    if (tag === "ul" || tag === "ol") {
      processList(el, tag, 0)
      return
    }
    if (tag === "table") {
      pushTable(el)
      return
    }
    if (tag === "figure" || tag === "img") {
      if (imageDocx) await pushFigureWithImage(tag === "img" ? el : el)
      else pushFigurePlaceholder(tag === "img" ? el : el)
      return
    }
    if (tag === "p" || tag === "div") {
      pushParagraph(createRunsExcludingLists(el))
    }
  }

  if (imageDocx) {
    return (async () => {
      for (const el of blocks) await processBlock(el)
      return paragraphs
    })()
  }

  for (const el of blocks) {
    void processBlock(el)
  }
  return paragraphs
}

export function resolveDefaultExportLogoUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/brand-mark.png`
  }
  return "/brand-mark.png"
}

export async function fetchImageBytesForDocx(url: string | null | undefined): Promise<Uint8Array | null> {
  const trimmed = (url ?? "").trim()
  if (!trimmed) return null
  try {
    const response = await fetch(trimmed)
    if (!response.ok) {
      console.warn("[task-content-docx-render] Logo fetch failed:", trimmed, response.status)
      return null
    }
    const buffer = await response.arrayBuffer()
    return buffer.byteLength > 0 ? new Uint8Array(buffer) : null
  } catch (error) {
    console.warn("[task-content-docx-render] Logo fetch error:", trimmed, error)
    return null
  }
}

export async function buildDocxLogoParagraph(
  logoUrl: string | null | undefined,
  docx: { Paragraph: new (options: Record<string, unknown>) => unknown; ImageRun: new (options: Record<string, unknown>) => unknown },
): Promise<unknown | null> {
  const { Paragraph, ImageRun } = docx
  const resolvedUrl = (logoUrl ?? "").trim() || resolveDefaultExportLogoUrl()
  const bytes = await fetchImageBytesForDocx(resolvedUrl)
  if (!bytes) return null

  try {
    return new Paragraph({
      children: [
        new ImageRun({
          type: inferImageType(resolvedUrl, bytes),
          data: bytes,
          transformation: { width: 120, height: 40 },
        }),
      ],
      spacing: { after: 160 },
    })
  } catch (error) {
    console.warn("[task-content-docx-render] Could not embed logo in DOCX:", error)
    return null
  }
}
