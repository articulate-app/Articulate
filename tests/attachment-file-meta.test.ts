import { describe, expect, it } from "vitest"
import {
  getAttachmentFileKind,
  getAttachmentTypeLabel,
  truncateAttachmentFileName,
} from "../features/ai-chat/attachment-file-meta"

describe("attachment-file-meta", () => {
  it("detects word documents from mime and extension", () => {
    expect(
      getAttachmentFileKind({
        fileName: "Somengil - Capacity management.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("word")
    expect(getAttachmentTypeLabel("word")).toBe("Document")
  })

  it("truncates long filenames with an ellipsis", () => {
    expect(
      truncateAttachmentFileName("Somengil - Capacity management - final draft.docx", 32),
    ).toBe("Somengil - Capacity management…")
  })
})
