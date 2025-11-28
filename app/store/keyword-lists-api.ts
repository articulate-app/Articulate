import { create } from 'zustand';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { KeywordList, Keyword, KeywordSearchHistory } from '../../lib/types/keyword';

interface KeywordListsApiState {
  lists: KeywordList[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchLists: () => Promise<void>;
  createList: (name: string, notes?: string) => Promise<KeywordList | null>;
  deleteList: (id: number) => Promise<boolean>;
  updateList: (id: number, name: string, notes?: string) => Promise<boolean>;
  
  // Keywords
  keywords: Record<number, Keyword[]>;
  keywordsLoading: Record<number, boolean>;
  keywordsError: Record<number, string | null>;
  
  fetchKeywords: (listId: number) => Promise<void>;
  addKeyword: (listId: number, keyword: string, avgMonthlySearches: number, competitionIndex: number) => Promise<Keyword | null>;
  removeKeyword: (listId: number, keywordId: number) => Promise<boolean>;
  
  // Search History
  searchHistory: KeywordSearchHistory[];
  historyLoading: boolean;
  historyError: string | null;
  
  fetchSearchHistory: () => Promise<void>;
  logSearch: (term: string, region?: string, language?: string) => Promise<void>;
}

// Helper function to get auth headers
async function getAuthHeaders() {
  const supabase = createClientComponentClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  return {
    'Content-Type': 'application/json',
    'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    'Authorization': session?.access_token 
      ? `Bearer ${session.access_token}`
      : `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  };
}

export const useKeywordListsApi = create<KeywordListsApiState>((set, get) => ({
  lists: [],
  isLoading: false,
  error: null,
  
  keywords: {},
  keywordsLoading: {},
  keywordsError: {},
  
  searchHistory: [],
  historyLoading: false,
  historyError: null,

  fetchLists: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('https://hlszgarnpleikfkwujph.supabase.co/rest/v1/keyword_lists?select=*&order=created_at.desc', {
        headers,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch lists');
      }
      
      const data = await response.json();
      set({ lists: data, isLoading: false });
    } catch (error) {
      console.error('Error fetching keyword lists:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch lists',
        isLoading: false 
      });
    }
  },

  createList: async (name: string, notes?: string) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('https://hlszgarnpleikfkwujph.supabase.co/rest/v1/keyword_lists', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, notes }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to create list');
      }
      
      // Handle empty response (Supabase sometimes returns empty response on successful insert)
      let newList;
      try {
        newList = await response.json();
      } catch (jsonError) {
        // If response is empty, we need to wait and fetch the actual list
        newList = null;
      }
      
      // If we got a real response with an ID, update local state and return
      if (newList && newList.id && typeof newList.id === 'number') {
        set(state => ({
          lists: [newList, ...state.lists],
        }));
        return newList;
      } else {
        // If we got an empty response, wait and fetch the actual list
        // This ensures the list is fully committed to the database
        await new Promise(resolve => setTimeout(resolve, 1000));
        await get().fetchLists();
        
        // Find the newly created list by name and recent timestamp
        const currentState = get();
        const createdList = currentState.lists.find(list => 
          list.name === name && 
          Math.abs(new Date(list.created_at).getTime() - Date.now()) < 10000 // Within 10 seconds
        );
        
        if (createdList) {
          return createdList;
        } else {
          // If still not found, try one more time with longer delay
          await new Promise(resolve => setTimeout(resolve, 2000));
          await get().fetchLists();
          
          const finalState = get();
          const finalList = finalState.lists.find(list => 
            list.name === name && 
            Math.abs(new Date(list.created_at).getTime() - Date.now()) < 15000 // Within 15 seconds
          );
          
          if (finalList) {
            return finalList;
          } else {
            throw new Error('List was created but could not be retrieved from database');
          }
        }
      }
    } catch (error) {
      console.error('Error creating keyword list:', error);
      throw error;
    }
  },

  deleteList: async (id: number) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`https://hlszgarnpleikfkwujph.supabase.co/rest/v1/keyword_lists?id=eq.${id}`, {
        method: 'DELETE',
        headers,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to delete list');
      }
      
      // Update local state
      set(state => {
        const newKeywords = { ...state.keywords };
        delete newKeywords[id];
        return {
          lists: state.lists.filter(list => list.id !== id),
          keywords: newKeywords,
        };
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting keyword list:', error);
      throw error;
    }
  },

  updateList: async (id: number, name: string, notes?: string) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`https://hlszgarnpleikfkwujph.supabase.co/rest/v1/keyword_lists?id=eq.${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name, notes }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to update list');
      }
      
      // Update local state
      set(state => ({
        lists: state.lists.map(list => 
          list.id === id ? { ...list, name, notes, updated_at: new Date().toISOString() } : list
        ),
      }));
      
      return true;
    } catch (error) {
      console.error('Error updating keyword list:', error);
      throw error;
    }
  },

  fetchKeywords: async (listId: number) => {
    set(state => ({
      keywordsLoading: { ...state.keywordsLoading, [listId]: true },
      keywordsError: { ...state.keywordsError, [listId]: null },
    }));
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`https://hlszgarnpleikfkwujph.supabase.co/rest/v1/v_keywords_with_list?list_id=eq.${listId}&select=*&order=added_at.desc`, {
        headers,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch keywords');
      }
      
