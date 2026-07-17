import type { Editor } from "@tiptap/react"

export type SavedEditorRange = {
  from: number
  to: number
}

export type EditorLinkFormState = {
  text: string
  url: string
  openInNewTab: boolean
  isEditing: boolean
}

export function captureEditorLinkContext(editor: Editor): {
  range: SavedEditorRange
  form: EditorLinkFormState
} {
  const chain = editor.chain().focus()
  if (editor.isActive("link")) {
    chain.extendMarkRange("link").run()
  }

  const { from, to } = editor.state.selection
  const text = editor.state.doc.textBetween(from, to, " ")
  const attrs = editor.getAttributes("link")
  const href = typeof attrs.href === "string" ? attrs.href : ""

  return {
    range: { from, to },
    form: {
      text,
      url: href,
      openInNewTab: attrs.target === "_blank",
      isEditing: editor.isActive("link"),
    },
  }
}

export function openEditorLinkFromAnchor(editor: Editor, anchor: HTMLElement): boolean {
  const pos = editor.view.posAtDOM(anchor, 0)
  if (pos < 0) return false
  editor.chain().focus().setTextSelection(pos).extendMarkRange("link").run()
  return true
}

export function applyEditorLinkChange(args: {
  editor: Editor
  range: SavedEditorRange
  text: string
  url: string
  openInNewTab: boolean
}): void {
  const { editor, range, openInNewTab } = args
  const trimmedUrl = args.url.trim()
  const displayText = args.text.trim()
  const target = openInNewTab ? "_blank" : null

  editor.chain().focus().setTextSelection(range).run()

  if (!trimmedUrl) {
    editor.chain().focus().setTextSelection(range).extendMarkRange("link").unsetLink().run()
    return
  }

  const selectedText = editor.state.doc.textBetween(range.from, range.to, " ")
  const isEmptySelection = range.from === range.to

  if (isEmptySelection) {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text: displayText || trimmedUrl,
        marks: [{ type: "link", attrs: { href: trimmedUrl, target } }],
      })
      .run()
    return
  }

  if (displayText && displayText !== selectedText) {
    editor
      .chain()
      .focus()
      .setTextSelection(range)
      .deleteSelection()
      .insertContent({
        type: "text",
        text: displayText,
        marks: [{ type: "link", attrs: { href: trimmedUrl, target } }],
      })
      .run()
    return
  }

  editor
    .chain()
    .focus()
    .setTextSelection(range)
    .extendMarkRange("link")
    .setLink({ href: trimmedUrl, target })
    .run()
}

export function removeEditorLink(args: { editor: Editor; range: SavedEditorRange }): void {
  const { editor, range } = args
  editor.chain().focus().setTextSelection(range).extendMarkRange("link").unsetLink().run()
}
