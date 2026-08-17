import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { moveItemBeforeKey } from "../lib/pane-tab-order"

/**
 * Workspace views that may appear as middle-pane tabs.
 * AI / browser are pane-neutral — they can open here or in the right pane.
 */
export type CenterPaneTabKind =
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
  | "ai"
  | "browser"
  | "start"
  /** @deprecated Prefer "research". */
  | "keyword-research"
  /** @deprecated Prefer "research". */
  | "prompt-research"

export const RESEARCH_TAB_ID = "default"
export const CREATE_TAB_ID = "default"
/** @deprecated Prefer RESEARCH_TAB_ID. */
export const KEYWORD_RESEARCH_TAB_ID = RESEARCH_TAB_ID
/** @deprecated Prefer RESEARCH_TAB_ID. */
export const PROMPT_RESEARCH_TAB_ID = RESEARCH_TAB_ID

export type CenterPaneTab = {
  key: string
  kind: CenterPaneTabKind
  id: string
  title: string
}

export function buildCenterPaneTabKey(kind: CenterPaneTabKind, id: string): string {
  return `${kind}:${id}`
}

type CenterPaneTabsState = {
  tabs: CenterPaneTab[]
  upsertTab: (tab: { kind: CenterPaneTabKind; id: string; title?: string | null }) => void
  updateTitle: (key: string, title: string) => void
  /** Removes the tab. Returns the next tab to activate when the closed tab was present. */
  closeTab: (key: string) => CenterPaneTab | null
  /**
   * Removes many tabs at once (Chrome-style multi-close).
   * Returns the next tab to activate when any closed tab was present — prefers the
   * first remaining tab after the rightmost closed index, else the one before.
   */
  closeTabs: (keys: string[]) => CenterPaneTab | null
  closeAll: () => void
  /** Place `key` immediately before `beforeKey` (or at end when beforeKey is null). */
  moveTabBefore: (key: string, beforeKey: string | null) => void
}

const MAX_TABS = 16

function normalizeTitle(title: string | null | undefined, kind: CenterPaneTabKind, id: string): string {
  const trimmed = typeof title === "string" ? title.trim() : ""
  if (trimmed) return trimmed
  if (kind === "task") return `Task ${id}`
  if (kind === "task-list") return "Tasks"
  if (kind === "project-list") return "Projects"
  if (kind === "mention-list") return "Inbox"
  if (kind === "user-list") return "Users"
  if (kind === "ai-thread-list") return "AI chats"
  if (kind === "artifact-list") return "Outputs"
  if (kind === "template-list") return "Templates"
  if (kind === "search-results") return "Search"
  if (kind === "suggestion") return `Suggestion ${id}`
  if (kind === "project") return `Project ${id}`
  if (kind === "user") return `User ${id}`
  if (kind === "team") return `Team ${id}`
  if (kind === "artifact") return `Artifact ${id.slice(0, 8)}`
  if (kind === "source") return `Source ${id.slice(0, 8)}`
  if (kind === "template") return `Template ${id.slice(0, 12)}`
  if (kind === "research") return "Research"
  if (kind === "create") return "Create"
  if (kind === "start") return "New"
  if (kind === "ai") return "AI"
  if (kind === "browser") return id ? `Browser ${id.slice(0, 6)}` : "Browser"
  if (kind === "keyword-research") return "Research"
  if (kind === "prompt-research") return "Research"
  return `Thread ${id}`
}

function isPlaceholderTitle(title: string, kind: CenterPaneTabKind, id: string): boolean {
  const expected = normalizeTitle(null, kind, id)
  return title === expected
}

/** True when the tab label is still a generated fallback (e.g. `User 40`). */
export function isCenterPaneTabPlaceholderTitle(
  title: string,
  kind: CenterPaneTabKind,
  id: string,
): boolean {
  return isPlaceholderTitle(title, kind, id)
}

export function getCenterPaneTabPlaceholderTitle(kind: CenterPaneTabKind, id: string): string {
  return normalizeTitle(null, kind, id)
}

