"use client"

import { useCallback } from "react"
import { cn } from "@/lib/utils"
import { CreateObjectPills, type CreateObjectPillId } from "./create-object-pills"
import { HeaderCreateFlowPanel } from "./header-create-flow-panel"
import { type HeaderCreateFlow, type HeaderCreateType } from "./use-header-create-flow"

interface HeaderCreateSurfaceProps {
  flow: HeaderCreateFlow
  onClose: () => void
  onSuccess: () => void
  /** Called when the AI chat pill is selected (after `onClose`). */
  onAiPillSelect?: () => void
  className?: string
}

/**
 * Shared create UI: object pills + form panel. Used by desktop create popup and mobile create drawer.
 * Task is the default selection; callers should call `flow.openCreateForm("task")` when opening.
 */
export function HeaderCreateSurface({
  flow,
  onClose,
  onSuccess,
  onAiPillSelect,
  className,
}: HeaderCreateSurfaceProps) {
  const { openCreateForm, createType } = flow

  const handlePillChange = useCallback(
    (optionId: CreateObjectPillId) => {
      if (optionId === "ai") {
        onClose()
        onAiPillSelect?.()
        return
      }
      openCreateForm(optionId as HeaderCreateType)
    },
    [onClose, onAiPillSelect, openCreateForm],
  )

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      <CreateObjectPills value={createType} onValueChange={handlePillChange} className="shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <HeaderCreateFlowPanel flow={flow} onCancel={onClose} onSuccess={onSuccess} />
      </div>
    </div>
  )
}
