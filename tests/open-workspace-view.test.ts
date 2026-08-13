import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../app/lib/tasks-shallow-nav", () => ({
  shallowReplaceSearchParams: vi.fn((pathname: string, next: URLSearchParams) => {
    const q = next.toString()
    const url = q ? `${pathname}?${q}` : pathname
    const win = (globalThis as any).window
    if (!win?.location) return
    const u = new URL(url, "http://localhost")
    // Mutate in place — do not replace the location object (history.replaceState closes over it).
    win.location.pathname = u.pathname
    win.location.search = u.search
    win.location.href = u.href
  }),
  dispatchTasksShallowNavigation: vi.fn(),
  TASKS_SHALLOW_NAV_EVENT: "articulate:tasks-shallow-nav",
}))

vi.mock("../app/store/center-pane-tabs", () => {
  const tabs: Array<{ key: string; kind: string; id: string; title: string }> = []
  return {
    useCenterPaneTabsStore: {
      getState: () => ({
        tabs,
        upsertTab: ({ kind, id, title }: { kind: string; id: string; title?: string | null }) => {
          const key = `${kind}:${id}`
          if (!tabs.find((t) => t.key === key)) {
            tabs.push({ key, kind, id, title: title?.trim() || kind })
          }
        },
        closeTab: (key: string) => {
          const idx = tabs.findIndex((t) => t.key === key)
          if (idx < 0) return null
          tabs.splice(idx, 1)
          return tabs[idx] ?? tabs[idx - 1] ?? tabs[0] ?? null
        },
        __reset: () => {
          tabs.splice(0, tabs.length)
        },
      }),
    },
  }
})

vi.mock("../app/store/right-pane-tabs", () => {
  const tabs: Array<{
    key: string
    kind: string
    id?: string
    title: string
    browser?: Record<string, unknown>
  }> = [{ key: "ai:main", kind: "ai", title: "AI" }]
  let activeKey: string | null = "ai:main"
  return {
    useRightPaneTabsStore: {
      getState: () => ({
        tabs,
        activeKey,
        upsertTab: ({
          kind,
          id,
          title,
          browser,
          activate = true,
        }: {
          kind: string
          id?: string
          title?: string | null
          browser?: Record<string, unknown>
          activate?: boolean
        }) => {
          const key =
            kind === "ai"
              ? "ai:main"
              : kind === "details"
                ? "details:main"
                : `${kind}:${id ?? "default"}`
          const existing = tabs.find((t) => t.key === key)
          if (existing) {
            if (title?.trim()) existing.title = title.trim()
            if (browser) existing.browser = { ...existing.browser, ...browser }
          } else {
            tabs.push({
              key,
              kind,
              id,
              title: title?.trim() || kind,
              browser: kind === "browser" ? browser ?? {} : undefined,
            })
          }
          if (activate) activeKey = key
          return key
        },
        closeTab: (key: string) => {
          const idx = tabs.findIndex((t) => t.key === key)
          if (idx >= 0) tabs.splice(idx, 1)
          activeKey = tabs[0]?.key ?? null
          return activeKey
        },
        setActiveKey: (key: string | null) => {
          activeKey = key
        },
        __reset: () => {
          tabs.splice(0, tabs.length)
          tabs.push({ key: "ai:main", kind: "ai", title: "AI" })
          activeKey = "ai:main"
        },
      }),
    },
    findBrowserTabForPublication: () => null,
  }
})

vi.mock("../app/store/left-pane-tabs", () => {
  const tabs: Array<{ key: string; kind: string; id: string; title: string }> = [
    { key: "task-list:main", kind: "task-list", id: "main", title: "Tasks" },
  ]
  let activeKey: string | null = "task-list:main"
  return {
    useLeftPaneTabsStore: {
      getState: () => ({
        tabs,
        activeKey,
        upsertTab: ({
          kind,
          id,
          title,
          activate = true,
        }: {
          kind: string
          id: string
          title?: string | null
          activate?: boolean
        }) => {
          const key = `${kind}:${id}`
          const existing = tabs.find((t) => t.key === key)
          if (existing) {
            if (title?.trim()) existing.title = title.trim()
          } else {
            tabs.push({ key, kind, id, title: title?.trim() || kind })
          }
          if (activate) activeKey = key
          return key
        },
        closeTab: (key: string) => {
          const idx = tabs.findIndex((t) => t.key === key)
          if (idx >= 0) tabs.splice(idx, 1)
          activeKey = tabs[0]?.key ?? null
          return activeKey
        },
        setActiveKey: (key: string | null) => {
          activeKey = key
        },
        __reset: () => {
          tabs.splice(0, tabs.length)
          tabs.push({ key: "task-list:main", kind: "task-list", id: "main", title: "Tasks" })
          activeKey = "task-list:main"
        },
      }),
    },
    ensureLeftPaneHasDefaultListTab: () => {},
  }
})

