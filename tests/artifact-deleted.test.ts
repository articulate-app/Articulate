import { describe, expect, it } from "vitest"
import { deletedArtifactRowFromRpc } from "../app/lib/services/artifacts"

describe("deletedArtifactRowFromRpc", () => {
  it("maps a deleted directory row", () => {
    const row = deletedArtifactRowFromRpc({
      id: "cafe2fdb-1b26-4612-aca2-163a36d6639d",
      title: "Cetose",
      created_at: "2026-08-18T10:00:00Z",
      updated_at: "2026-08-20T09:00:00Z",
      archived_at: "2026-08-20T09:00:00Z",
      project_id: 42,
      project_name: "Northwind",
      task_id: 13622,
      ai_thread_id: null,
    })
    expect(row).toMatchObject({
      id: "cafe2fdb-1b26-4612-aca2-163a36d6639d",
      title: "Cetose",
      archivedAt: "2026-08-20T09:00:00Z",
      projectName: "Northwind",
      taskId: 13622,
    })
  })

  it("returns null without an id", () => {
    expect(deletedArtifactRowFromRpc({ title: "Gone" })).toBeNull()
  })
})
