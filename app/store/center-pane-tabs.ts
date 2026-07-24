import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

/** Middle-pane entities only — AI threads always open in the right pane. */
export type CenterPaneTabKind =
  | "task"
  | "suggestion"
  | "project"
  | "user"
  | "team"
  | "thread"
  | "keyword-research"

export const KEYWORD_RESEARCH_TAB_ID = "default"

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
  closeAll: () => void
}

const MAX_TABS = 16

function normalizeTitle(title: string | null | undefined, kind: CenterPaneTabKind, id: string): string {
  const trimmed = typeof title === "string" ? title.trim() : ""
  if (trimmed) return trimmed
  if (kind === "task") return `Task ${id}`
  if (kind === "suggestion") return `Suggestion ${id}`
  if (kind === "project") return `Project ${id}`
  if (kind === "user") return `User ${id}`
  if (kind === "team") return `Team ${id}`
  if (kind === "keyword-research") return "Keyword research"
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
      tab.kind !== "keyword-research" &&
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
      closeAll: () => set({ tabs: [] }),
    }),
    {
      name: "articulate.center-pane-tabs",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ tabs: state.tabs }),
    },
  ),
)
