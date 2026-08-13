"use client"

import React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { HeaderCreateSurface } from "./header-create-surface"
import {
  CREATE_MODAL_TITLES,
  CREATE_POPUP_Z_CLASS,
  useHeaderCreateFlow,
  type HeaderCreateType,
} from "./use-header-create-flow"
import {
  OPEN_HEADER_CREATE_EVENT,
  type OpenHeaderCreateDetail,
} from "./sidebar-home-feed"

type HeaderCreatePopupHostProps = {
  /** Called when create type is "ai" (or missing). */
  onNewAiThreadClick?: () => void
}

/**
 * Desktop create popup — listens for `app:open-header-create` (sidebar + / row buttons).
 * Replaces the create surface formerly owned by `TaskHeaderBar`.
 */
export function HeaderCreatePopupHost({ onNewAiThreadClick }: HeaderCreatePopupHostProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false)
  const [isPortalMounted, setIsPortalMounted] = React.useState(false)
  const createFlow = useHeaderCreateFlow({ enabled: isCreateModalOpen })

  React.useEffect(() => {
    setIsPortalMounted(true)
  }, [])

  const openCreateModal = React.useCallback(
    (type: HeaderCreateType = "task") => {
      createFlow.openCreateForm(type)
      setIsCreateModalOpen(true)
    },
    [createFlow.openCreateForm],
  )

  React.useEffect(() => {
    const handleOpenCreate = (event: Event) => {
      const detail = (event as CustomEvent<OpenHeaderCreateDetail>).detail
      const type = detail?.type
      if (!type || type === "ai") {
        onNewAiThreadClick?.()
        return
      }
      openCreateModal(type)
    }
    window.addEventListener(OPEN_HEADER_CREATE_EVENT, handleOpenCreate)
    return () => window.removeEventListener(OPEN_HEADER_CREATE_EVENT, handleOpenCreate)
  }, [onNewAiThreadClick, openCreateModal])

  const handleCreateClose = React.useCallback(() => {
    setIsCreateModalOpen(false)
    createFlow.resetCreateState()
  }, [createFlow.resetCreateState])

  if (!isCreateModalOpen || !isPortalMounted) return null

  return createPortal(
    <div
      className={cn(
        "fixed bottom-4 right-4 flex h-[min(86vh,760px)] w-[min(620px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg",
        CREATE_POPUP_Z_CLASS,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-2">
        <span className="text-sm font-medium">{CREATE_MODAL_TITLES[createFlow.createType]}</span>
        <button
          type="button"
          onClick={handleCreateClose}
          className="rounded p-1.5 hover:bg-gray-100"
          aria-label="Close create popup"
        >
          <X className="h-4 w-4 text-gray-600" />
        </button>
      </div>
      <HeaderCreateSurface
        flow={createFlow}
        onClose={handleCreateClose}
        onSuccess={handleCreateClose}
        onAiPillSelect={onNewAiThreadClick}
      />
    </div>,
    document.body,
  )
}
