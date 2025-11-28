import { storeRegistry, removeItemFromStore, updateItemInStore } from '../../../hooks/use-infinite-query'
import { QueryClient } from '@tanstack/react-query'

/**
 * Remove a payment from all InfiniteList caches (all filters/pagination).
 * Ensures the payment disappears instantly regardless of filters or pagination.
 */
export function removePaymentFromAllStores(paymentId: number) {
  if (typeof window === 'undefined') return;
  
  // Remove from InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_client_payments_summary')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      
      // Filter out the payment using payment_id (not id)
      const newData = state.data.filter((item: any) => item.payment_id !== paymentId);
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[removePaymentFromAllStores] Removed payment from store', { 
          key, 
          paymentId,
          removedCount: state.data.length - newData.length
        });
      }
    }
  })
}

/**
 * Update a payment in all InfiniteList caches (all filters/pagination).
 * Ensures the payment is updated instantly regardless of filters or pagination.
 */
export function updatePaymentInAllStores(updatedPayment: any) {
  if (typeof window === 'undefined') return;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[updatePaymentInAllStores] Starting update for payment:', updatedPayment.payment_id);
    console.log('[updatePaymentInAllStores] Available stores:', Object.keys(storeRegistry));
  }
  
  Object.keys(storeRegistry).forEach(key => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[updatePaymentInAllStores] Checking store key:', key);
    }
    
    if (key.startsWith('v_client_payments_summary')) {
      const store = storeRegistry[key];
      if (!store) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[updatePaymentInAllStores] Store not found for key:', key);
        }
        return;
      }
      const state = store.getState();
      if (process.env.NODE_ENV === 'development') {
        console.log('[updatePaymentInAllStores] Store state data length:', state.data?.length);
      }
      
      const idx = state.data.findIndex((item: any) => String(item.payment_id) === String(updatedPayment.payment_id));
      if (idx === -1) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[updatePaymentInAllStores] Payment not found in store:', key);
        }
        return;
      }
      
      const oldPayment = state.data[idx];
      // Patch the payment with updated data
      const patchedPayment = {
        ...oldPayment,
        ...updatedPayment,
      };
      const newData = [...state.data];
      newData[idx] = patchedPayment;
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updatePaymentInAllStores] Successfully patched payment in store', { key, patchedPayment });
      }
    }
  })
}

/**
 * Update payment in all relevant caches for optimistic updates
 */
export function updatePaymentInCaches(queryClient: QueryClient, updatedPayment: any) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[updatePaymentInCaches] Starting update for payment:', updatedPayment.payment_id);
  }
  
  // Update payment details cache
  queryClient.setQueryData(['payment', updatedPayment.payment_id], updatedPayment)
  
  // Update all InfiniteList stores (same approach as tasks)
  updatePaymentInAllStores(updatedPayment)
  
  // Also update any query-based caches
  queryClient.setQueryData(['v_client_payments_summary'], (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) {
      return old.map((payment: any) => 
        payment.payment_id === updatedPayment.payment_id 
          ? { ...payment, ...updatedPayment }
          : payment
      )
    }
    return old
  })
  
  // Update any other payment-related caches
  queryClient.setQueryData(['payments'], (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) {
      return old.map((payment: any) => 
        payment.payment_id === updatedPayment.payment_id 
          ? { ...payment, ...updatedPayment }
          : payment
      )
    }
    return old
  })
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[updatePaymentInCaches] Completed update for payment:', updatedPayment.payment_id);
  }
}

/**
 * Add a new payment to all InfiniteList stores.
 * This is the key function for optimistic updates.
 */
export function addPaymentToAllStores(newPayment: any, sortConfig?: { field: string; direction: 'asc' | 'desc' }) {
  if (typeof window === 'undefined') return;
  
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_client_payments_summary')) {
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
        console.log('[addPaymentToAllStores] Added payment to store with sort', { 
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
  let left = 0;
  let right = sortedArray.length;
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const midItem = sortedArray[mid];
    
    let comparison = 0;
    
    // Handle different field types
    if (field === 'payment_date') {
      const newDate = new Date(newItem[field]);
      const midDate = new Date(midItem[field]);
      comparison = newDate.getTime() - midDate.getTime();
    } else if (field === 'payment_amount') {
      comparison = (newItem[field] || 0) - (midItem[field] || 0);
    } else {
      // String comparison
      const newValue = String(newItem[field] || '');
      const midValue = String(midItem[field] || '');
      comparison = newValue.localeCompare(midValue);
    }
    
    if (isAscending) {
      if (comparison < 0) {
        right = mid;
      } else {
        left = mid + 1;
      }
    } else {
      if (comparison > 0) {
        right = mid;
      } else {
        left = mid + 1;
      }
    }
  }
  
  return left;
}

/**
 * Add a new payment to all caches using the same pattern as invoices.
 * This is the optimistic update function that should work immediately.
 */
export function addPaymentToAllCaches(
  queryClient: QueryClient, 
  newPayment: any, 
  sortConfig?: { field: string; direction: 'asc' | 'desc' }
) {
  // Add to InfiniteList stores first (this is the key!)
  addPaymentToAllStores(newPayment, sortConfig);
  
  if (queryClient && newPayment && newPayment.payment_id) {
    // Also add to detail cache
    queryClient.setQueryData(['payment', String(newPayment.payment_id)], newPayment);
    
    // Invalidate queries as a safety net (but InfiniteList should already be updated)
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) && 
        (query.queryKey[0] === 'v_client_payments_summary' || 
         (typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('payments-')))
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[addPaymentToAllCaches] Added payment to all caches', newPayment.payment_id, 'with sort config:', sortConfig);
    }
  }
}

/**
 * Remove payment from all caches
 */
export function removePaymentFromCaches(queryClient: QueryClient, paymentId: number) {
  // Remove from payment details cache
  queryClient.removeQueries({ queryKey: ['payment', paymentId] })
  
  // Remove from all InfiniteList stores (same approach as tasks)
  removePaymentFromAllStores(paymentId)
  
  // Also remove from query-based caches
  queryClient.setQueryData(['v_client_payments_summary'], (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) {
      return old.filter((payment: any) => payment.payment_id !== paymentId)
    }
    return old
  })
  
  // Remove from other payment caches
  queryClient.setQueryData(['payments'], (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) {
      return old.filter((payment: any) => payment.payment_id !== paymentId)
    }
    return old
  })
} 