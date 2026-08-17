import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { moveItemBeforeKey } from "../lib/pane-tab-order"

/**
 * Right-pane workspace views. Entity kinds are pane-neutral — the same views
 * can also open in the middle pane. Browser session state lives on the tab,
 * not on the pane position.
 */
export type RightPaneTabKind =
  | "ai"
  | "browser"
  | "details"
  | "task"
  | "task-list"
  | "project-list"
  | "mention-list"
  | "user-list"
  | "ai-thread-list"
  | "artifact-list"
  | "template-list"
  | "suggestion"
  | "project"
  | "user"
  | "team"
  | "thread"
  | "artifact"
  | "source"
  | "template"
  | "research"
  | "create"
  | "search-results"
  | "start"

/** @deprecated Prefer WorkspaceBrowserAssociations naming; shape is pane-neutral. */
export type RightPaneBrowserAssociations = {
  browserId?: string | null
  sessionId?: string | null
  liveViewUrl?: string | null
  publicationRunId?: string | null
  destinationId?: string | null
  destinationName?: string | null
  artifactId?: string | null
  aiOperationId?: string | null
  phase?: string | null
  connectMessage?: string | null
  intentionallyStopped?: boolean
  /** Remote Browser Use screen size sent at provision (stable desktop, e.g. 1440×900). */
  requestedScreenWidth?: number | null
  requestedScreenHeight?: number | null
  /** @deprecated Legacy provision diagnostic; remote size is no longer pane × scale. */
  browserRenderScale?: number | null
  /** Articulate viewer mode — independent of remote screen size. */
  viewerMode?: "fit" | "fill" | null
  /** Per-session provider — not a permanent destination classification. */
  provider?: "browser_use_local" | "browser_use" | "articulate_desktop" | string | null
  /** Articulate Browser Bridge session id when provider is local. */
  bridgeSessionId?: string | null
  /** Why this browser tab was opened. */
  source?: "manual" | "publishing" | "ai" | "reconnect" | string | null
  currentUrl?: string | null
  pageTitle?: string | null
  /** Favicon URL for desktop / local browser tab chrome. */
  faviconUrl?: string | null
}

export type RightPaneTab = {
  key: string
  kind: RightPaneTabKind
  /** Entity / browser id when kind is not the sticky ai/details singleton. */
  id?: string
  title: string
  browser?: RightPaneBrowserAssociations
}

type RightPaneTabsState = {
  tabs: RightPaneTab[]
  activeKey: string | null
  upsertTab: (tab: {
    kind: RightPaneTabKind
    id?: string
    title?: string | null
    browser?: RightPaneBrowserAssociations
    activate?: boolean
  }) => string
  updateTab: (key: string, patch: Partial<Pick<RightPaneTab, "title" | "browser">>) => void
  setActiveKey: (key: string | null) => void
  closeTab: (key: string) => string | null
  closeAllBrowsers: () => void
  /** Place `key` immediately before `beforeKey` (or at end when beforeKey is null). */
  moveTabBefore: (key: string, beforeKey: string | null) => void
}

export const AI_RIGHT_TAB_KEY = "ai:main"
export const DETAILS_RIGHT_TAB_KEY = "details:main"

const MAX_BROWSER_TABS = 8

export function buildRightPaneTabKey(kind: RightPaneTabKind, id: string): string {
  return `${kind}:${id}`
}

function normalizeTitle(kind: RightPaneTabKind, title?: string | null, id?: string): string {
  const trimmed = typeof title === "string" ? title.trim() : ""
  if (trimmed) return trimmed
  if (kind === "ai") return "AI"
  if (kind === "details") return "Details"
  if (kind === "research") return "Research"
  if (kind === "create") return "Create"
  if (kind === "start") return "New"
  if (kind === "search-results") return "Search"
  if (kind === "browser") {
    if (id) return `Browser ${id.slice(0, 6)}`
    return "Browser"
  }
  if (kind === "task-list") return "Tasks"
  if (kind === "project-list") return "Projects"
  if (kind === "mention-list") return "Inbox"
  if (kind === "user-list") return "Users"
  if (kind === "ai-thread-list") return "AI chats"
  if (kind === "artifact-list") return "Outputs"
  if (kind === "template-list") return "Templates"
  if (kind === "task" && id) return `Task ${id}`
  if (kind === "suggestion" && id) return `Suggestion ${id}`
  if (kind === "project" && id) return `Project ${id}`
  if (kind === "user" && id) return `User ${id}`
  if (kind === "team" && id) return `Team ${id}`
  if (kind === "artifact" && id) return `Artifact ${id.slice(0, 8)}`
  if (kind === "source" && id) return `Source ${id.slice(0, 8)}`
  if (kind === "template" && id) return `Template ${id.slice(0, 12)}`
  if (kind === "thread" && id) return `Thread ${id}`
  return kind
}

