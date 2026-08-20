import { describe, expect, it } from "vitest"
import { resolveArtifactDirectoryFileKindFromRow } from "../app/lib/artifacts/artifact-file-kind"

describe("resolveArtifactDirectoryFileKindFromRow", () => {
  it("uses the imported Word file name", () => {
    expect(
      resolveArtifactDirectoryFileKindFromRow({
        title: "Market timing",
        artifact_type: "document",
        metadata: { import_kind: "file", import_file_name: "Market timing.docx" },
      }),
    ).toBe("word")
  })

  it("uses the imported PDF file name", () => {
    expect(
      resolveArtifactDirectoryFileKindFromRow({
        title: "Report",
        metadata: { import_file_name: "report.pdf" },
      }),
    ).toBe("pdf")
  })

  it("marks image artifacts", () => {
    expect(
      resolveArtifactDirectoryFileKindFromRow({
        title: "Hero",
        artifact_type: "image",
      }),
    ).toBe("image")
  })

  it("defaults authored documents to Word", () => {
    expect(
      resolveArtifactDirectoryFileKindFromRow({
        title: "Draft from chat",
        artifact_type: "document",
        metadata: { import_kind: "chat_draft" },
      }),
    ).toBe("word")
  })
})
