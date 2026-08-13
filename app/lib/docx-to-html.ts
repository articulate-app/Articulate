/**
 * Convert a .docx ArrayBuffer to HTML for in-app rich-text preview.
 */

type MammothModule = {
  convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
}

export async function docxArrayBufferToHtml(buffer: ArrayBuffer): Promise<string> {
  const mammothMod = (await import("mammoth")) as unknown as MammothModule & {
    default?: MammothModule
  }
  const mammoth = mammothMod.default ?? mammothMod
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  const html = typeof result.value === "string" ? result.value.trim() : ""
  return html || "<p></p>"
}

export async function fetchDocxHtmlFromUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`docx_fetch_failed:${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  return docxArrayBufferToHtml(buffer)
}
