"use client"

import { useCallback, useLayoutEffect, useMemo } from "react"
import { HeaderCreateSurface } from "../ui/header-create-surface"
import {
  CREATE_MODAL_TITLES,
  useHeaderCreateFlow,
  type HeaderCreateType,
} from "../ui/use-header-create-flow"
import type { CreateCenterType } from "../../lib/center-pane-selection-url"

type CreateCenterPaneProps = {
  createType: CreateCenterType
  onCreateTypeChange?: (type: CreateCenterType) => void
  onClose: () => void
  onSuccess: () => void
  onAiPillSelect?: () => void
}

/**
 * Middle-pane create surface — single-object form (no type pills).
 * Type is chosen from the sidebar Create menu before opening.
 */
export function CreateCenterPane({
  createType,
  onCreateTypeChange,
  onClose,
  onSuccess,
  onAiPillSelect,
}: CreateCenterPaneProps) {
  const flow = useHeaderCreateFlow({ enabled: true })

  // Seed from URL before paint so reverse sync cannot overwrite the requested type.
  useLayoutEffect(() => {
    if (flow.createType === createType) return
    flow.openCreateForm(createType as HeaderCreateType)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed from URL type only
  }, [createType])

  const wrappedFlow = useMemo(
    () => ({
      ...flow,
      openCreateForm: (type: HeaderCreateType) => {
        flow.openCreateForm(type)
        if (type !== createType) onCreateTypeChange?.(type)
      },
    }),
    [createType, flow, onCreateTypeChange],
  )

  const handleSuccess = useCallback(() => {
    onSuccess()
  }, [onSuccess])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {CREATE_MODAL_TITLES[flow.createType]}
        </h2>
      </div>
      <HeaderCreateSurface
        flow={wrappedFlow}
        onClose={onClose}
        onSuccess={handleSuccess}
        onAiPillSelect={onAiPillSelect}
        showTypePills={false}
        className="min-h-0 flex-1"
      />
    </div>
  )
}
