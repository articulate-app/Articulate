"use client"

import React, { useMemo } from "react"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import {
  COMPONENT_FIELD_TEXTAREA_CLASS,
  COMPONENT_OUTPUT_BODY_WRAPPER_CLASS,
  COMPONENT_OUTPUT_FONT_SIZE_PX,
} from "./component-output-body-shared"

type ComponentOutputReadonlyBodyProps = {
  html: string
  highlightTerms?: Array<{ term: string; color: string }>
  toolbarId: string
  placeholder?: string
  className?: string
  fromAiChat?: boolean
}

/** Read-only component/artifact output body. */
export function ComponentOutputReadonlyBody({
  html,
  highlightTerms,
  toolbarId,
  placeholder = "Add output...",
  className,
  fromAiChat = false,
}: ComponentOutputReadonlyBodyProps) {
  const value = useMemo(() => html || "<p></p>", [html])

  return (
    <div
      data-output-content-body="true"
      className={className ?? COMPONENT_OUTPUT_BODY_WRAPPER_CLASS}
    >
      <RichTextEditor
        value={value}
        onChange={() => {}}
        readOnly
        toolbarId={toolbarId}
        toolbarMode="floating"
        toolbarVisibility="hidden"
        showBubbleToolbar={false}
        autoGrow
        fontSize={COMPONENT_OUTPUT_FONT_SIZE_PX}
        placeholder={placeholder}
        editorWrapperClassName={COMPONENT_FIELD_TEXTAREA_CLASS}
              flatSurface
        disableInlineMediaControls
        highlightTerms={highlightTerms}
        enableOutputLinkNavigation
        fromAiChat={fromAiChat}
      />
    </div>
  )
}
