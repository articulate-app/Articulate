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
  /**
   * Desktop header picks the create type via "Add task" dropdown, so pills stay hidden.
   * Mobile drawer still shows pills when true.
   */
  showTypePills?: boolean
  className?: string
}

/**
 * Create form panel. Desktop: type chosen from header dropdown. Mobile: optional type pills.
 */
export function HeaderCreateSurface({
  flow,
  onClose,
  onSuccess,
  onAiPillSelect,
  showTypePills = false,
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
      {showTypePills ? (
        <CreateObjectPills value={createType} onValueChange={handlePillChange} className="shrink-0" />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <HeaderCreateFlowPanel flow={flow} onCancel={onClose} onSuccess={onSuccess} />
      </div>
    </div>
  )
}
