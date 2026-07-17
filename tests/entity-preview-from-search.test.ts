import { describe, expect, it } from "vitest"
import {
  globalSearchDocumentToProjectPreview,
  globalSearchDocumentToRowPayload,
  globalSearchDocumentToTaskPreview,
  globalSearchDocumentToThreadPreview,
  globalSearchDocumentToUserPreview,
  mergePreviewWithFull,
} from "../app/lib/entity-preview-from-search"
import type { GlobalSearchDocument } from "../app/lib/global-search-types"

function baseDocument(overrides: Partial<GlobalSearchDocument>): GlobalSearchDocument {
  return {
    entity_type: "task",
    entity_id: "1",
    title: "Fallback title",
    subtitle: null,
    preview: null,
    created_at: null,
    score: null,
    url: null,
    project_id: null,
    task_id: null,
    thread_id: null,
    display_payload: null,
    raw: {},
    ...overrides,
  }
}

describe("entity-preview-from-search", () => {
  it("maps task search documents into task detail seed data", () => {
    const item = baseDocument({
      entity_type: "task",
      entity_id: "42",
      project_id: 7,
      display_payload: {
        title: "Write blog post",
        subtitle: "Acme Corp",
        preview: "Short briefing preview",
        meta: [
          { label: "delivery_date", value: "2026-06-15" },
          { label: "status", value: "In progress" },
        ],
        badges: [{ label: "In progress", color: "#00AA00" }],
        avatars: [{ id: 9, name: "Alex", photo: "alex.jpg" }],
      },
      raw: { id: 42 },
    })

    const preview = globalSearchDocumentToTaskPreview(item)
    expect(preview?.id).toBe(42)
    expect(preview?.title).toBe("Write blog post")
    expect(preview?.project_name).toBe("Acme Corp")
    expect(preview?.project_id_int).toBe(7)
    expect(preview?.delivery_date).toBe("2026-06-15")
    expect(preview?.assigned_to_name).toBe("Alex")
    expect(preview?.project_status_name).toBe("In progress")
    expect(preview?.briefing).toBe("Short briefing preview")
  })

  it("maps project and user previews for detail panes", () => {
    const project = globalSearchDocumentToProjectPreview(
      baseDocument({
        entity_type: "project",
        entity_id: "5",
        display_payload: {
          title: "Acme Website",
          color: "#112233",
          logo: "logo.png",
        },
      }),
    )
    expect(project?.project_id).toBe(5)
    expect(project?.name).toBe("Acme Website")
    expect(project?.color).toBe("#112233")
    expect(project?.__partial).toBe(true)

    const user = globalSearchDocumentToUserPreview(
      baseDocument({
        entity_type: "user",
        entity_id: "12",
        display_payload: {
          title: "Jane Doe",
          subtitle: "jane@example.com",
          photo: "jane.jpg",
        },
      }),
    )
    expect(user?.user_id).toBe(12)
    expect(user?.full_name).toBe("Jane Doe")
    expect(user?.auth_email).toBe("jane@example.com")
  })

  it("maps mention/thread previews and row payloads", () => {
    const thread = globalSearchDocumentToThreadPreview(
      baseDocument({
        entity_type: "mention",
        entity_id: "99",
        thread_id: 88,
        display_payload: { title: "Thread subject" },
      }),
    )
    expect(thread?.id).toBe(88)
    expect(thread?.title).toBe("Thread subject")

    const row = globalSearchDocumentToRowPayload(
      baseDocument({
        entity_type: "task",
        entity_id: "3",
        display_payload: { title: "Task from home" },
        raw: { task_id: 3, extra: "field" },
      }),
    )
    expect(row.id).toBe(3)
    expect(row.title).toBe("Task from home")
    expect(row.extra).toBe("field")
  })

  it("prefers full data over preview when merging", () => {
    const merged = mergePreviewWithFull(
      { name: "Preview", color: "#111111", __partial: true },
      { name: "Full name", color: "#222222", project_id: 1 },
    )
    expect(merged).toEqual({
      name: "Full name",
      color: "#222222",
      project_id: 1,
      __partial: true,
    })
  })
})
