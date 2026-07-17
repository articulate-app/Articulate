import { describe, expect, it, vi } from "vitest"
import { applyEditorLinkChange, removeEditorLink } from "../app/components/editor/editor-link-commands"

function createMockEditor(initial: {
  from: number
  to: number
  text: string
  linkHref?: string
  linkTarget?: string | null
}) {
  const calls: string[] = []
  let from = initial.from
  let to = initial.to
  let text = initial.text
  let linkHref = initial.linkHref
  let linkTarget = initial.linkTarget ?? null

  const chain = () => {
    const api = {
      focus: () => api,
      setTextSelection: (range: { from: number; to: number }) => {
        calls.push("setTextSelection")
        from = range.from
        to = range.to
        return api
      },
      extendMarkRange: () => {
        calls.push("extendMarkRange")
        return api
      },
      unsetLink: () => {
        calls.push("unsetLink")
        linkHref = undefined
        return api
      },
      setLink: (attrs: { href: string; target: string | null }) => {
        calls.push(`setLink:${attrs.href}:${attrs.target ?? ""}`)
        linkHref = attrs.href
        linkTarget = attrs.target
        return api
      },
      deleteSelection: () => {
        calls.push("deleteSelection")
        text = ""
        return api
      },
      insertContent: (content: { type: string; text: string; marks?: Array<{ type: string; attrs: Record<string, unknown> }> }) => {
        calls.push(`insertContent:${content.text}`)
        text = content.text
        linkHref = content.marks?.[0]?.attrs?.href as string | undefined
        linkTarget = (content.marks?.[0]?.attrs?.target as string | null | undefined) ?? null
        to = from + text.length
        return api
      },
      run: () => true,
    }
    return api
  }

  const editor = {
    chain,
    isActive: (mark: string) => mark === "link" && Boolean(linkHref),
    getAttributes: (mark: string) =>
      mark === "link" ? { href: linkHref ?? "", target: linkTarget } : {},
    state: {
      selection: {
        get from() {
          return from
        },
        get to() {
          return to
        },
        get empty() {
          return from === to
        },
      },
      doc: {
        textBetween: (start: number, end: number) => text.slice(start, end),
      },
    },
  }

  return { editor: editor as never, calls }
}

describe("applyEditorLinkChange", () => {
  it("inserts linked text when selection is empty", () => {
    const { editor, calls } = createMockEditor({ from: 5, to: 5, text: "hello" })
    applyEditorLinkChange({
      editor,
      range: { from: 5, to: 5 },
      text: "Example",
      url: "https://example.com",
      openInNewTab: true,
    })
    expect(calls).toContain("insertContent:Example")
  })

  it("updates an existing link href", () => {
    const { editor, calls } = createMockEditor({
      from: 0,
      to: 7,
      text: "Example",
      linkHref: "https://old.example",
    })
    applyEditorLinkChange({
      editor,
      range: { from: 0, to: 7 },
      text: "Example",
      url: "https://new.example",
      openInNewTab: false,
    })
    expect(calls).toContain("setLink:https://new.example:")
  })

  it("replaces selected text when display text changes", () => {
    const { editor, calls } = createMockEditor({ from: 0, to: 3, text: "Old" })
    applyEditorLinkChange({
      editor,
      range: { from: 0, to: 3 },
      text: "New label",
      url: "https://example.com",
      openInNewTab: true,
    })
    expect(calls).toContain("deleteSelection")
    expect(calls).toContain("insertContent:New label")
  })
})

describe("removeEditorLink", () => {
  it("unsets the link mark for the saved range", () => {
    const { editor, calls } = createMockEditor({
      from: 0,
      to: 4,
      text: "Link",
      linkHref: "https://example.com",
    })
    removeEditorLink({ editor, range: { from: 0, to: 4 } })
    expect(calls).toContain("unsetLink")
  })
})
