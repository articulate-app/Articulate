import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { CollabConflictChoice, CollabConflictSpan } from "../../lib/collaboration/collab-conflict"

export const collabConflictKey = new PluginKey("collabConflict")

export function findPlainTextRange(
  doc: ProseMirrorNode,
  needle: string,
): { from: number; to: number } | null {
  const target = String(needle ?? "")
  if (!target) return null
  let haystack = ""
  const map: number[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const value = node.text ?? ""
    for (let index = 0; index < value.length; index += 1) {
      haystack += value[index]
      map.push(pos + index)
    }
  })
  const idx = haystack.indexOf(target)
  if (idx < 0 || idx + target.length > map.length) return null
  const from = map[idx]
  const last = map[idx + target.length - 1]
  if (from == null || last == null) return null
  return { from, to: last + 1 }
}

function preview(value: string, max = 52): string {
  const text = value.replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}…`
}

function applyChoice(
  view: EditorView,
  conflict: CollabConflictSpan,
  choice: CollabConflictChoice,
): boolean {
  if (choice === "keep") return true
  const range = findPlainTextRange(view.state.doc, conflict.current)
  if (!range) return false
  const next = choice === "both"
    ? `${conflict.current} ${conflict.incoming}`.trim()
    : conflict.incoming
  if (!next) return false
  view.dispatch(view.state.tr.insertText(next, range.from, range.to))
  return true
}

function createChooser(
  conflict: CollabConflictSpan,
  getView: () => EditorView | null,
  onResolve: ((id: string, choice: CollabConflictChoice) => void) | null,
): HTMLElement {
  const host = document.createElement("span")
  host.className = "rte-collab-conflict-chooser"
  host.contentEditable = "false"
  host.setAttribute("data-collab-conflict-chooser", conflict.id)
  host.setAttribute("role", "group")
  host.setAttribute("aria-label", "Resolve edit conflict")

  const label = document.createElement("span")
  label.className = "rte-collab-conflict-chooser-label"
  label.textContent = conflict.incoming
    ? `Also changed: “${preview(conflict.incoming)}”`
    : "Also changed here"
  host.appendChild(label)

  const actions = document.createElement("span")
  actions.className = "rte-collab-conflict-chooser-actions"
  const buttons: Array<{ choice: CollabConflictChoice; label: string; disabled?: boolean }> = [
    { choice: "keep", label: "Keep mine" },
    { choice: "incoming", label: "Use this", disabled: !conflict.incoming },
    { choice: "both", label: "Keep both", disabled: !conflict.incoming },
  ]
  for (const button of buttons) {
    const el = document.createElement("button")
    el.type = "button"
    el.dataset.choice = button.choice
    el.textContent = button.label
    el.disabled = Boolean(button.disabled)
    actions.appendChild(el)
  }
  host.appendChild(actions)

  host.addEventListener("mousedown", (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  host.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    const button = (event.target as HTMLElement | null)?.closest("button")
    const choice = button?.dataset.choice as CollabConflictChoice | undefined
    if (!choice || button?.disabled) return
    const view = getView()
    if (view && !applyChoice(view, conflict, choice)) return
    onResolve?.(conflict.id, choice)
  })
  return host
}

function buildDecorations(
  state: EditorState,
  conflicts: CollabConflictSpan[],
  getView: () => EditorView | null,
  onResolve: ((id: string, choice: CollabConflictChoice) => void) | null,
): DecorationSet {
  const decorations: Decoration[] = []
  for (const conflict of conflicts) {
    const range = findPlainTextRange(state.doc, conflict.current)
      ?? (conflict.expected ? findPlainTextRange(state.doc, conflict.expected) : null)
    if (!range) continue
    decorations.push(Decoration.inline(range.from, range.to, {
      class: "rte-collab-conflict",
      "data-collab-conflict-id": conflict.id,
    }))
    decorations.push(Decoration.widget(range.to, () => (
      createChooser(conflict, getView, onResolve)
    ), { side: 1, ignoreSelection: true, key: `collab-conflict:${conflict.id}` }))
  }
  return DecorationSet.create(state.doc, decorations)
}

function conflictSignature(conflicts: CollabConflictSpan[]): string {
  return conflicts
    .map((row) => `${row.id}:${row.current}:${row.incoming}:${row.expected ?? ""}`)
    .join("|")
}

export function syncCollabConflictDecorations(
  editor: Editor | null,
  conflicts: CollabConflictSpan[],
  onResolve: ((id: string, choice: CollabConflictChoice) => void) | null,
) {
  if (!editor) return
  const extension = editor.extensionManager.extensions.find((item) => item.name === "collabConflict")
  if (!extension) return
  const next = conflicts
  const signature = conflictSignature(next)
  if (extension.storage.signature === signature) {
    extension.storage.onResolve = onResolve
    return
  }
  extension.storage.conflicts = next
  extension.storage.onResolve = onResolve
  extension.storage.signature = signature
  editor.view.dispatch(editor.state.tr.setMeta(collabConflictKey, true).setMeta("addToHistory", false))
}

export const CollabConflictExtension = Extension.create<{
  conflicts: CollabConflictSpan[]
  onResolve: ((id: string, choice: CollabConflictChoice) => void) | null
}>({
  name: "collabConflict",
  addOptions() {
    return {
      conflicts: [],
      onResolve: null,
    }
  },
  addStorage() {
    return {
      conflicts: this.options.conflicts as CollabConflictSpan[],
      onResolve: this.options.onResolve,
      signature: "",
      view: null as EditorView | null,
    }
  },
  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin({
        key: collabConflictKey,
        state: {
          init: () => 0,
          apply(tr, value) {
            return tr.getMeta(collabConflictKey) == null ? value : value + 1
          },
        },
        view: (view) => {
          extension.storage.view = view
          return {
            destroy() {
              if (extension.storage.view === view) extension.storage.view = null
            },
          }
        },
        props: {
          decorations(state) {
            return buildDecorations(
              state,
              extension.storage.conflicts as CollabConflictSpan[],
              () => extension.storage.view as EditorView | null,
              extension.storage.onResolve as ((id: string, choice: CollabConflictChoice) => void) | null,
            )
          },
        },
      }),
    ]
  },
})
