import * as React from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Highlighter,
  Undo2,
  Redo2,
  MessageSquarePlus,
  ChevronDown,
  Type,
} from "lucide-react";
import { ToolbarButton, ToolbarSeparator } from "./ToolbarButton";
import { AIMenu, type AIAction } from "./AIMenu";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface EditorToolbarProps {
  editor: Editor | null;
  onAddComment?: (selectedText: string) => string | Promise<string>;
  onAIAction?: (action: AIAction, selectedText: string) => Promise<string> | string;
  className?: string;
  sticky?: boolean;
}

const HEADINGS = [
  { label: "Paragraph", level: 0, icon: Type },
  { label: "Heading 1", level: 1, icon: Heading1 },
  { label: "Heading 2", level: 2, icon: Heading2 },
  { label: "Heading 3", level: 3, icon: Heading3 },
] as const;

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  onAddComment,
  onAIAction,
  className,
  sticky = true,
}) => {
  if (!editor) return null;

  const currentHeading =
    HEADINGS.find((h) =>
      h.level === 0 ? editor.isActive("paragraph") : editor.isActive("heading", { level: h.level })
    ) ?? HEADINGS[0];

  const setHeading = (level: number) => {
    if (level === 0) editor.chain().focus().setParagraph().run();
    else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
  };

  const promptLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url, target: "_blank" })
      .run();
  };

  const addComment = async () => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const text = editor.state.doc.textBetween(from, to, " ");
    const id = onAddComment ? await onAddComment(text) : `c_${Date.now()}`;
    editor.chain().focus().setComment(id).run();
  };

  return (
    <div
      className={cn(
        "z-20 flex w-full items-center gap-0.5 overflow-x-auto border-b border-border bg-background/80 px-2 py-1.5 backdrop-blur",
        sticky && "sticky top-0",
        className
      )}
    >
      <ToolbarButton
        tooltip="Undo"
        shortcut="Cmd+Z"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Redo"
        shortcut="Cmd+Shift+Z"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-foreground hover:bg-accent"
          >
            <currentHeading.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{currentHeading.label}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-44 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {HEADINGS.map((h) => (
            <DropdownMenuItem
              key={h.level}
              onSelect={() => setHeading(h.level)}
              className="gap-2"
            >
              <h.icon className="h-4 w-4 text-muted-foreground" />
              {h.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenu>

      <ToolbarSeparator />

      <ToolbarButton
        tooltip="Bold"
        shortcut="Cmd+B"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Italic"
        shortcut="Cmd+I"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Underline"
        shortcut="Cmd+U"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Highlight"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        tooltip="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Task list"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        tooltip="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Justify"
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        tooltip="Link"
        shortcut="Cmd+K"
        active={editor.isActive("link")}
        onClick={promptLink}
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Add comment"
        onClick={addComment}
        disabled={editor.state.selection.empty}
      >
        <MessageSquarePlus className="h-4 w-4" />
      </ToolbarButton>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <AIMenu editor={editor} onAction={onAIAction} />
      </div>
    </div>
  );
};
