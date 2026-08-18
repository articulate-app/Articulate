import { Node, mergeAttributes } from "@tiptap/core"
import Highlight from "@tiptap/extension-highlight"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import Table from "@tiptap/extension-table"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import TableRow from "@tiptap/extension-table-row"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import Underline from "@tiptap/extension-underline"
import StarterKit from "@tiptap/starter-kit"
import { CommentMark } from "../../../app/components/editor/CommentMark"

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

/** Schema-only attachment node — no React node view. Must stay aligned with RichTextEditor. */
const AttachmentBlockSchema = Node.create({
  name: "attachmentBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      attachmentId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-attachment-id") ?? "",
        renderHTML: (attributes) => ({ "data-attachment-id": attributes.attachmentId }),
      },
      mediaType: {
        default: "image",
        parseHTML: (element) =>
          element.getAttribute("data-media-type") === "video" ? "video" : "image",
        renderHTML: (attributes) => ({ "data-media-type": attributes.mediaType }),
      },
      src: { default: "" },
      fileName: { default: "" },
      widthPct: {
        default: 100,
        parseHTML: (element) => {
          const fromData = Number(element.getAttribute("data-width-pct"))
          return Number.isFinite(fromData) ? Math.max(20, Math.min(100, fromData)) : 100
        },
        renderHTML: (attributes) => ({ "data-width-pct": String(attributes.widthPct ?? 100) }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "figure[data-attachment-id]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-attachment-id": HTMLAttributes.attachmentId,
        "data-media-type": HTMLAttributes.mediaType,
      }),
    ]
  },
})

export function getArtifactCollaborationExtensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    AttachmentBlockSchema,
    Table.configure({ resizable: false, HTMLAttributes: { class: "rte-table" } }),
    TableRow,
    TableHeaderWithBackground,
    TableCellWithBackground,
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({ placeholder: "" }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight.configure({ multicolor: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CommentMark,
  ]
}
