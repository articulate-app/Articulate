import { describe, expect, it } from "vitest"
import {
  filesFromDataTransfer,
  importUrlToArtifactContent,
  isFileImportDrag,
  isImportableArtifactFile,
  isOutputsDropzoneHit,
  isPointInsideElement,
} from "../features/artifacts/import-file-to-artifact"

describe("import-file-to-artifact", () => {
  it("turns a URL into a linked document", () => {
    const imported = importUrlToArtifactContent("https://example.com/brief")
    expect(imported.title).toBe("example.com")
    expect(imported.html).toContain("https://example.com/brief")
    expect(imported.text).toContain("https://example.com/brief")
  })

  it("accepts Word, PDF, and plain text files", () => {
    expect(isImportableArtifactFile(new File(["x"], "brief.docx"))).toBe(true)
    expect(isImportableArtifactFile(new File(["x"], "pack.pdf", { type: "application/pdf" }))).toBe(true)
    expect(isImportableArtifactFile(new File(["hello"], "notes.txt"))).toBe(true)
    expect(isImportableArtifactFile(new File(["x"], "photo.png", { type: "image/png" }))).toBe(false)
  })

  it("detects a Files drag", () => {
    expect(isFileImportDrag({ types: ["Files"] } as DataTransfer)).toBe(true)
    expect(isFileImportDrag({ types: ["application/x-moz-file"] } as DataTransfer)).toBe(true)
    expect(isFileImportDrag({ types: ["text/plain"] } as DataTransfer)).toBe(false)
    expect(isFileImportDrag({ types: [] } as DataTransfer)).toBe(true)
    expect(isFileImportDrag({
      types: ["application/x-articulate-artifact-id"],
    } as DataTransfer)).toBe(false)
  })

  it("reads files from DataTransfer items when files is empty", () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" })
    expect(filesFromDataTransfer({
      files: [] as unknown as FileList,
      items: [{ kind: "file", getAsFile: () => file }] as unknown as DataTransferItemList,
    } as DataTransfer).map((row) => row.name)).toEqual(["notes.txt"])
  })

  it("detects a point inside an element box", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 10, right: 50, top: 20, bottom: 80 }),
    } as unknown as Element
    expect(isPointInsideElement(el, 12, 30)).toBe(true)
    expect(isPointInsideElement(el, 8, 30)).toBe(false)
  })

  it("treats a parent outputs section as the same drop target", () => {
    const child = { contains: () => false } as unknown as HTMLElement
    const parent = { contains: (node: unknown) => node === child } as unknown as HTMLElement
    const other = { contains: () => false } as unknown as HTMLElement
    expect(isOutputsDropzoneHit(child, parent)).toBe(true)
    expect(isOutputsDropzoneHit(child, child)).toBe(true)
    expect(isOutputsDropzoneHit(child, other)).toBe(false)
  })
})
