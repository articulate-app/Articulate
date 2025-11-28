import { QueryClient } from '@tanstack/react-query'
import { removeItemFromStore, updateItemInStore, storeRegistry } from '../../../hooks/use-infinite-query'
import { getDocumentGroupKey, type GroupingMode } from '../../lib/utils/document-grouping'
import type { DocumentRow } from '../../lib/types/documents'

/**
 * Remove a document from all InfiniteList caches (all filters/pagination).
 * Ensures the document disappears instantly regardless of filters or pagination.
 */
export function removeDocumentFromAllStores(documentId: number, docKind?: string) {
  if (typeof window === 'undefined') return;
  
  // Remove from InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_documents_min')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      
      // Filter out the document using doc_id and optionally doc_kind for uniqueness
      const newData = state.data.filter((item: any) => 
        docKind ? !(item.doc_id === documentId && item.doc_kind === docKind) : item.doc_id !== documentId
      );
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[removeDocumentFromAllStores] Removed document from store', { 
          key, 
          documentId,
          docKind,
          removedCount: state.data.length - newData.length
        });
      }
    }
  })
}

/**
 * Remove document from all caches
 */
export function removeDocumentFromCaches(queryClient: QueryClient, documentId: number, docKind?: string) {
  // Remove from document details cache
  queryClient.removeQueries({ queryKey: ['document', documentId] })
  
  // Remove from all InfiniteList stores
  removeDocumentFromAllStores(documentId, docKind)
  
  // Invalidate documents summary query
  queryClient.invalidateQueries({ queryKey: ['documents-summary'] })
  
  // Invalidate all documents queries
  queryClient.invalidateQueries({ queryKey: ['documents'] })
}

/**
 * Update document in all InfiniteList caches (all filters/pagination).
 * Ensures the document is updated instantly regardless of filters or pagination.
 */
export function updateDocumentInAllStores(documentId: number, updatedDocument: DocumentRow, docKind?: string) {
  if (typeof window === 'undefined') return;
  
  // Update in InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_documents_min')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      
      // Find the document to update using doc_id and optionally doc_kind for uniqueness
      const idx = state.data.findIndex((item: any) => 
        docKind ? (item.doc_id === documentId && item.doc_kind === docKind) : item.doc_id === documentId
      );
      
      if (idx === -1) return;
      
      // Get the existing document and merge with updates
      const existingDocument = state.data[idx];
      const mergedDocument = { ...existingDocument, ...updatedDocument };
      
      // Extract sort configuration from query key
      let sortField = 'doc_date';
      let sortDirection: 'asc' | 'desc' = 'desc';
      
      try {
        // Try to parse sort config from key
        // Key format: "v_documents_min::documents-{filters}-{sort}-{grouping}"
        const parts = key.split('::');
        if (parts.length > 1) {
          const queryKeyStr = parts[1];
          // Try to extract sort from the pattern
          const sortMatch = queryKeyStr.match(/"field":"([^"]+)","direction":"([^"]+)"/);
          if (sortMatch) {
            sortField = sortMatch[1];
            // Direction can be "desc,doc_id" or just "desc"
            sortDirection = sortMatch[2].includes('desc') ? 'desc' : 'asc';
          }
        }
      } catch (e) {
        // Use defaults if parsing fails
      }
      
      // Check if the document needs to move (if sortable fields changed)
      const needsRepositioning = 
        existingDocument[sortField] !== mergedDocument[sortField] ||
        existingDocument.doc_id !== mergedDocument.doc_id;
      
      if (needsRepositioning) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[updateDocumentInAllStores] Document needs repositioning:', {
            sortField,
            sortDirection,
            oldValue: existingDocument[sortField],
            newValue: mergedDocument[sortField],
            oldIndex: idx
          });
        }
        
        // Remove the document from its current position
        const newData = state.data.filter((_: any, i: number) => i !== idx);
        
        // Find the correct insertion position based on sorting
        const insertionIndex = findInsertionIndex(newData, mergedDocument, sortField, sortDirection);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[updateDocumentInAllStores] Moving document from index', idx, 'to', insertionIndex);
        }
        
        // Insert the updated document at the correct position
        newData.splice(insertionIndex, 0, mergedDocument);
        store.setState({ data: newData });
      } else {
        // Document doesn't need to move, just update in place
        const newData = [...state.data];
        newData[idx] = mergedDocument;
        store.setState({ data: newData });
      }
    }
  })
}

/**
 * Update document in all caches
 */
