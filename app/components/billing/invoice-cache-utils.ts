import { storeRegistry, removeItemFromStore, updateItemInStore, addItemToStore } from '../../../hooks/use-infinite-query'
import { QueryClient } from '@tanstack/react-query'

/**
 * Remove an invoice from all InfiniteList caches (all filters/pagination).
 * Ensures the invoice disappears instantly regardless of filters or pagination.
 */
export function removeInvoiceFromAllStores(invoiceId: number) {
  if (typeof window === 'undefined') return;
  
  // Remove from InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_issued_invoices_list')) {
      removeItemFromStore('v_issued_invoices_list', key.includes('::') ? key.split('::')[1] : undefined, invoiceId)
    }
  })
}

/**
 * Update an invoice in all InfiniteList caches (all filters/pagination).
 * Ensures the invoice is updated instantly regardless of filters or pagination.
 * Handles resorting if the updated values affect sort order.
 */
export function updateInvoiceInAllStores(updatedInvoice: any, sortConfig?: { field: string; direction: 'asc' | 'desc' }) {
  if (typeof window === 'undefined') return;
  
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_issued_invoices_list')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      const idx = state.data.findIndex((item: any) => String(item.id) === String(updatedInvoice.id));
      if (idx === -1) return;
      const oldInvoice = state.data[idx];
      
      // Patch the invoice with new data
      const patchedInvoice = {
        ...oldInvoice,
        ...updatedInvoice,
      };
      
      let newData = [...state.data];
      
      if (sortConfig) {
        // Check if the sort field changed and requires repositioning
        const sortField = sortConfig.field;
        const oldValue = oldInvoice[sortField];
        const newValue = patchedInvoice[sortField];
        
        if (oldValue !== newValue) {
          // Remove from current position
          newData.splice(idx, 1);
          
          // Find new position
          const insertIndex = findSortedInsertPosition(newData, patchedInvoice, sortConfig);
          newData.splice(insertIndex, 0, patchedInvoice);
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[updateInvoiceInAllStores] Resorting invoice due to field change', { 
              key, 
              invoiceId: patchedInvoice.id,
              sortField,
              oldValue,
              newValue,
              oldIndex: idx,
              newIndex: insertIndex
            });
          }
        } else {
          // Just update in place
          newData[idx] = patchedInvoice;
        }
      } else {
        // Just update in place
        newData[idx] = patchedInvoice;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateInvoiceInAllStores] Patching invoice in store', { key, patchedInvoice });
      }
      
      store.setState({ data: newData });
    }
  })
}

/**
 * Add a new invoice to all InfiniteList caches respecting sort order.
 * Ensures the invoice appears instantly in the correct sorted position.
 */
export function addInvoiceToAllStores(newInvoice: any, sortConfig?: { field: string; direction: 'asc' | 'desc' }) {
  if (typeof window === 'undefined') return;
  
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_issued_invoices_list')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      
      // Check if invoice already exists to avoid duplicates
      if (state.data.find((item: any) => item.id === newInvoice.id)) return;
      
      let newData: any[];
      
      if (sortConfig) {
        // Find the correct position based on sort order
        const insertIndex = findSortedInsertPosition(state.data, newInvoice, sortConfig);
        newData = [...state.data];
        newData.splice(insertIndex, 0, newInvoice);
      } else {
        // Fallback to adding at the beginning
        newData = [newInvoice, ...state.data];
      }
      
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[addInvoiceToAllStores] Added invoice to store with sort', { 
          key, 
          invoiceId: newInvoice.id, 
          sortConfig,
          insertIndex: sortConfig ? findSortedInsertPosition(state.data, newInvoice, sortConfig) : 0
        });
      }
    }
  })
}

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
    const comparison = compareInvoiceValues(newItem[field], sortedArray[mid][field], isAscending);
    
    if (comparison < 0) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  
  return low;
}

/**
 * Compare two invoice values for sorting.
 */
function compareInvoiceValues(a: any, b: any, isAscending: boolean): number {
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
 * Update an invoice in all InfiniteList caches and the React Query detail cache.
 * Ensures both the list and the details pane are updated optimistically.
 * Pass the queryClient from useQueryClient.
 */
export function updateInvoiceInCaches(
  queryClient: QueryClient, 
  updatedInvoice: any, 
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
) {
  // Update InfiniteList stores first
  updateInvoiceInAllStores(updatedInvoice, sortConfig);
  
  if (queryClient && updatedInvoice && updatedInvoice.id) {
    // Update the detail cache (['issued-invoice', String(invoiceId)])
    queryClient.setQueryData(['issued-invoice', String(updatedInvoice.id)], (old: any) => {
      if (!old) return updatedInvoice;
      return {
        ...old,
        ...updatedInvoice,
      };
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[updateInvoiceInCaches] Patched detail cache for invoice', updatedInvoice.id, 'with sort config:', sortConfig);
    }
  }
}

/**
 * Add a new invoice to all caches using the TaskList pattern.
 * This is the optimistic update function that should work immediately.
 */
export function addInvoiceToAllCaches(
  queryClient: QueryClient, 
  newInvoice: any, 
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
) {
  // Add to InfiniteList stores first (this is the key!)
  addInvoiceToAllStores(newInvoice, sortConfig);
  
  if (queryClient && newInvoice && newInvoice.id) {
    // Also add to detail cache
    queryClient.setQueryData(['issued-invoice', String(newInvoice.id)], newInvoice);
    
    // Invalidate queries as a safety net (but InfiniteList should already be updated)
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && 
        (query.queryKey[0] === 'v_issued_invoices_list' || 
         (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('invoices-')))
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[addInvoiceToAllCaches] Added invoice to all caches', newInvoice.id, 'with sort config:', sortConfig);
    }
  }
}

/**
 * Remove an invoice from all caches using the TaskList pattern.
 * This ensures immediate removal from all views.
 */
export function removeInvoiceFromAllCaches(queryClient: QueryClient, invoiceId: number) {
  // Remove from InfiniteList stores first (this is the key!)
  removeInvoiceFromAllStores(invoiceId);
  
  if (queryClient) {
    // Remove from detail cache
    queryClient.removeQueries({ queryKey: ['issued-invoice', String(invoiceId)] });
    
    // Invalidate queries as a safety net
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && 
        (query.queryKey[0] === 'v_issued_invoices_list' || 
         (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('invoices-')))
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[removeInvoiceFromAllCaches] Removed invoice from all caches', invoiceId);
    }
  }
}