function installFakeWindow(search = "") {
  const location = {
    pathname: "/",
    search,
    href: search ? `http://localhost/${search}` : "http://localhost/",
  }
  ;(globalThis as any).window = {
    location,
    history: {
      replaceState: (_state: unknown, _title: string, url: string) => {
        const u = new URL(url, "http://localhost")
        location.pathname = u.pathname
        location.search = u.search
        location.href = u.href
      },
    },
  }
}

import {
  getOtherWorkspacePane,
  moveWorkspaceView,
  openWorkspaceView,
  openWorkspaceViewInOtherPane,
} from "../app/lib/open-workspace-view"
import {
  applyWorkspaceViewToSearchParams,
  getActiveLeftWorkspaceTab,
  getActiveMiddleWorkspaceTab,
  getActiveRightWorkspaceTab,
  LEFT_PANE_EMPTY_VIEW,
} from "../app/lib/workspace-pane-url"
import { useCenterPaneTabsStore } from "../app/store/center-pane-tabs"
import { useLeftPaneTabsStore } from "../app/store/left-pane-tabs"
import { useRightPaneTabsStore } from "../app/store/right-pane-tabs"

describe("getOtherWorkspacePane", () => {
  it("maps left → middle and flips middle ↔ right", () => {
    expect(getOtherWorkspacePane("left")).toBe("middle")
    expect(getOtherWorkspacePane("middle")).toBe("right")
    expect(getOtherWorkspacePane("right")).toBe("middle")
  })
})

describe("applyWorkspaceViewToSearchParams (pane targeting)", () => {
  it("opens task in middle and right", () => {
    const middle = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(),
      pane: "middle",
      type: "task",
      id: 13418,
    })
    expect(getActiveMiddleWorkspaceTab(middle)).toMatchObject({ type: "task", id: "13418" })

    const right = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(),
      pane: "right",
      type: "task",
      id: 99,
    })
    expect(getActiveRightWorkspaceTab(right)).toMatchObject({ type: "task", id: "99" })
  })

  it("opens AI in either pane with the same thread id", () => {
    const right = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(),
      pane: "right",
      type: "ai",
      params: { aiThreadId: "thread-a" },
    })
    expect(getActiveRightWorkspaceTab(right)).toMatchObject({ type: "ai", id: "thread-a" })

    const middle = applyWorkspaceViewToSearchParams({
      current: right,
      pane: "middle",
      type: "ai",
      params: { aiThreadId: "thread-a" },
    })
    expect(getActiveMiddleWorkspaceTab(middle)).toMatchObject({ type: "ai", id: "thread-a" })
    expect(middle.get("aiThreadId")).toBe("thread-a")
  })

  it("opens browser / artifact / research in either pane", () => {
    const browserMiddle = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(),
      pane: "middle",
      type: "browser",
      id: "b1",
      params: { browserTabId: "b1" },
    })
    expect(getActiveMiddleWorkspaceTab(browserMiddle)?.type).toBe("browser")

    const browserRight = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(),
      pane: "right",
      type: "browser",
      id: "b1",
      params: { browserTabId: "b1", keepAiOpen: true },
    })
    expect(getActiveRightWorkspaceTab(browserRight)?.type).toBe("browser")

    const artifactRight = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(),
      pane: "right",
      type: "artifact",
      id: "art-1",
    })
    expect(getActiveRightWorkspaceTab(artifactRight)).toMatchObject({
      type: "artifact",
      id: "art-1",
    })

    const researchRight = applyWorkspaceViewToSearchParams({
      current: new URLSearchParams(),
      pane: "right",
      type: "research",
    })
    expect(getActiveRightWorkspaceTab(researchRight)?.type).toBe("research")
  })
})

