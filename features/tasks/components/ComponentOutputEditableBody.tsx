"use client"

import React, { useMemo } from "react"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import {
  COMPONENT_OUTPUT_BODY_WRAPPER_CLASS,
  COMPONENT_OUTPUT_EDITOR_CLASS,
  COMPONENT_OUTPUT_FONT_SIZE_PX,
} from "./component-output-body-shared"

type ComponentOutputEditableBodyProps = {
  html: string
  onChange: (html: string) => void
  toolbarId: string
  placeholder?: string
  className?: string
  fromAiChat?: boolean
}

/** Editable component output body — same renderer path as TaskContentTab cards. */
export function ComponentOutputEditableBody({
  html,
  onChange,
  toolbarId,
  placeholder = "Add output...",
  className,
  fromAiChat = false,
}: ComponentOutputEditableBodyProps) {
  const value = useMemo(() => html || "<p></p>", [html])

  return (
    <div
      data-output-content-body="true"
      className={className ?? COMPONENT_OUTPUT_BODY_WRAPPER_CLASS}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <RichTextEditor
        value={value}
        onChange={onChange}
        toolbarId={toolbarId}
        toolbarMode="floating"
        toolbarVariant="compact"
        toolbarVisibility="always"
        reserveToolbarSpace
        showBubbleToolbar={false}
        autoGrow
        fontSize={COMPONENT_OUTPUT_FONT_SIZE_PX}
        placeholder={placeholder}
        editorWrapperClassName={COMPONENT_OUTPUT_EDITOR_CLASS}
        flatSurface
        disableInlineMediaControls
        enableOutputLinkNavigation
        fromAiChat={fromAiChat}
      />
    </div>
  )
}
