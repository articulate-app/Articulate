import { describe, expect, it } from "vitest"
import { pdfBytesToPlainText } from "../features/artifacts/pdf-bytes-to-text"

function encodeAscii(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i)
  return bytes
}

describe("pdf-bytes-to-text", () => {
  it("reads literal text from an uncompressed PDF stream", async () => {
    const pdf = `%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 48 >>
stream
BT /F1 12 Tf 10 100 Td (Hello PDF) Tj ET
endstream
endobj
`
    const text = await pdfBytesToPlainText(encodeAscii(pdf))
    expect(text).toContain("Hello PDF")
  })

  it("returns empty for non-PDF bytes", async () => {
    expect(await pdfBytesToPlainText(encodeAscii("not a pdf"))).toBe("")
  })
})