/** Tabs whose labels still need a friendly name lookup. */
export function listCenterPaneTabsNeedingTitleResolution(tabs: CenterPaneTab[]): CenterPaneTab[] {
  return tabs.filter(
    (tab) =>
      tab.kind !== "research" &&
      tab.kind !== "create" &&
      tab.kind !== "start" &&
      tab.kind !== "ai" &&
      tab.kind !== "browser" &&
      tab.kind !== "task-list" &&
      tab.kind !== "keyword-research" &&
      tab.kind !== "prompt-research" &&
      tab.kind !== "thread" &&
      isPlaceholderTitle(tab.title, tab.kind, tab.id),
  )
}

export const useCenterPaneTabsStore = create<CenterPaneTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      upsertTab: ({ kind, id, title }) => {
        const normalizedId = String(id).trim()
        if (!normalizedId) return
        const key = buildCenterPaneTabKey(kind, normalizedId)
        const nextTitle = normalizeTitle(title, kind, normalizedId)
        set((state) => {
          const existing = state.tabs.find((tab) => tab.key === key)
          if (existing) {
            if (!title?.trim() || nextTitle === existing.title) return state
            // Never replace a real label with a generated placeholder.
            if (
              isPlaceholderTitle(nextTitle, kind, normalizedId) &&
              !isPlaceholderTitle(existing.title, kind, normalizedId)
            ) {
              return state
            }
            return {
              tabs: state.tabs.map((tab) =>
                tab.key === key ? { ...tab, title: nextTitle } : tab,
              ),
            }
          }
          const nextTabs = [
            ...state.tabs,
            { key, kind, id: normalizedId, title: nextTitle },
          ]
          return {
            tabs: nextTabs.length > MAX_TABS ? nextTabs.slice(nextTabs.length - MAX_TABS) : nextTabs,
          }
        })
      },
      updateTitle: (key, title) => {
        const trimmed = title.trim()
        if (!trimmed) return
        set((state) => {
          const existing = state.tabs.find((tab) => tab.key === key)
          if (!existing || existing.title === trimmed) return state
          return {
            tabs: state.tabs.map((tab) => (tab.key === key ? { ...tab, title: trimmed } : tab)),
          }
        })
      },
      closeTab: (key) => {
        const { tabs } = get()
        const index = tabs.findIndex((tab) => tab.key === key)
        if (index < 0) return null
        const nextTabs = tabs.filter((tab) => tab.key !== key)
        set({ tabs: nextTabs })
        if (nextTabs.length === 0) return null
        return nextTabs[Math.min(index, nextTabs.length - 1)] ?? nextTabs[nextTabs.length - 1] ?? null
      },
      closeTabs: (keys) => {
        const keySet = new Set(keys.filter(Boolean))
        if (keySet.size === 0) return null
        if (keySet.size === 1) return get().closeTab(Array.from(keySet)[0]!)
        const { tabs } = get()
        const closingIndexes = tabs
          .map((tab, index) => (keySet.has(tab.key) ? index : -1))
          .filter((index) => index >= 0)
        if (closingIndexes.length === 0) return null
        const rightmostClosed = Math.max(...closingIndexes)
        const nextTabs = tabs.filter((tab) => !keySet.has(tab.key))
        set({ tabs: nextTabs })
        if (nextTabs.length === 0) return null
        // Prefer the first surviving tab at/after the rightmost closed position.
        const after = tabs.slice(rightmostClosed + 1).find((tab) => !keySet.has(tab.key))
        if (after) return nextTabs.find((tab) => tab.key === after.key) ?? null
        const before = [...tabs.slice(0, rightmostClosed)]
          .reverse()
          .find((tab) => !keySet.has(tab.key))
        return before ? nextTabs.find((tab) => tab.key === before.key) ?? null : nextTabs[0] ?? null
      },
      closeAll: () => set({ tabs: [] }),
      moveTabBefore: (key, beforeKey) => {
        set((state) => {
          const next = moveItemBeforeKey(state.tabs, key, beforeKey)
          if (next === state.tabs) return state
          return { tabs: next }
        })
      },
    }),
    {
      name: "articulate.center-pane-tabs",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ tabs: state.tabs }),
    },
  ),
)
