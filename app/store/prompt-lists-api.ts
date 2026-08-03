import { create } from "zustand"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { PromptList, PromptListItem } from "../../lib/types/prompt-list"

const REST_BASE = "https://hlszgarnpleikfkwujph.supabase.co/rest/v1"

interface PromptListsApiState {
  lists: PromptList[]
  isLoading: boolean
  error: string | null

  fetchLists: () => Promise<void>
  createList: (name: string, notes?: string) => Promise<PromptList | null>
  deleteList: (id: number) => Promise<boolean>
  updateList: (id: number, name: string, notes?: string) => Promise<boolean>

  items: Record<number, PromptListItem[]>
  itemsLoading: Record<number, boolean>
  itemsError: Record<number, string | null>

  fetchItems: (listId: number) => Promise<void>
  addPrompt: (
    listId: number,
    prompt: string,
    languageCode?: string | null,
    regionId?: string | null,
  ) => Promise<PromptListItem | null>
  removePrompt: (listId: number, itemId: number) => Promise<boolean>
}

async function getAuthHeaders() {
  const supabase = createClientComponentClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return {
    "Content-Type": "application/json",
    Prefer: "return=representation",
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    Authorization: session?.access_token
      ? `Bearer ${session.access_token}`
      : `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  }
}

export const usePromptListsApi = create<PromptListsApiState>((set, get) => ({
  lists: [],
  isLoading: false,
  error: null,

  items: {},
  itemsLoading: {},
  itemsError: {},

  fetchLists: async () => {
    set({ isLoading: true, error: null })
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(
        `${REST_BASE}/prompt_lists?select=*&order=created_at.desc`,
        { headers },
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || "Failed to fetch prompt lists")
      }
      const data = await response.json()
      set({ lists: data, isLoading: false })
    } catch (error) {
      console.error("Error fetching prompt lists:", error)
      set({
        error: error instanceof Error ? error.message : "Failed to fetch prompt lists",
        isLoading: false,
      })
    }
  },

  createList: async (name: string, notes?: string) => {
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`${REST_BASE}/prompt_lists`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name, notes }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || "Failed to create prompt list")
      }
      const rows = await response.json()
      const newList = Array.isArray(rows) ? rows[0] : rows
      if (newList?.id) {
        set((state) => ({ lists: [newList, ...state.lists] }))
        return newList
      }
      await get().fetchLists()
      const created = get().lists.find((list) => list.name === name)
      return created ?? null
    } catch (error) {
      console.error("Error creating prompt list:", error)
      throw error
    }
  },

  deleteList: async (id: number) => {
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`${REST_BASE}/prompt_lists?id=eq.${id}`, {
        method: "DELETE",
        headers,
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || "Failed to delete prompt list")
      }
      set((state) => {
        const nextItems = { ...state.items }
        delete nextItems[id]
        return {
          lists: state.lists.filter((list) => list.id !== id),
          items: nextItems,
        }
      })
      return true
    } catch (error) {
      console.error("Error deleting prompt list:", error)
      throw error
    }
  },

  updateList: async (id: number, name: string, notes?: string) => {
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`${REST_BASE}/prompt_lists?id=eq.${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name, notes }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || "Failed to update prompt list")
      }
      set((state) => ({
        lists: state.lists.map((list) =>
          list.id === id
            ? { ...list, name, notes, updated_at: new Date().toISOString() }
            : list,
        ),
      }))
      return true
    } catch (error) {
      console.error("Error updating prompt list:", error)
      throw error
    }
  },

  fetchItems: async (listId: number) => {
    set((state) => ({
      itemsLoading: { ...state.itemsLoading, [listId]: true },
      itemsError: { ...state.itemsError, [listId]: null },
    }))
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(
        `${REST_BASE}/prompt_list_items?list_id=eq.${listId}&select=*&order=added_at.desc`,
        { headers },
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || "Failed to fetch prompts")
      }
      const data = await response.json()
      set((state) => ({
        items: { ...state.items, [listId]: data },
        itemsLoading: { ...state.itemsLoading, [listId]: false },
      }))
    } catch (error) {
      console.error("Error fetching prompt list items:", error)
      set((state) => ({
        itemsError: {
          ...state.itemsError,
          [listId]: error instanceof Error ? error.message : "Failed to fetch prompts",
        },
        itemsLoading: { ...state.itemsLoading, [listId]: false },
      }))
    }
  },

  addPrompt: async (
    listId: number,
    prompt: string,
    languageCode?: string | null,
    regionId?: string | null,
  ) => {
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`${REST_BASE}/prompt_list_items`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          list_id: listId,
          prompt: prompt.trim(),
          language_code: languageCode || null,
          region_id: regionId || null,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || "Failed to add prompt")
      }
      const rows = await response.json()
      const newItem = Array.isArray(rows) ? rows[0] : rows
      if (newItem?.id) {
        set((state) => ({
          items: {
            ...state.items,
            [listId]: [newItem, ...(state.items[listId] || [])],
          },
        }))
      }
      return newItem ?? null
    } catch (error) {
      console.error("Error adding prompt to list:", error)
      throw error
    }
  },

  removePrompt: async (listId: number, itemId: number) => {
    try {
      const headers = await getAuthHeaders()
      const response = await fetch(`${REST_BASE}/prompt_list_items?id=eq.${itemId}`, {
        method: "DELETE",
        headers,
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || "Failed to remove prompt")
      }
      set((state) => ({
        items: {
          ...state.items,
          [listId]: (state.items[listId] || []).filter((item) => item.id !== itemId),
        },
      }))
      return true
    } catch (error) {
      console.error("Error removing prompt from list:", error)
      throw error
    }
  },
}))
