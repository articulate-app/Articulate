import { storeRegistry, removeItemFromStore, updateItemInStore, addItemToStore } from '../../../hooks/use-infinite-query'
import { QueryClient } from '@tanstack/react-query'

/**
 * Remove a supplier payment from all InfiniteList caches (all filters/pagination).
 * Ensures the payment disappears instantly regardless of filters or pagination.
 */
export function removeSupplierPaymentFromAllStores(paymentId: number) {
  if (typeof window === 'undefined') return;
  
  // Remove from InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_supplier_payments_summary')) {
      removeItemFromStore('v_supplier_payments_summary', key.includes('::') ? key.split('::')[1] : undefined, paymentId)
    }
  })
}

/**
 * Update a supplier payment in all InfiniteList caches (all filters/pagination).
 * Ensures the payment is updated instantly regardless of filters or pagination.
 * Handles resorting if the updated values affect sort order.
 */
export function updateSupplierPaymentInAllStores(updatedPayment: any, sortConfig?: { field: string; direction: 'asc' | 'desc' }) {
  if (typeof window === 'undefined') return;
  
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_supplier_payments_summary')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      const idx = state.data.findIndex((item: any) => String(item.payment_id) === String(updatedPayment.payment_id));
      if (idx === -1) return;
      const oldPayment = state.data[idx];
      
      // Patch the payment with new data
      const patchedPayment = {
        ...oldPayment,
        ...updatedPayment,
      };
      
      let newData = [...state.data];
      
      if (sortConfig) {
        // Check if the sort field changed and requires repositioning
        const sortField = sortConfig.field;
        const oldValue = oldPayment[sortField];
        const newValue = patchedPayment[sortField];
        
        if (oldValue !== newValue) {
          // Remove from current position
          newData.splice(idx, 1);
          
          // Find new position
          const insertIndex = findSortedInsertPosition(newData, patchedPayment, sortConfig);
          newData.splice(insertIndex, 0, patchedPayment);
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[updateSupplierPaymentInAllStores] Resorting payment due to field change', { 
              key, 
              paymentId: patchedPayment.payment_id,
              sortField,
              oldValue,
              newValue,
              oldIndex: idx,
              newIndex: insertIndex
            });
          }
        } else {
          // Just update in place
          newData[idx] = patchedPayment;
        }
      } else {
        // Just update in place
        newData[idx] = patchedPayment;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateSupplierPaymentInAllStores] Patching payment in store', { key, patchedPayment });
      }
      
      store.setState({ data: newData });
    }
  })
}

/**
 * Add a new supplier payment to all InfiniteList caches respecting sort order.
 * Ensures the payment appears instantly in the correct sorted position.
 */
export function addSupplierPaymentToAllStores(newPayment: any, sortConfig?: { field: string; direction: 'asc' | 'desc' }) {
  if (typeof window === 'undefined') return;
  
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_supplier_payments_summary')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      
      // Check if payment already exists to avoid duplicates
      if (state.data.find((item: any) => item.payment_id === newPayment.payment_id)) return;
      
      let newData: any[];
      
      if (sortConfig) {
        // Find the correct position based on sort order
        const insertIndex = findSortedInsertPosition(state.data, newPayment, sortConfig);
        newData = [...state.data];
        newData.splice(insertIndex, 0, newPayment);
      } else {
        // Fallback to adding at the beginning
        newData = [newPayment, ...state.data];
      }
      
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[addSupplierPaymentToAllStores] Added payment to store with sort', { 
          key, 
          paymentId: newPayment.payment_id, 
          sortConfig,
          insertIndex: sortConfig ? findSortedInsertPosition(state.data, newPayment, sortConfig) : 0
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
    const comparison = compareSupplierPaymentValues(newItem[field], sortedArray[mid][field], isAscending);
    
    if (comparison < 0) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  
  return low;
}

/**
 * Compare two supplier payment values for sorting.
 */
