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
}

export function htmlToDocxElements(html: string, docx: DocxInlineBundle): unknown[] {
  const { Paragraph, TextRun, HeadingLevel, ExternalHyperlink } = docx
  const paragraphs: unknown[] = []
  if (!html?.trim()) return paragraphs
  if (typeof DOMParser === "undefined") return paragraphs

  const createInlineRuns = (
    node: Node,
    active: { bold?: boolean; italics?: boolean },
  ): unknown[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replaceAll("\u00A0", " ")
      if (!text.trim()) return []
      return [new TextRun({ text, bold: !!active.bold, italics: !!active.italics })]
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return []

    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (tag === "ul" || tag === "ol") return []

    if (tag === "br") {
      return [new TextRun({ text: "", break: 1 })]
    }

    const nextActive = { ...active }
    if (tag === "strong" || tag === "b") nextActive.bold = true
    if (tag === "em" || tag === "i") nextActive.italics = true

    if (tag === "a") {
      const href = (el.getAttribute("href") || "").trim()
      const linkRuns: unknown[] = []
      el.childNodes.forEach((child) => {
        linkRuns.push(...createInlineRuns(child, nextActive))
      })
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
        if (childTag === "ul" || childTag === "ol") return
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

  const blocks = collectExportBlockElements(html)
  for (const el of blocks) {
    const tag = el.tagName.toLowerCase()
    const headingLevel = mapHtmlHeadingTagToDocxLevel(tag)
    if (headingLevel != null) {
      pushHeading(headingLevel, extractText(el))
      continue
    }
    if (tag === "ul" || tag === "ol") {
      processList(el, tag, 0)
      continue
    }
    if (tag === "figure") {
      const img = el.querySelector("img")
      const alt = img?.getAttribute("alt")?.trim() || extractText(el) || "Image"
      pushParagraph([new TextRun({ text: `[Image: ${alt}]`, italics: true })])
      continue
    }
    if (tag === "p" || tag === "div") {
      pushParagraph(createRunsExcludingLists(el))
    }
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

function inferImageType(url: string, bytes: Uint8Array): "png" | "jpg" | "gif" | "bmp" {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg"
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "gif"
  if (url.toLowerCase().includes(".jpg") || url.toLowerCase().includes(".jpeg")) return "jpg"
  if (url.toLowerCase().includes(".gif")) return "gif"
  return "png"
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