      const data = await response.json();
      
      set(state => ({
        keywords: { ...state.keywords, [listId]: data },
        keywordsLoading: { ...state.keywordsLoading, [listId]: false },
      }));
    } catch (error) {
      console.error('Error fetching keywords:', error);
      set(state => ({
        keywordsError: { 
          ...state.keywordsError, 
          [listId]: error instanceof Error ? error.message : 'Failed to fetch keywords' 
        },
        keywordsLoading: { ...state.keywordsLoading, [listId]: false },
      }));
    }
  },

  addKeyword: async (listId: number, keyword: string, avgMonthlySearches: number, competitionIndex: number) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('https://hlszgarnpleikfkwujph.supabase.co/rest/v1/keywords', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          list_id: listId,
          name: keyword,
          volume: avgMonthlySearches,
          competition_index: competitionIndex,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to add keyword');
      }
      
      let newKeyword;
      try {
        newKeyword = await response.json();
      } catch (jsonError) {
        // If response is empty, create a mock keyword object
        newKeyword = {
          id: Date.now(),
          list_id: listId,
          name: keyword,
          volume: avgMonthlySearches,
          competition_index: competitionIndex,
          added_at: new Date().toISOString(),
        };
      }
      
      // Update local state
      set(state => ({
        keywords: {
          ...state.keywords,
          [listId]: [newKeyword, ...(state.keywords[listId] || [])],
        },
      }));
      
      return newKeyword;
    } catch (error) {
      console.error('Error adding keyword:', error);
      throw error;
    }
  },

  removeKeyword: async (listId: number, keywordId: number) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`https://hlszgarnpleikfkwujph.supabase.co/rest/v1/keywords?id=eq.${keywordId}`, {
        method: 'DELETE',
        headers,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to remove keyword');
      }
      
      // Update local state
      set(state => ({
        keywords: {
          ...state.keywords,
          [listId]: (state.keywords[listId] || []).filter(k => k.id !== keywordId),
        },
      }));
      
      return true;
    } catch (error) {
      console.error('Error removing keyword:', error);
      throw error;
    }
  },

  fetchSearchHistory: async () => {
    set({ historyLoading: true, historyError: null });
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('https://hlszgarnpleikfkwujph.supabase.co/rest/v1/keyword_search_history?select=*&order=searched_at.desc&limit=50', {
        headers,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch search history');
      }
      
      const data = await response.json();
      set({ searchHistory: data, historyLoading: false });
    } catch (error) {
      console.error('Error fetching search history:', error);
      set({ 
        historyError: error instanceof Error ? error.message : 'Failed to fetch search history',
        historyLoading: false 
      });
    }
  },

  logSearch: async (term: string, region?: string, language?: string) => {
    try {
      const headers = await getAuthHeaders();
      const supabase = createClientComponentClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error('No authenticated user found');
        return;
      }

      // Get the current user from the database
      const { data: dbUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (!dbUser) {
        console.error('User not found in database');
        return;
      }

      await fetch('https://hlszgarnpleikfkwujph.supabase.co/rest/v1/keyword_search_history', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          term, 
          region_id: region || null, 
          language_id: language || null,
          searched_by: dbUser.id
        }),
      });
      
      // Refresh search history
      get().fetchSearchHistory();
    } catch (error) {
      console.error('Error logging search:', error);
      // Don't throw - this shouldn't break the main flow
    }
  },
})); 