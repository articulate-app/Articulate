import { describe, expect, it } from "vitest"
import { artifactRowToDirectorySearchDocument } from "../app/lib/services/artifacts"

describe("artifactRowToDirectorySearchDocument", () => {
  it("maps an artifacts row to a directory search document", () => {
    const item = artifactRowToDirectorySearchDocument({
      id: "cafe2fdb-1b26-4612-aca2-163a36d6639d",
      title: "Q3 brief",
      created_at: "2026-08-18T10:00:00Z",
      updated_at: "2026-08-19T09:00:00Z",
      project_id: 42,
      project_name: "Northwind",
      task_id: 13622,
      artifact_type: "document",
      import_file_name: "Q3 brief.docx",
    })

    expect(item).toMatchObject({
      entity_type: "artifact",
      entity_id: "cafe2fdb-1b26-4612-aca2-163a36d6639d",
      title: "Q3 brief",
      subtitle: "Northwind",
      created_at: "2026-08-18T10:00:00Z",
      project_id: 42,
      task_id: 13622,
    })
    expect(item?.display_payload?.title).toBe("Q3 brief")
    expect(item?.display_payload?.left?.label).toBe("Northwind")
    expect(item?.raw.artifact_id).toBe("cafe2fdb-1b26-4612-aca2-163a36d6639d")
    expect(item?.raw.project_name).toBe("Northwind")
    expect(item?.raw.file_kind).toBe("word")
  })

  it("returns null without an id and untitled when title is empty", () => {
    expect(artifactRowToDirectorySearchDocument({ title: "Nope" })).toBeNull()
    expect(artifactRowToDirectorySearchDocument({ id: "a1", title: "  " })?.title).toBe("Untitled")
  })
})