export const useRightPaneTabsStore = create<RightPaneTabsState>()(
  persist(
    (set, get) => ({
      tabs: [{ key: AI_RIGHT_TAB_KEY, kind: "ai", title: "AI" }],
      activeKey: AI_RIGHT_TAB_KEY,

      upsertTab: ({ kind, id, title, browser, activate = true }) => {
        const key =
          kind === "ai"
            ? AI_RIGHT_TAB_KEY
            : kind === "details"
              ? DETAILS_RIGHT_TAB_KEY
              : kind === "browser"
                ? buildRightPaneTabKey("browser", id ?? crypto.randomUUID())
                : buildRightPaneTabKey(kind, String(id ?? "default"))

        set((state) => {
          const existing = state.tabs.find((tab) => tab.key === key)
          let tabs = state.tabs
          if (existing) {
            tabs = state.tabs.map((tab) =>
              tab.key === key
                ? {
                    ...tab,
                    id: id ?? tab.id,
                    title: title?.trim() ? title.trim() : tab.title,
                    browser: browser ? { ...tab.browser, ...browser } : tab.browser,
                  }
                : tab,
            )
          } else {
            const nextTab: RightPaneTab = {
              key,
              kind,
              id: id ? String(id) : undefined,
              title: normalizeTitle(kind, title, id),
              browser: kind === "browser" ? browser ?? {} : undefined,
            }
            tabs = [...state.tabs, nextTab]
            const browserTabs = tabs.filter((tab) => tab.kind === "browser")
            if (browserTabs.length > MAX_BROWSER_TABS) {
              const drop = browserTabs.slice(0, browserTabs.length - MAX_BROWSER_TABS).map((t) => t.key)
              tabs = tabs.filter((tab) => !drop.includes(tab.key))
            }
          }
          return {
            tabs,
            activeKey: activate ? key : state.activeKey,
          }
        })
        return key
      },

      updateTab: (key, patch) => {
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.key !== key) return tab
            return {
              ...tab,
              title: patch.title?.trim() ? patch.title.trim() : tab.title,
              browser: patch.browser ? { ...tab.browser, ...patch.browser } : tab.browser,
            }
          }),
        }))
      },

      setActiveKey: (key) => set({ activeKey: key }),

      closeTab: (key) => {
        const { tabs, activeKey } = get()
        if (key === AI_RIGHT_TAB_KEY) {
          // AI tab is sticky; closing means deactivate to details.
          set({ activeKey: DETAILS_RIGHT_TAB_KEY })
          return DETAILS_RIGHT_TAB_KEY
        }
        const index = tabs.findIndex((tab) => tab.key === key)
        if (index < 0) return activeKey
        const nextTabs = tabs.filter((tab) => tab.key !== key)
        let nextActive = activeKey
        if (activeKey === key) {
          const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? nextTabs[0] ?? null
          nextActive = fallback?.key ?? null
        }
        set({ tabs: nextTabs, activeKey: nextActive })
        return nextActive
      },

      closeAllBrowsers: () => {
        set((state) => ({
          tabs: state.tabs.filter((tab) => tab.kind !== "browser"),
          activeKey: state.activeKey?.startsWith("browser:") ? AI_RIGHT_TAB_KEY : state.activeKey,
        }))
      },

      moveTabBefore: (key, beforeKey) => {
        set((state) => ({
          tabs: moveItemBeforeKey(state.tabs, key, beforeKey),
        }))
      },
    }),
    {
      name: "articulate-right-pane-tabs-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeKey: state.activeKey,
      }),
    },
  ),
)

/** Find an open browser tab already bound to a publication run, destination, or artifact. */
export function findBrowserTabForPublication(
  tabs: RightPaneTab[],
  args: {
    publicationRunId?: string | null
    destinationId?: string | null
    artifactId?: string | null
  },
): RightPaneTab | null {
  if (args.publicationRunId) {
    const byRun = tabs.find(
      (tab) => tab.kind === "browser" && tab.browser?.publicationRunId === args.publicationRunId,
    )
    if (byRun) return byRun
  }
  if (args.destinationId && args.artifactId) {
    const byBoth = tabs.find(
      (tab) =>
        tab.kind === "browser" &&
        tab.browser?.destinationId === args.destinationId &&
        tab.browser?.artifactId === args.artifactId,
    )
    if (byBoth) return byBoth
  }
  if (args.destinationId) {
    const byDest = tabs.find(
      (tab) => tab.kind === "browser" && tab.browser?.destinationId === args.destinationId,
    )
    if (byDest) return byDest
  }
  if (args.artifactId) {
    const byArtifact = tabs.find(
      (tab) => tab.kind === "browser" && tab.browser?.artifactId === args.artifactId,
    )
    if (byArtifact) return byArtifact
  }
  return null
}
