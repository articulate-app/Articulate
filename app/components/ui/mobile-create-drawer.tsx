"use client"

import { useCallback, useEffect } from "react"
import { ResizableBottomSheet } from "./resizable-bottom-sheet"
import { HeaderCreateSurface } from "./header-create-surface"
import { CREATE_MODAL_TITLES, useHeaderCreateFlow } from "./use-header-create-flow"

interface MobileCreateDrawerProps {
  isOpen: boolean
  onClose: () => void
  onNewAiThreadClick: () => void
}

export function MobileCreateDrawer({ isOpen, onClose, onNewAiThreadClick }: MobileCreateDrawerProps) {
  const flow = useHeaderCreateFlow({ enabled: isOpen })
  const { resetCreateState, openCreateForm, createType } = flow

  useEffect(() => {
    if (isOpen) {
      openCreateForm("task")
    } else {
      resetCreateState()
    }
  }, [isOpen, openCreateForm, resetCreateState])

  const handleClose = useCallback(() => {
    resetCreateState()
    onClose()
  }, [onClose, resetCreateState])

  return (
    <ResizableBottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      heightDvh={90}
      lockBodyScroll
      contentOverflow="hidden"
      title={CREATE_MODAL_TITLES[createType]}
    >
      <HeaderCreateSurface
        flow={flow}
        onClose={handleClose}
        onSuccess={handleClose}
        onAiPillSelect={onNewAiThreadClick}
      />
    </ResizableBottomSheet>
  )
}