function compareSupplierPaymentValues(a: any, b: any, isAscending: boolean): number {
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
 * Update a supplier payment in all InfiniteList caches and the React Query detail cache.
 * Ensures both the list and the details pane are updated optimistically.
 * Pass the queryClient from useQueryClient.
 */
export function updateSupplierPaymentInCaches(
  queryClient: QueryClient, 
  updatedPayment: any, 
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
) {
  // Update InfiniteList stores first
  updateSupplierPaymentInAllStores(updatedPayment, sortConfig);
  
  if (queryClient && updatedPayment && updatedPayment.payment_id) {
    // Update the detail cache (['supplier-payment', String(paymentId)])
    queryClient.setQueryData(['supplier-payment', String(updatedPayment.payment_id)], (old: any) => {
      if (!old) return updatedPayment;
      return {
        ...old,
        ...updatedPayment,
      };
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[updateSupplierPaymentInCaches] Patched detail cache for payment', updatedPayment.payment_id, 'with sort config:', sortConfig);
    }
  }
}

/**
 * Add a new supplier payment to all caches using the TaskList pattern.
 * This is the optimistic update function that should work immediately.
 */
export function addSupplierPaymentToAllCaches(
  queryClient: QueryClient, 
  newPayment: any, 
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
) {
  // Add to InfiniteList stores first (this is the key!)
  addSupplierPaymentToAllStores(newPayment, sortConfig);
  
  if (queryClient && newPayment && newPayment.payment_id) {
    // Also add to detail cache
    queryClient.setQueryData(['supplier-payment', String(newPayment.payment_id)], newPayment);
    
    // Invalidate queries as a safety net (but InfiniteList should already be updated)
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && 
        (query.queryKey[0] === 'v_supplier_payments_summary' || 
         (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('supplier-payments-')))
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[addSupplierPaymentToAllCaches] Added payment to all caches', newPayment.payment_id, 'with sort config:', sortConfig);
    }
  }
}

/**
 * Remove a supplier payment from all caches using the TaskList pattern.
 * This ensures immediate removal from all views.
 */
export function removeSupplierPaymentFromAllCaches(queryClient: QueryClient, paymentId: number) {
  // Remove from InfiniteList stores first (this is the key!)
  removeSupplierPaymentFromAllStores(paymentId);
  
  if (queryClient) {
    // Remove from detail cache
    queryClient.removeQueries({ queryKey: ['supplier-payment', String(paymentId)] });
    
    // Invalidate queries as a safety net
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && 
        (query.queryKey[0] === 'v_supplier_payments_summary' || 
         (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('supplier-payments-')))
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[removeSupplierPaymentFromAllCaches] Removed payment from all caches', paymentId);
    }
  }
}

/**
 * Update a supplier payment in all caches when allocations change.
 * This ensures the payment summary is updated optimistically.
 */
export function updateSupplierPaymentAllocationsInCaches(
  queryClient: QueryClient, 
  paymentId: number, 
  newAllocations: any[]
) {
  // Calculate new allocation amounts
  const totalAllocated = newAllocations.reduce((sum, allocation) => sum + allocation.amount_applied, 0);
  
  // Update InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_supplier_payments_summary')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      const idx = state.data.findIndex((item: any) => String(item.payment_id) === String(paymentId));
      if (idx === -1) return;
      
      const updatedPayment = {
        ...state.data[idx],
        amount_allocated: totalAllocated,
        unallocated_amount: state.data[idx].payment_amount - totalAllocated,
        allocations: newAllocations
      };
      
      const newData = [...state.data];
      newData[idx] = updatedPayment;
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateSupplierPaymentAllocationsInCaches] Updated payment allocations in store', { 
          key, 
          paymentId,
          totalAllocated,
          unallocatedAmount: updatedPayment.unallocated_amount
        });
      }
    }
  });
  
  // Update detail cache
  if (queryClient) {
    queryClient.setQueryData(['supplier-payment', String(paymentId)], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        amount_allocated: totalAllocated,
        unallocated_amount: old.payment_amount - totalAllocated,
        allocations: newAllocations
      };
    });
  }
}
