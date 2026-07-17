"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"
import { EditorLinkDialog } from "./EditorLinkDialog"
import {
  applyEditorLinkChange,
  captureEditorLinkContext,
  removeEditorLink,
  type EditorLinkFormState,
  type SavedEditorRange,
} from "./editor-link-commands"

const EMPTY_FORM: EditorLinkFormState = {
  text: "",
  url: "",
  openInNewTab: true,
  isEditing: false,
}

export function useEditorLinkDialog(editor: Editor | null) {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<EditorLinkFormState>(EMPTY_FORM)
  const savedRangeRef = React.useRef<SavedEditorRange | null>(null)

  const patchForm = React.useCallback((patch: Partial<EditorLinkFormState>) => {
    setForm((current) => ({ ...current, ...patch }))
  }, [])

  const openLinkDialog = React.useCallback(() => {
    if (!editor) return
    const { range, form: nextForm } = captureEditorLinkContext(editor)
    savedRangeRef.current = range
    setForm(nextForm)
    setOpen(true)
  }, [editor])

  const closeLinkDialog = React.useCallback(() => {
    setOpen(false)
  }, [])

  const confirmLinkDialog = React.useCallback(() => {
    if (!editor || !savedRangeRef.current) return
    applyEditorLinkChange({
      editor,
      range: savedRangeRef.current,
      text: form.text,
      url: form.url,
      openInNewTab: form.openInNewTab,
    })
    setOpen(false)
  }, [editor, form.openInNewTab, form.text, form.url])

  const removeLinkFromDialog = React.useCallback(() => {
    if (!editor || !savedRangeRef.current) return
    removeEditorLink({ editor, range: savedRangeRef.current })
    setOpen(false)
  }, [editor])

  const handleLinkShortcut = React.useCallback(
    (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return false
      if (event.key.toLowerCase() !== "k") return false
      event.preventDefault()
      openLinkDialog()
      return true
    },
    [openLinkDialog],
  )

  const linkDialogNode = (
    <EditorLinkDialog
      open={open}
      form={form}
      onFormChange={patchForm}
      onOpenChange={setOpen}
      onConfirm={confirmLinkDialog}
      onRemove={removeLinkFromDialog}
    />
  )

  return {
    openLinkDialog,
    closeLinkDialog,
    handleLinkShortcut,
    linkDialogNode,
  }
}
