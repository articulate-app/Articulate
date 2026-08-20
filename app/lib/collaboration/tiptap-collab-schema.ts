import { getSchema, type Extensions } from "@tiptap/core"
import { Node, mergeAttributes } from "@tiptap/core"
import Highlight from "@tiptap/extension-highlight"
import Link from "@tiptap/extension-link"
import Table from "@tiptap/extension-table"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import TableRow from "@tiptap/extension-table-row"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import StarterKit from "@tiptap/starter-kit"
import { CommentMark } from "../../components/editor/CommentMark"

export const TIPTAP_COLLAB_SCHEMA_VERSION = 1

const TableCellWithBackground = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-background-color")
          || (element as HTMLElement).style?.backgroundColor
          || null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {}
          return {
            "data-background-color": attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          }
        },
      },
    }
  },
})

const TableHeaderWithBackground = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-background-color")
          || (element as HTMLElement).style?.backgroundColor
          || null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {}
          return {
            "data-background-color": attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor}`,
          }
        },
      },
    }
  },
})

/** Schema-only AttachmentBlock: IDs/URLs/metadata, never file bytes. */
export const CollabAttachmentBlock = Node.create({
  name: "attachmentBlock",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      attachmentId: { default: "", parseHTML: (el) => el.getAttribute("data-attachment-id") ?? "" },
      mediaType: {
        default: "image",
        parseHTML: (el) => (el.getAttribute("data-media-type") === "video" ? "video" : "image"),
      },
      src: {
        default: "",
        parseHTML: (el) =>
          el.tagName === "IMG" || el.tagName === "VIDEO"
            ? el.getAttribute("src") ?? ""
            : el.querySelector("img,video")?.getAttribute("src") ?? "",
      },
      fileName: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-file-name") ?? el.querySelector("img")?.getAttribute("alt") ?? "",
      },
      widthPct: { default: 100, parseHTML: (el) => Number(el.getAttribute("data-width-pct") ?? 100) || 100 },
      commentPins: { default: "[]", parseHTML: (el) => el.getAttribute("data-comment-pins") ?? "[]" },
      alt: {
        default: "",
        parseHTML: (el) =>
          el.tagName === "IMG" ? el.getAttribute("alt") ?? "" : el.querySelector("img")?.getAttribute("alt") ?? "",
      },
      commentCount: { default: 0, parseHTML: (el) => Number(el.getAttribute("data-comment-count") ?? 0) || 0 },
    }
  },
  parseHTML() {
    return [
      { tag: "figure[data-attachment-id]" },
      {
        tag: "figure",
        getAttrs: (element) => {
          const host = element as HTMLElement
          return host.querySelector("img[src]") ? {} : false
        },
      },
      { tag: "img[src]" },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    const src = String(HTMLAttributes.src ?? "")
    const alt = String(HTMLAttributes.alt || HTMLAttributes.fileName || "")
    return [
      "figure",
      mergeAttributes({
        "data-attachment-id": HTMLAttributes.attachmentId,
        "data-media-type": HTMLAttributes.mediaType,
        "data-file-name": HTMLAttributes.fileName,
        "data-width-pct": String(HTMLAttributes.widthPct ?? 100),
        "data-comment-pins": HTMLAttributes.commentPins ?? "[]",
        "data-comment-count": String(HTMLAttributes.commentCount ?? 0),
      }),
      HTMLAttributes.mediaType === "video"
        ? ["video", { src, controls: "true" }]
        : ["img", { src, alt }],
    ]
  },
})

export function getCollaborativeTipTapExtensions(): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, history: false }),
    CollabAttachmentBlock,
    Table.configure({ resizable: false, HTMLAttributes: { class: "rte-table" } }),
    TableRow,
    TableHeaderWithBackground,
    TableCellWithBackground,
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight.configure({ multicolor: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CommentMark,
  ]
}

export function getCollaborativeTipTapSchema() {
  return getSchema(getCollaborativeTipTapExtensions())
}

export const KNOWN_COLLAB_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "attachmentBlock",
])

export const KNOWN_COLLAB_MARK_TYPES = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "highlight",
  "comment",
  "textAlign",
])