describe("openWorkspaceView / moveWorkspaceView", () => {
  beforeEach(() => {
    installFakeWindow()
    ;(useCenterPaneTabsStore.getState() as { __reset?: () => void }).__reset?.()
    ;(useRightPaneTabsStore.getState() as { __reset?: () => void }).__reset?.()
    ;(useLeftPaneTabsStore.getState() as { __reset?: () => void }).__reset?.()
  })

  it("opens task in middle (default UX path)", () => {
    openWorkspaceView({ type: "task", taskId: 13418 }, { pane: "middle", pathname: "/" })
    const params = new URLSearchParams((globalThis as any).window.location.search)
    expect(getActiveMiddleWorkspaceTab(params)).toMatchObject({ type: "task", id: "13418" })
  })

  it("opens AI in right by default path and keeps thread id", () => {
    openWorkspaceView(
      { type: "ai", aiThreadId: "thread-a" },
      { pane: "right", pathname: "/" },
    )
    const params = new URLSearchParams((globalThis as any).window.location.search)
    expect(getActiveRightWorkspaceTab(params)).toMatchObject({ type: "ai", id: "thread-a" })
    expect(params.get("aiThreadId")).toBe("thread-a")
  })

  it("moves task middle → right and clears middle selection", () => {
    openWorkspaceView({ type: "task", taskId: 42 }, { pane: "middle", pathname: "/" })
    moveWorkspaceView({ type: "task", taskId: 42, id: "42" }, "middle", { pathname: "/" })
    const params = new URLSearchParams((globalThis as any).window.location.search)
    expect(getActiveRightWorkspaceTab(params)).toMatchObject({ type: "task", id: "42" })
    expect(getActiveMiddleWorkspaceTab(params)).toBeNull()
  })

  it("moves list left → middle without reseeding the list on left", () => {
    openWorkspaceView({ type: "project-list" }, { pane: "left", pathname: "/" })
    moveWorkspaceView({ type: "project-list", id: "main" }, "left", {
      pathname: "/",
      toPane: "middle",
    })
    const params = new URLSearchParams((globalThis as any).window.location.search)
    expect(getActiveMiddleWorkspaceTab(params)).toMatchObject({ type: "project-list" })
    // Left either keeps another remaining tab or is explicitly emptied — never the moved list.
    const left = getActiveLeftWorkspaceTab(params)
    expect(left?.type === "project-list").toBe(false)
    if (!left) {
      expect(params.get("leftPaneView")).toBe(LEFT_PANE_EMPTY_VIEW)
    }
  })

  it("moves AI right → middle without changing thread id", () => {
    openWorkspaceView(
      { type: "ai", aiThreadId: "thread-move" },
      { pane: "right", pathname: "/" },
    )
    moveWorkspaceView(
      { type: "ai", aiThreadId: "thread-move", id: "thread-move" },
      "right",
      { pathname: "/" },
    )
    const params = new URLSearchParams((globalThis as any).window.location.search)
    expect(getActiveMiddleWorkspaceTab(params)).toMatchObject({
      type: "ai",
      id: "thread-move",
    })
    expect(params.get("aiThreadId")).toBe("thread-move")
  })

  it("open in other pane keeps task in middle while opening AI in right", () => {
    openWorkspaceView({ type: "task", taskId: 7 }, { pane: "middle", pathname: "/" })
    openWorkspaceViewInOtherPane(
      { type: "ai", aiThreadId: "side-ai" },
      "middle",
      { pathname: "/" },
    )
    const params = new URLSearchParams((globalThis as any).window.location.search)
    expect(getActiveMiddleWorkspaceTab(params)?.type).toBe("task")
    expect(getActiveRightWorkspaceTab(params)).toMatchObject({ type: "ai", id: "side-ai" })
  })

  it("reuses same view in same pane", () => {
    openWorkspaceView({ type: "project", projectId: 11 }, { pane: "middle", pathname: "/" })
    openWorkspaceView({ type: "project", projectId: 11 }, { pane: "middle", pathname: "/" })
    const params = new URLSearchParams((globalThis as any).window.location.search)
    expect(getActiveMiddleWorkspaceTab(params)).toMatchObject({ type: "project", id: "11" })
  })

  it("opening user in right does not write centerUserId (pane isolation)", () => {
    ;(globalThis as any).window.location.search =
      "?layout=right&rightView=project&centerProjectId=33&rightProjectId=33&object=project"
    openWorkspaceView({ type: "user", id: 60 }, { pane: "right", pathname: "/" })
    const params = new URLSearchParams((globalThis as any).window.location.search)
    expect(params.get("centerProjectId")).toBe("33")
    expect(params.get("centerUserId")).toBeNull()
    expect(params.get("rightView")).toBe("user")
    expect(params.get("rightUserId")).toBe("60")
  })
})
