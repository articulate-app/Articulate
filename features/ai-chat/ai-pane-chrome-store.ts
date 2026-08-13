"use client"

import { create } from "zustand"
import type { AiThread, AiVisibility } from "./types"

export type AiChromeTab = {
  id: string
  title: string
  isOptimistic?: boolean
}

export type AiPaneChromeHandlers = {
  selectThread: (threadId: string) => void
  closeThread: (threadId: string) => void
  newChat: () => void
  startEdit: (threadId: string) => void
  rename: (threadId: string) => void
  setEditTitle: (title: string) => void
  titleKeyDown: (event: React.KeyboardEvent) => void
  selectFromHistory: (thread: AiThread) => void
  renameActive: () => void
  deleteActive: () => void
  setVisibility: (visibility: AiVisibility) => void
  closeAllAiTabs: () => void
  copyLink: () => void
  expand?: () => void
}

type AiPaneChromeState = {
  tabs: AiChromeTab[]
  activeThreadId: string | null
  editingTabId: string | null
  editTitle: string
  activeVisibility: AiVisibility | null
  activeProjectId: number | null
  isExpanded: boolean
  isCreating: boolean
  handlers: AiPaneChromeHandlers | null
  sync: (patch: {
    tabs?: AiChromeTab[]
    activeThreadId?: string | null
    editingTabId?: string | null
    editTitle?: string
    activeVisibility?: AiVisibility | null
    activeProjectId?: number | null
    isExpanded?: boolean
    isCreating?: boolean
  }) => void
  setHandlers: (handlers: AiPaneChromeHandlers | null) => void
}

export function buildAiRightTabKey(threadId: string): string {
  return `ai:${threadId}`
}

export function parseAiRightTabKey(key: string | null | undefined): string | null {
  if (!key?.startsWith("ai:")) return null
  const id = key.slice(3).trim()
  return id || null
}

export const useAiPaneChromeStore = create<AiPaneChromeState>((set) => ({
  tabs: [],
  activeThreadId: null,
  editingTabId: null,
  editTitle: "",
  activeVisibility: null,
  activeProjectId: null,
  isExpanded: false,
  isCreating: false,
  handlers: null,
  sync: (patch) =>
    set((state) => {
      const next = { ...state, ...patch }
      if (
        next.tabs === state.tabs &&
        next.activeThreadId === state.activeThreadId &&
        next.editingTabId === state.editingTabId &&
        next.editTitle === state.editTitle &&
        next.activeVisibility === state.activeVisibility &&
        next.activeProjectId === state.activeProjectId &&
        next.isExpanded === state.isExpanded &&
        next.isCreating === state.isCreating
      ) {
        return state
      }
      // Bail when tab list content is unchanged (avoids churn from freshly mapped arrays).
      if (
        Array.isArray(patch.tabs) &&
        patch.tabs.length === state.tabs.length &&
        patch.tabs.every(
          (tab, index) =>
            tab.id === state.tabs[index]?.id &&
            tab.title === state.tabs[index]?.title &&
            Boolean(tab.isOptimistic) === Boolean(state.tabs[index]?.isOptimistic),
        ) &&
        (patch.activeThreadId === undefined || patch.activeThreadId === state.activeThreadId) &&
        (patch.editingTabId === undefined || patch.editingTabId === state.editingTabId) &&
        (patch.editTitle === undefined || patch.editTitle === state.editTitle) &&
        (patch.activeVisibility === undefined || patch.activeVisibility === state.activeVisibility) &&
        (patch.activeProjectId === undefined || patch.activeProjectId === state.activeProjectId) &&
        (patch.isExpanded === undefined || patch.isExpanded === state.isExpanded) &&
        (patch.isCreating === undefined || patch.isCreating === state.isCreating)
      ) {
        return state
      }
      return next
    }),
  setHandlers: (handlers) =>
    set((state) => (state.handlers === handlers ? state : { handlers })),
}))
