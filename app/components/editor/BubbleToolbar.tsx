import * as React from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Link as LinkIcon,
  MessageSquarePlus,
  Highlighter,
  Type,
  Heading1,
  Heading2,
  Heading3,
  ChevronDown,
} from "lucide-react";
import { ToolbarButton, ToolbarSeparator } from "./ToolbarButton";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorLinkDialog } from "./useEditorLinkDialog";

export interface BubbleToolbarProps {
  editor: Editor | null;
  onAddComment?: (selectedText: string) => string | Promise<string>;
  onLinkClick?: () => void;
}

const HEADINGS = [
  { label: "Paragraph", level: 0, icon: Type },
  { label: "Heading 1", level: 1, icon: Heading1 },
  { label: "Heading 2", level: 2, icon: Heading2 },
  { label: "Heading 3", level: 3, icon: Heading3 },
] as const;

export const BubbleToolbar: React.FC<BubbleToolbarProps> = ({
  editor,
  onAddComment,
  onLinkClick,
}) => {
  const { openLinkDialog, linkDialogNode } = useEditorLinkDialog(editor);
  const handleLinkClick = onLinkClick ?? openLinkDialog;

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
    handleLinkClick();
  };

  const addComment = async () => {
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const text = editor.state.doc.textBetween(from, to, " ");
    const id = onAddComment ? await onAddComment(text) : `c_${Date.now()}`;
    editor.chain().focus().setComment(id).run();
  };

  return (
    <>
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: localEditor, state }) => {
        const { from, to } = state.selection;
        return from !== to && localEditor.isEditable;
      }}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-foreground hover:bg-accent"
          >
            <currentHeading.icon className="h-4 w-4" />
            <span className="hidden md:inline">{currentHeading.label}</span>
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
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Strike"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Highlight"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
      >
        <Highlighter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton tooltip="Link" active={editor.isActive("link")} onMouseDown={(event) => event.preventDefault()} onClick={promptLink}>
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton tooltip="Comment" onClick={addComment}>
        <MessageSquarePlus className="h-4 w-4" />
      </ToolbarButton>
    </BubbleMenu>
    {!onLinkClick ? linkDialogNode : null}
    </>
  );
};
