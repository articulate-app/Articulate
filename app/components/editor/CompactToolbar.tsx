import * as React from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Film,
  ChevronDown,
  Type,
  Heading2,
  Heading3,
  MessageSquarePlus,
  Sparkles,
} from "lucide-react";
import { ToolbarButton, ToolbarSeparator } from "./ToolbarButton";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useEditorLinkDialog } from "./useEditorLinkDialog";

export interface CompactToolbarProps {
  editor: Editor | null;
  onAddComment?: (selectedText: string) => string | Promise<string>;
  /** Attach the current selection to the AI chat composer. */
  onAskAi?: () => void;
  onInsertImage?: () => void;
  onInsertVideo?: () => void;
  onLinkClick?: () => void;
  className?: string;
  sticky?: boolean;
}

const BLOCK_TYPES = [
  { label: "Paragraph", level: 0, icon: Type },
  { label: "Heading 2", level: 2, icon: Heading2 },
  { label: "Heading 3", level: 3, icon: Heading3 },
] as const;

export const CompactToolbar: React.FC<CompactToolbarProps> = ({
  editor,
  onAddComment,
  onAskAi,
  onInsertImage,
  onInsertVideo,
  onLinkClick,
  className,
  sticky = true,
}) => {
  const { openLinkDialog, linkDialogNode } = useEditorLinkDialog(editor);
  const handleLinkClick = onLinkClick ?? openLinkDialog;

  if (!editor) return null;

  const currentBlockType =
    BLOCK_TYPES.find((block) =>
      block.level === 0
        ? editor.isActive("paragraph")
        : editor.isActive("heading", { level: block.level })
    ) ?? BLOCK_TYPES[0];

  const setBlockType = (level: number) => {
    const chain = editor.chain()
    if (level === 0) {
      chain.setParagraph()
    } else {
      chain.setHeading({ level: level as 2 | 3 })
    }
    if (editor.isFocused) {
      chain.run()
    } else {
      chain.focus().run()
    }
  };

  const promptLink = () => {
    handleLinkClick();
  };

  const addComment = async () => {
    if (!onAddComment) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const text = editor.state.doc.textBetween(from, to, " ");
    if (!text.trim()) return;
    await onAddComment(text);
  };

  const hasSelection = !editor.state.selection.empty;

  return (
    <>
    <div
      className={cn(
        "relative z-30 flex w-full flex-nowrap items-center gap-0.5 overflow-x-auto overflow-y-hidden border-b border-border bg-background/90 px-1.5 py-1 backdrop-blur",
        sticky && "sticky top-0",
        className
      )}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Block type"
            title="Block type"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-foreground hover:bg-accent"
            onMouseDown={(event) => event.preventDefault()}
          >
            <currentBlockType.icon className="h-4 w-4" />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="start"
            sideOffset={4}
            className="z-[120] w-44 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            {BLOCK_TYPES.map((block) => (
              <DropdownMenuItem
                key={block.level}
                onSelect={() => setBlockType(block.level)}
                className={cn("gap-2", currentBlockType.level === block.level && "bg-accent")}
              >
                <block.icon className="h-4 w-4 text-muted-foreground" />
                {block.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
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

      <ToolbarSeparator />

      <ToolbarButton tooltip="Link" active={editor.isActive("link")} onMouseDown={(event) => event.preventDefault()} onClick={promptLink}>
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      {(onInsertImage || onInsertVideo) ? <ToolbarSeparator /> : null}
      {onInsertImage ? (
        <ToolbarButton tooltip="Insert image" onClick={onInsertImage}>
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>
      ) : null}
      {onInsertVideo ? (
        <ToolbarButton tooltip="Insert video" onClick={onInsertVideo}>
          <Film className="h-4 w-4" />
        </ToolbarButton>
      ) : null}
      {(onAskAi || onAddComment) ? <ToolbarSeparator /> : null}
      {onAskAi ? (
        <ToolbarButton
          tooltip={hasSelection ? "Add selection to chat" : "Select text to add to chat"}
          disabled={!hasSelection}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onAskAi}
        >
          <Sparkles className="h-4 w-4" />
        </ToolbarButton>
      ) : null}
      {onAddComment ? (
        <ToolbarButton
          tooltip={hasSelection ? "Comment on selection" : "Select text to comment"}
          disabled={!hasSelection}
          onMouseDown={(event) => event.preventDefault()}
          onClick={addComment}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </ToolbarButton>
      ) : null}
    </div>
    {!onLinkClick ? linkDialogNode : null}
    </>
  );
};