export function updateDocumentInCaches(queryClient: QueryClient, documentId: number, updatedDocument: DocumentRow, docKind?: string) {
  // Update document details cache
  queryClient.setQueryData(['document', documentId], updatedDocument)
  
  // Update in all InfiniteList stores
  updateDocumentInAllStores(documentId, updatedDocument, docKind)
  
  // Invalidate documents summary query to refresh totals
  queryClient.invalidateQueries({ queryKey: ['documents-summary'] })
}

/**
 * Helper function to find the correct insertion index for a new document based on sorting
 */
function findInsertionIndex(data: any[], newDocument: DocumentRow, sortField: string, sortDirection: 'asc' | 'desc'): number {
  // Extract sort field and direction from the data (if available from query key)
  // For now, assume default: doc_date desc, doc_id asc
  
  const isAscending = sortDirection === 'asc';
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const newValue = (newDocument as any)[sortField];
    const itemValue = item[sortField];
    
    // Handle nulls (nullsFirst: false means nulls go last)
    if (newValue === null || newValue === undefined) {
      continue; // Put nulls at the end
    }
    if (itemValue === null || itemValue === undefined) {
      return i; // Insert before null values
    }
    
    // Compare values based on sort direction
    if (isAscending) {
      if (newValue < itemValue) return i;
      if (newValue === itemValue) {
        // Secondary sort by doc_id (always ascending)
        if (newDocument.doc_id < item.doc_id) return i;
      }
    } else {
      if (newValue > itemValue) return i;
      if (newValue === itemValue) {
        // Secondary sort by doc_id (always ascending)
        if (newDocument.doc_id < item.doc_id) return i;
      }
    }
  }
  
  return data.length; // Insert at the end
}

/**
 * Add a document to all InfiniteList caches (all filters/pagination).
 * Ensures the document appears instantly regardless of filters or pagination.
 */
export function addDocumentToAllStores(newDocument: DocumentRow) {
  if (typeof window === 'undefined') return;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[addDocumentToAllStores] Starting, available stores:', Object.keys(storeRegistry));
    console.log('[addDocumentToAllStores] New document:', newDocument);
  }
  
  // Add to InfiniteList stores
  Object.keys(storeRegistry).forEach(key => {
    if (key.startsWith('v_documents_min')) {
      const store = storeRegistry[key];
      if (!store) return;
      const state = store.getState();
      
      // Check if document already exists to avoid duplicates
      // Use composite key since doc_id is not unique across document types
      const exists = state.data.some((item: any) => 
        item.doc_id === newDocument.doc_id && item.doc_kind === newDocument.doc_kind
      );
      if (exists) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[addDocumentToAllStores] Document already exists in store:', key);
        }
        return;
      }
      
      // Try to extract sort info from query key
      // Default to doc_date desc if not found
      let sortField = 'doc_date';
      let sortDirection: 'asc' | 'desc' = 'desc';
      
      try {
        const keyObj = JSON.parse(key.split('v_documents_min-')[1] || '{}');
        if (keyObj.sort) {
          const [field, direction] = keyObj.sort.split('.');
          sortField = field;
          sortDirection = direction === 'asc' ? 'asc' : 'desc';
        }
      } catch (e) {
        // Use defaults
      }
      
      // Find the correct insertion position based on sorting
      const insertionIndex = findInsertionIndex(state.data, newDocument, sortField, sortDirection);
      
      // Insert the document at the correct position
      const newData = [...state.data];
      newData.splice(insertionIndex, 0, newDocument);
      store.setState({ data: newData });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[addDocumentToAllStores] Added document to store', { 
          key, 
          documentId: newDocument.doc_id,
          insertionIndex,
          sortField,
          sortDirection,
          newDataLength: newData.length
        });
      }
    }
  })
}

/**
 * Add document to all caches
 */
export function addDocumentToCaches(queryClient: QueryClient, newDocument: DocumentRow, groupingMode: GroupingMode = 'month') {
  if (process.env.NODE_ENV === 'development') {
    console.log('[addDocumentToCaches] Adding document:', newDocument);
  }
  
  // Add to all InfiniteList stores first (this is the key!)
  addDocumentToAllStores(newDocument)
  
  // Only invalidate summary queries, NOT the document list queries
  // (InfiniteList stores already have the document, refetching would create duplicates)
  queryClient.invalidateQueries({ queryKey: ['documents-summary'] })
  
  // Dispatch event to auto-expand group if collapsed
  if (typeof window !== 'undefined') {
    const groupKey = getDocumentGroupKey(newDocument, groupingMode)
    window.dispatchEvent(new CustomEvent('document:added', { 
      detail: { document: newDocument, groupKey } 
    }))
  }
}

