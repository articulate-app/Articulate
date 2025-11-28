import { storeRegistry, removeItemFromStore, updateItemInStore } from '../../../hooks/use-infinite-query'
import { QueryClient } from '@tanstack/react-query'

/**
 * Remove an invoice order from all InfiniteList caches (all filters/pagination).
 * Ensures the invoice order disappears instantly regardless of filters or pagination.
 */
export function removeInvoiceOrderFromAllStores(invoiceOrderId: number) {
  if (typeof window === 'undefined') return;
  
  // Remove from InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_invoice_orders_list')) {
      removeItemFromStore('v_invoice_orders_list', key.includes('::') ? key.split('::')[1] : undefined, invoiceOrderId)
    }
  })
}

/**
 * Update an invoice order in all InfiniteList caches (all filters/pagination).
 * Ensures the invoice order is updated instantly regardless of filters or pagination.
 */
export function updateInvoiceOrderInAllStores(updatedInvoiceOrder: any) {
  if (typeof window === 'undefined') return;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[updateInvoiceOrderInAllStores] Starting update for invoice order:', updatedInvoiceOrder.id);
    console.log('[updateInvoiceOrderInAllStores] Available stores:', Object.keys(storeRegistry));
  }
  
  Object.keys(storeRegistry).forEach(key => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[updateInvoiceOrderInAllStores] Checking store key:', key);
    }
    
    if (key.startsWith('v_invoice_orders_list')) {
      const store = storeRegistry[key];
      if (!store) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[updateInvoiceOrderInAllStores] Store not found for key:', key);
        }
        return;
      }
      const state = store.getState();
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateInvoiceOrderInAllStores] Store state data length:', state.data?.length);
      }
      
      const idx = state.data.findIndex((item: any) => String(item.id) === String(updatedInvoiceOrder.id));
      if (idx === -1) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[updateInvoiceOrderInAllStores] Invoice order not found in store:', key);
        }
        return;
      }
      
      const oldInvoiceOrder = state.data[idx];
      // Patch the invoice order with updated data
      const patchedInvoiceOrder = {
        ...oldInvoiceOrder,
        ...updatedInvoiceOrder,
      };
      const newData = [...state.data];
      newData[idx] = patchedInvoiceOrder;
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[updateInvoiceOrderInAllStores] Successfully patched invoice order in store', { key, patchedInvoiceOrder });
      }
    }
  })
}

/**
 * Update invoice order in all relevant caches for optimistic updates
 */
export function updateInvoiceOrderInCaches(queryClient: QueryClient, updatedInvoiceOrder: any) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[updateInvoiceOrderInCaches] Starting update for invoice order:', updatedInvoiceOrder.id);
  }
  
  // Update invoice order details cache
  queryClient.setQueryData(['invoice-order', updatedInvoiceOrder.id], updatedInvoiceOrder)
  
  // Update all InfiniteList stores (same approach as tasks)
  updateInvoiceOrderInAllStores(updatedInvoiceOrder)
  
  // Also update any query-based caches
  queryClient.setQueryData(['v_invoice_orders_list'], (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) {
      return old.map((invoiceOrder: any) => 
        invoiceOrder.id === updatedInvoiceOrder.id 
          ? { ...invoiceOrder, ...updatedInvoiceOrder }
          : invoiceOrder
      )
    }
    return old
  })
  
  // Update any other invoice order-related caches
  queryClient.setQueryData(['invoice-orders'], (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) {
      return old.map((invoiceOrder: any) => 
        invoiceOrder.id === updatedInvoiceOrder.id 
          ? { ...invoiceOrder, ...updatedInvoiceOrder }
          : invoiceOrder
      )
    }
    return old
  })
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[updateInvoiceOrderInCaches] Completed update for invoice order:', updatedInvoiceOrder.id);
  }
}

/**
 * Remove invoice order from all caches
 */
export function removeInvoiceOrderFromCaches(queryClient: QueryClient, invoiceOrderId: number) {
  // Remove from invoice order details cache
  queryClient.removeQueries({ queryKey: ['invoice-order', invoiceOrderId] })
  
  // Remove from all InfiniteList stores (same approach as tasks)
  removeInvoiceOrderFromAllStores(invoiceOrderId)
  
  // Also remove from query-based caches
  queryClient.setQueryData(['v_invoice_orders_list'], (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) {
      return old.filter((invoiceOrder: any) => invoiceOrder.id !== invoiceOrderId)
    }
    return old
  })
  
  // Remove from other invoice order caches
  queryClient.setQueryData(['invoice-orders'], (old: any) => {
    if (!old) return old
    if (Array.isArray(old)) {
      return old.filter((invoiceOrder: any) => invoiceOrder.id !== invoiceOrderId)
    }
    return old
  })
} 