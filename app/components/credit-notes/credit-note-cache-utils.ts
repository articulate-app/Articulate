import { storeRegistry, removeItemFromStore, updateItemInStore } from '../../../hooks/use-infinite-query'
import { QueryClient } from '@tanstack/react-query'

/**
 * Find the correct insertion position for a new item in a sorted array.
 */
function findSortedInsertPosition(
  sortedArray: any[], 
  newItem: any, 
  sortConfig: { field: string; direction: 'asc' | 'desc' }
): number {
  const { field, direction } = sortConfig;
  const isAscending = direction === 'asc';
  
  // Binary search for the insertion position
  let low = 0;
  let high = sortedArray.length;
  
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const comparison = compareCreditNoteValues(newItem[field], sortedArray[mid][field], isAscending);
    
    if (comparison < 0) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  
  return low;
}

/**
 * Compare two credit note values for sorting.
 */
function compareCreditNoteValues(a: any, b: any, isAscending: boolean): number {
  // Handle null/undefined values
  if (a == null && b == null) return 0;
  if (a == null) return isAscending ? -1 : 1;
  if (b == null) return isAscending ? 1 : -1;
  
  // Handle dates
  if (typeof a === 'string' && typeof b === 'string') {
    // Check if they look like dates (YYYY-MM-DD or ISO format)
    if (a.match(/^\d{4}-\d{2}-\d{2}/) && b.match(/^\d{4}-\d{2}-\d{2}/)) {
      const dateA = new Date(a).getTime();
      const dateB = new Date(b).getTime();
      return isAscending ? dateA - dateB : dateB - dateA;
    }
  }
  
  // Handle numbers
  if (typeof a === 'number' && typeof b === 'number') {
    return isAscending ? a - b : b - a;
  }
  
  // Handle strings (case-insensitive)
  const strA = String(a).toLowerCase();
  const strB = String(b).toLowerCase();
  
  if (strA < strB) return isAscending ? -1 : 1;
  if (strA > strB) return isAscending ? 1 : -1;
  return 0;
}

/**
 * Remove a credit note from all InfiniteList caches (all filters/pagination).
 * Ensures the credit note disappears instantly regardless of filters or pagination.
 */
export function removeCreditNoteFromAllStores(creditNoteId: number) {
  if (typeof window === 'undefined') return;
  
  // Remove from InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_credit_notes_summary::credit-notes-')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      const newData = state.data.filter((item: any) => item.credit_note_id !== creditNoteId);
      store.setState({ data: newData });
    }
  })
}

/**
 * Update a credit note in all InfiniteList caches (all filters/pagination).
 * Ensures the credit note is updated instantly regardless of filters or pagination.
 */
export function updateCreditNoteInAllStores(updatedCreditNote: any) {
  if (typeof window === 'undefined') return;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[updateCreditNoteInAllStores] Starting update for credit note:', updatedCreditNote.credit_note_id);
    console.log('[updateCreditNoteInAllStores] Available stores:', Object.keys(storeRegistry));
  }
  
  Object.keys(storeRegistry).forEach(key => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[updateCreditNoteInAllStores] Checking store key:', key);
    }
    
    if (key.startsWith('v_credit_notes_summary::credit-notes-')) {
      const store = storeRegistry[key];
      if (!store) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[updateCreditNoteInAllStores] Store not found for key:', key);
        }
        return;
      }
      const state = store.getState();
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateCreditNoteInAllStores] Store state data length:', state.data?.length);
      }
      
      const idx = state.data.findIndex((item: any) => String(item.credit_note_id) === String(updatedCreditNote.credit_note_id));
      if (idx === -1) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[updateCreditNoteInAllStores] Credit note not found in store:', key);
        }
        return;
      }
      
      const oldCreditNote = state.data[idx];
      // Patch the credit note with updated data
      const patchedCreditNote = {
        ...oldCreditNote,
        ...updatedCreditNote,
      };
      const newData = [...state.data];
      newData[idx] = patchedCreditNote;
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateCreditNoteInAllStores] Successfully patched credit note in store', { key, patchedCreditNote });
      }
    }
  })
}

/**
 * Update credit note in all relevant caches for optimistic updates
 */
export function updateCreditNoteInCaches(queryClient: QueryClient, updatedCreditNote: any) {
  // Update InfiniteList stores first
  updateCreditNoteInAllStores(updatedCreditNote);
  
  if (queryClient && updatedCreditNote && updatedCreditNote.credit_note_id) {
    // Update the detail cache
    queryClient.setQueryData(['creditNote', updatedCreditNote.credit_note_id], (old: any) => {
      if (!old) return updatedCreditNote;
      return {
        ...old,
        ...updatedCreditNote,
      };
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[updateCreditNoteInCaches] Patched detail cache for credit note', updatedCreditNote.credit_note_id);
    }
  }
}

/**
 * Add a new credit note to all InfiniteList caches (all filters/pagination).
 * Ensures the credit note appears instantly regardless of filters or pagination.
 */
export function addCreditNoteToAllStores(newCreditNote: any, sortConfig?: { field: string; direction: 'asc' | 'desc' }) {
  if (typeof window === 'undefined') return;
  
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_credit_notes_summary::credit-notes-')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      
      // Check if credit note already exists to avoid duplicates
      if (state.data.find((item: any) => item.credit_note_id === newCreditNote.credit_note_id)) return;
      
      let newData: any[];
      
      if (sortConfig) {
        // Find the correct position based on sort order
        const insertIndex = findSortedInsertPosition(state.data, newCreditNote, sortConfig);
        newData = [...state.data];
        newData.splice(insertIndex, 0, newCreditNote);
      } else {
        // Fallback to adding at the beginning
        newData = [newCreditNote, ...state.data];
      }
      
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[addCreditNoteToAllStores] Added credit note to store with sort', { 
          key, 
          creditNoteId: newCreditNote.credit_note_id, 
          sortConfig,
          insertIndex: sortConfig ? findSortedInsertPosition(state.data, newCreditNote, sortConfig) : 0
        });
      }
    }
  })
}

/**
 * Add a new credit note to all relevant caches for optimistic updates
 */
export function addCreditNoteToCaches(
  queryClient: QueryClient, 
  newCreditNote: any, 
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
) {
  // Add to InfiniteList stores first (this is the key!)
  addCreditNoteToAllStores(newCreditNote, sortConfig);
  
  if (queryClient && newCreditNote && newCreditNote.credit_note_id) {
    // Also add to detail cache
    queryClient.setQueryData(['creditNote', newCreditNote.credit_note_id], newCreditNote);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[addCreditNoteToCaches] Added credit note to all caches', newCreditNote.credit_note_id, 'with sort config:', sortConfig);
    }
  }
}

/**
 * Remove credit note from all caches
 */
export function removeCreditNoteFromCaches(queryClient: QueryClient, creditNoteId: number) {
  // Remove from InfiniteList stores first (this is the key!)
  removeCreditNoteFromAllStores(creditNoteId);
  
  if (queryClient) {
    // Remove from detail cache
    queryClient.removeQueries({ queryKey: ['creditNote', creditNoteId] });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[removeCreditNoteFromCaches] Removed credit note from all caches', creditNoteId);
    }
  }
} 