import { describe, expect, it } from "vitest"
import { Bot, FileText, FolderKanban, Globe2, ListTodo } from "lucide-react"
import {
  resolveWorkspaceTabIcon,
  resolveWorkspaceTabKind,
} from "../app/lib/workspace-tab-icon"

describe("workspace tab icons", () => {
  it("prefers an explicit kind over the key prefix", () => {
    expect(resolveWorkspaceTabKind({ kind: "artifact", key: "task:12" })).toBe("artifact")
  })

  it("reads the object type from the tab key", () => {
    expect(resolveWorkspaceTabKind({ key: "task-list:main" })).toBe("task-list")
    expect(resolveWorkspaceTabKind({ key: "ai:059623ee-ecd1-458e-b104-85d3adce81b9" })).toBe("ai")
  })

  it("maps object types used in workspace tabs", () => {
    expect(resolveWorkspaceTabIcon("task")).toBe(ListTodo)
    expect(resolveWorkspaceTabIcon("project")).toBe(FolderKanban)
    expect(resolveWorkspaceTabIcon("artifact")).toBe(FileText)
    expect(resolveWorkspaceTabIcon("ai")).toBe(Bot)
    expect(resolveWorkspaceTabIcon("browser")).toBe(Globe2)
    expect(resolveWorkspaceTabIcon("unknown")).toBeNull()
  })
})
