import { describe, expect, it } from "vitest"
import {
  hasWorkspaceOutputCreateScope,
  normalizeHttpUrl,
  readWorkspaceOutputCreateScopeFromSearch,
  scopeFromArtifactSnapshot,
  selectedArtifactIdFromSearch,
  titleFromHttpUrl,
} from "../app/lib/workspace-create-output"

describe("workspace-create-output", () => {
  it("reads the open AI thread from the Outputs URL", () => {
    const params = new URLSearchParams(
      "leftPaneView=artifact-list&aiThreadId=0834d7d5-6efd-44c4-b5fc-0b1cb6d6fa53&centerArtifactId=1e2c1811-d13b-4875-9b03-48b89379c465",
    )
    expect(readWorkspaceOutputCreateScopeFromSearch(params)).toEqual({
      aiThreadId: "0834d7d5-6efd-44c4-b5fc-0b1cb6d6fa53",
      taskId: null,
      projectId: null,
    })
    expect(selectedArtifactIdFromSearch(params)).toBe(
      "1e2c1811-d13b-4875-9b03-48b89379c465",
    )
    expect(
      hasWorkspaceOutputCreateScope(readWorkspaceOutputCreateScopeFromSearch(params)),
    ).toBe(true)
  })

  it("uses a selected artifact as a fallback home", () => {
    expect(
      hasWorkspaceOutputCreateScope(
        scopeFromArtifactSnapshot({
          task_id: 13630,
          project_id: null,
          ai_thread_id: "c57ce530-0e50-45f4-a90b-884692ed5dc2",
        }),
      ),
    ).toBe(true)
    expect(hasWorkspaceOutputCreateScope({ taskId: 0, projectId: null })).toBe(false)
  })

  it("normalizes pasted URLs", () => {
    expect(normalizeHttpUrl("example.com/path")).toBe("https://example.com/path")
    expect(normalizeHttpUrl("https://www.example.com")).toBe("https://www.example.com/")
    expect(normalizeHttpUrl("ftp://example.com")).toBeNull()
    expect(normalizeHttpUrl("not a url")).toBeNull()
    expect(titleFromHttpUrl("https://www.articulate.com/blog")).toBe("articulate.com")
  })
})
