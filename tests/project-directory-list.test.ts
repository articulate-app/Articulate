import { describe, expect, it } from "vitest"
import { projectRowToDirectorySearchDocument } from "../app/lib/services/projects"

describe("projectRowToDirectorySearchDocument", () => {
  it("maps a projects row to a directory search document", () => {
    const item = projectRowToDirectorySearchDocument({
      id: 42,
      name: "Northwind",
      logo: "projects/nw.png",
      color: "#112233",
      created_by: 7,
      created_at: "2026-08-18T10:00:00Z",
      updated_at: "2026-08-19T09:00:00Z",
    })

    expect(item).toMatchObject({
      entity_type: "project",
      entity_id: "42",
      title: "Northwind",
      project_id: 42,
      created_at: "2026-08-18T10:00:00Z",
    })
    expect(item?.display_payload?.logo).toBe("projects/nw.png")
    expect(item?.display_payload?.color).toBe("#112233")
    expect(item?.raw.created_by).toBe(7)
  })

  it("returns null without an id and untitled when name is empty", () => {
    expect(projectRowToDirectorySearchDocument({ name: "Nope" })).toBeNull()
    expect(projectRowToDirectorySearchDocument({ id: 1, name: "  " })?.title).toBe("Untitled")
  })
})
