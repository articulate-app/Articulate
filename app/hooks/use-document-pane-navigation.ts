"use client"

import { useState, useCallback } from 'react'

export interface RelatedDocument {
  id: number
  type: string
  [key: string]: any
}

export interface DocumentPaneNavigationState {
  selectedRelatedDocument: RelatedDocument | null
  relatedDocumentType: string | null
}

export interface DocumentPaneNavigationActions {
  handleRelatedDocumentSelect: (document: any, type: string) => void
  handleRelatedDocumentClose: () => void
  isThirdPaneOpen: boolean
}

/**
 * Custom hook for managing third pane navigation in document detail views
 * Provides state management and actions for opening/closing related documents
 */
export function useDocumentPaneNavigation(): DocumentPaneNavigationState & DocumentPaneNavigationActions {
  const [selectedRelatedDocument, setSelectedRelatedDocument] = useState<RelatedDocument | null>(null)
  const [relatedDocumentType, setRelatedDocumentType] = useState<string | null>(null)

  const handleRelatedDocumentSelect = useCallback((document: any, type: string) => {
    setSelectedRelatedDocument(document)
    setRelatedDocumentType(type)
  }, [])

  const handleRelatedDocumentClose = useCallback(() => {
    setSelectedRelatedDocument(null)
    setRelatedDocumentType(null)
  }, [])

  const isThirdPaneOpen = selectedRelatedDocument !== null

  return {
    selectedRelatedDocument,
    relatedDocumentType,
    handleRelatedDocumentSelect,
    handleRelatedDocumentClose,
    isThirdPaneOpen
  }
}

/**
 * Hook for getting layout classes based on pane state
 * Returns appropriate margin classes for main content when third pane is open
 */
export function useDocumentPaneLayout(hasRightPane: boolean, hasThirdPane: boolean) {
  if (!hasRightPane) return ''
  if (hasThirdPane) return 'mr-[768px]'
  return 'mr-96'
}

/**
 * Hook for getting third pane positioning classes
 * Returns appropriate positioning classes for third pane based on state
 */
export function useThirdPaneLayout(hasThirdPane: boolean) {
  if (!hasThirdPane) return 'right-0 w-96'
  return 'right-96 w-96'
}
