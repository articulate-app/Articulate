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
  readOnly?: boolean
  /** Force TipTap sync when AI/version content changes. */
  forceContentKey?: string | number | null
  collaborationDocument?: import("yjs").Doc | null
  /** When set, enables image/video toolbar + drag/drop/paste into TipTap. */
  onInsertAttachment?: (
    file: File,
    context?: { position?: number; currentHtml?: string },
  ) => Promise<{
    attachmentId: string
    url: string
    mediaType: "image" | "video"
    fileName: string
  } | null>
  /** Defaults to true for component outputs; artifacts usually pass false. */
  disableInlineMediaControls?: boolean
}

/** Editable component/artifact output body. */
export function ComponentOutputEditableBody({
  html,
  onChange,
  toolbarId,
  placeholder = "Add output...",
  className,
  fromAiChat = false,
  readOnly = false,
  forceContentKey = null,
  collaborationDocument = null,
  onInsertAttachment,
  disableInlineMediaControls = true,
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
        readOnly={readOnly}
        disableInlineMediaControls={disableInlineMediaControls}
        enableOutputLinkNavigation
        fromAiChat={fromAiChat}
        forceContentKey={collaborationDocument ? null : forceContentKey}
        collaborationDocument={collaborationDocument}
        onInsertAttachment={readOnly ? undefined : onInsertAttachment}
      />
    </div>
  )
}
