import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import {
  AI_WORKSPACE_TAB_ID,
  LIST_WORKSPACE_TAB_ID,
  buildWorkspaceTabKey,
  isListWorkspaceViewType,
  type WorkspaceViewType,
} from "../lib/workspace-view"
import {
  isWorkspaceListViewType,
  workspaceListViewLabel,
  type WorkspaceListViewType,
} from "../lib/workspace-list-views"
import { moveItemBeforeKey } from "../lib/pane-tab-order"

export type LeftPaneTabKind = WorkspaceViewType

export type LeftPaneTab = {
  key: string
  kind: LeftPaneTabKind
  id: string
  title: string
}

export function buildLeftPaneTabKey(kind: LeftPaneTabKind, id: string): string {
  return buildWorkspaceTabKey(kind, id)
}

type LeftPaneTabsState = {
  tabs: LeftPaneTab[]
  activeKey: string | null
  upsertTab: (tab: {
    kind: LeftPaneTabKind
    id: string
    title?: string | null
    activate?: boolean
  }) => string
  updateTitle: (key: string, title: string) => void
  setActiveKey: (key: string | null) => void
  closeTab: (key: string) => string | null
  closeTabs: (keys: string[]) => string | null
  closeAll: () => void
  /** Place `key` immediately before `beforeKey` (or at end when beforeKey is null). */
  moveTabBefore: (key: string, beforeKey: string | null) => void
}

const MAX_TABS = 16

function normalizeTitle(kind: LeftPaneTabKind, title?: string | null, id?: string): string {
  const trimmed = typeof title === "string" ? title.trim() : ""
  if (trimmed) return trimmed
  if (isWorkspaceListViewType(kind)) return workspaceListViewLabel(kind)
  if (kind === "ai") return "AI"
  if (kind === "browser") return id ? `Browser ${id.slice(0, 6)}` : "Browser"
  if (kind === "research") return "Research"
  if (kind === "create") return "Create"
  if (kind === "task" && id) return `Task ${id}`
  if (kind === "project" && id) return `Project ${id}`
  if (kind === "user" && id) return `User ${id}`
  if (kind === "artifact" && id) return `Artifact ${id.slice(0, 8)}`
  if (kind === "template" && id) return `Template ${id.slice(0, 12)}`
  return kind
}

const DEFAULT_AI_TAB: LeftPaneTab = {
  key: buildLeftPaneTabKey("ai", AI_WORKSPACE_TAB_ID),
  kind: "ai",
  id: AI_WORKSPACE_TAB_ID,
  title: "AI",
}

export const useLeftPaneTabsStore = create<LeftPaneTabsState>()(
  persist(
    (set, get) => ({
      tabs: [DEFAULT_AI_TAB],
      activeKey: DEFAULT_AI_TAB.key,

      upsertTab: ({ kind, id, title, activate = true }) => {
        const normalizedId = String(id || LIST_WORKSPACE_TAB_ID).trim() || LIST_WORKSPACE_TAB_ID
        const key = buildLeftPaneTabKey(kind, normalizedId)
        const nextTitle = normalizeTitle(kind, title, normalizedId)
        let resultKey = key
        set((state) => {
          const existing = state.tabs.find((tab) => tab.key === key)
          if (
            existing &&
            (!title?.trim() || existing.title === nextTitle) &&
            (!activate || state.activeKey === key)
          ) {
            return state
          }
          let tabs = state.tabs
          if (existing) {
            tabs = state.tabs.map((tab) =>
              tab.key === key
                ? {
                    ...tab,
                    title: title?.trim() ? nextTitle : tab.title,
                  }
                : tab,
            )
          } else {
            tabs = [
              ...state.tabs,
              { key, kind, id: normalizedId, title: nextTitle },
            ]
            if (tabs.length > MAX_TABS) {
              // Prefer dropping non-list tabs first when over capacity.
              const droppable = tabs.filter((tab) => !isListWorkspaceViewType(tab.kind))
              if (droppable.length > 0 && tabs.length > MAX_TABS) {
                const dropKey = droppable[0]!.key
                tabs = tabs.filter((tab) => tab.key !== dropKey)
              } else {
                tabs = tabs.slice(tabs.length - MAX_TABS)
              }
            }
          }
          resultKey = key
          return {
            tabs,
            activeKey: activate ? key : state.activeKey,
          }
        })
        return resultKey
      },

      updateTitle: (key, title) => {
        const trimmed = title.trim()
        if (!trimmed) return
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.key === key ? { ...tab, title: trimmed } : tab)),
        }))
      },

      setActiveKey: (key) => set({ activeKey: key }),

      closeTab: (key) => {
        const { tabs, activeKey } = get()
        const index = tabs.findIndex((tab) => tab.key === key)
        if (index < 0) return activeKey
        const nextTabs = tabs.filter((tab) => tab.key !== key)
        let nextActive = activeKey
        if (activeKey === key) {
          const fallback = nextTabs[index] ?? nextTabs[index - 1] ?? nextTabs[0] ?? null
          nextActive = fallback?.key ?? null
        }
        // Keep at least an empty strip — caller may seed task-list again.
        set({ tabs: nextTabs, activeKey: nextActive })
        return nextActive
      },

      closeTabs: (keys) => {
        const keySet = new Set(keys.filter(Boolean))
        if (keySet.size === 0) return get().activeKey
        if (keySet.size === 1) return get().closeTab(Array.from(keySet)[0]!)
        const { tabs, activeKey } = get()
        const closingIndexes = tabs
          .map((tab, index) => (keySet.has(tab.key) ? index : -1))
          .filter((index) => index >= 0)
        if (closingIndexes.length === 0) return activeKey
        const rightmostClosed = Math.max(...closingIndexes)
        const nextTabs = tabs.filter((tab) => !keySet.has(tab.key))
        let nextActive = activeKey
        if (activeKey && keySet.has(activeKey)) {
          const after = tabs.slice(rightmostClosed + 1).find((tab) => !keySet.has(tab.key))
          const before = [...tabs.slice(0, rightmostClosed)]
            .reverse()
            .find((tab) => !keySet.has(tab.key))
          nextActive = after?.key ?? before?.key ?? nextTabs[0]?.key ?? null
        }
        set({ tabs: nextTabs, activeKey: nextActive })
        return nextActive
      },

      closeAll: () => set({ tabs: [], activeKey: null }),

      moveTabBefore: (key, beforeKey) => {
        set((state) => ({
          tabs: moveItemBeforeKey(state.tabs, key, beforeKey),
        }))
      },
    }),
    {
      name: "articulate-left-pane-tabs-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeKey: state.activeKey,
      }),
    },
  ),
)

export function toLeftPaneTabStripItems(tabs: LeftPaneTab[]) {
  return tabs.map((tab) => ({ key: tab.key, label: tab.title }))
}

/** Ensure a default AI tab exists (empty left pane after close-all). */
export function ensureLeftPaneHasDefaultListTab() {
  const state = useLeftPaneTabsStore.getState()
  if (state.tabs.length > 0) return
  state.upsertTab({
    kind: "ai",
    id: AI_WORKSPACE_TAB_ID,
    title: "AI",
    activate: true,
  })
}

export type { WorkspaceListViewType }
