import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface KeywordList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  keywords: SavedKeyword[];
}

export interface SavedKeyword {
  id: string;
  keyword: string;
  avgMonthlySearches: number;
  competitionIndex: number;
  savedAt: string;
  listId: string;
}

interface KeywordListsState {
  lists: KeywordList[];
  addList: (name: string) => string;
  updateList: (id: string, name: string) => void;
  deleteList: (id: string) => void;
  addKeywordToList: (listId: string, keyword: Omit<SavedKeyword, 'id' | 'savedAt' | 'listId'>) => void;
  removeKeywordFromList: (listId: string, keywordId: string) => void;
  getListById: (id: string) => KeywordList | undefined;
  getKeywordsByList: (listId: string) => SavedKeyword[];
}

export const useKeywordLists = create<KeywordListsState>()(
  persist(
    (set, get) => ({
      lists: [],

      addList: (name: string) => {
        const id = `list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        set((state) => ({
          lists: [
            ...state.lists,
            {
              id,
              name,
              createdAt: now,
              updatedAt: now,
              keywords: [],
            },
          ],
        }));

        return id;
      },

      updateList: (id: string, name: string) => {
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === id
              ? { ...list, name, updatedAt: new Date().toISOString() }
              : list
          ),
        }));
      },

      deleteList: (id: string) => {
        set((state) => ({
          lists: state.lists.filter((list) => list.id !== id),
        }));
      },

      addKeywordToList: (listId: string, keywordData) => {
        const keyword: SavedKeyword = {
          id: `keyword_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ...keywordData,
          savedAt: new Date().toISOString(),
          listId,
        };

        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  keywords: [...list.keywords, keyword],
                  updatedAt: new Date().toISOString(),
                }
              : list
          ),
        }));
      },

      removeKeywordFromList: (listId: string, keywordId: string) => {
        set((state) => ({
          lists: state.lists.map((list) =>
            list.id === listId
              ? {
                  ...list,
                  keywords: list.keywords.filter((k) => k.id !== keywordId),
                  updatedAt: new Date().toISOString(),
                }
              : list
          ),
        }));
      },

      getListById: (id: string) => {
        return get().lists.find((list) => list.id === id);
      },

      getKeywordsByList: (listId: string) => {
        const list = get().lists.find((l) => l.id === listId);
        return list?.keywords || [];
      },
    }),
    {
      name: 'keyword-lists-storage',
    }
  )
); 