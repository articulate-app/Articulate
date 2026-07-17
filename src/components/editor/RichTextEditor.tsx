import * as React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { CommentMark } from "./CommentMark";
import { EditorToolbar } from "./EditorToolbar";
import { CompactToolbar } from "./CompactToolbar";
import { BubbleToolbar } from "./BubbleToolbar";
import type { AIAction } from "./AIMenu";
import { useIsMobile } from "../../hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  onAddComment?: (selectedText: string) => string | Promise<string>;
  onAIAction?: (action: AIAction, selectedText: string) => Promise<string> | string;
  onCommentClick?: (id: string) => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = "Start writing, or select text to use AI...",
  className,
  editorClassName,
  onAddComment,
  onAIAction,
  onCommentClick,
}) => {
  const isMobile = useIsMobile();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CommentMark,
    ],
    content: value ?? "",
    onUpdate: ({ editor: localEditor }) => onChange?.(localEditor.getHTML()),
    editorProps: {
      attributes: {
        class: cn(
          "rte-prose focus:outline-none min-h-[300px] px-6 py-6",
          editorClassName
        ),
      },
      handleClickOn: (_view, _pos, _node, _nPos, event) => {
        const target = event.target as HTMLElement;
        const el = target.closest<HTMLElement>("[data-comment-id]");
        if (el && onCommentClick) {
          onCommentClick(el.dataset.commentId!);
          return true;
        }
        return false;
      },
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value ?? "";
    if (current === next) return;
    editor.commands.setContent(next, false);
  }, [editor, value]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className
      )}
    >
      {isMobile ? (
        <CompactToolbar editor={editor} onAddComment={onAddComment} onAIAction={onAIAction} />
      ) : (
        <EditorToolbar editor={editor} onAddComment={onAddComment} onAIAction={onAIAction} />
      )}
      <BubbleToolbar editor={editor} onAddComment={onAddComment} onAIAction={onAIAction} />
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
