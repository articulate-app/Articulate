import * as React from "react";
import type { Editor } from "@tiptap/react";
import {
  Sparkles,
  Wand2,
  Languages,
  ListChecks,
  Pencil,
  ChevronDown,
  Loader2,
} from "lucide-react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type AIAction =
  | "improve"
  | "shorten"
  | "expand"
  | "summarize"
  | "fix-grammar"
  | "translate"
  | "continue";

export interface AIMenuProps {
  editor: Editor;
  onAction?: (action: AIAction, selectedText: string) => Promise<string> | string;
  className?: string;
  compact?: boolean;
}

const ACTIONS: { key: AIAction; label: string; icon: React.ElementType }[] = [
  { key: "improve", label: "Improve writing", icon: Wand2 },
  { key: "fix-grammar", label: "Fix spelling & grammar", icon: Pencil },
  { key: "shorten", label: "Make shorter", icon: ListChecks },
  { key: "expand", label: "Make longer", icon: ListChecks },
  { key: "summarize", label: "Summarize", icon: ListChecks },
  { key: "translate", label: "Translate to English", icon: Languages },
  { key: "continue", label: "Continue writing", icon: Sparkles },
];

export const AIMenu: React.FC<AIMenuProps> = ({
  editor,
  onAction,
  className,
  compact,
}) => {
  const [loading, setLoading] = React.useState(false);

  const run = async (action: AIAction) => {
    const { from, to, empty } = editor.state.selection;
    const selected = empty ? editor.getText() : editor.state.doc.textBetween(from, to, " ");
    if (!selected.trim() && action !== "continue") return;

    setLoading(true);
    try {
      let result: string;
      if (onAction) {
        result = await onAction(action, selected);
      } else {
        result = `${selected}${action === "continue" ? " ..." : ""}`;
      }
      if (empty || action === "continue") {
        editor.chain().focus().insertContent(result).run();
      } else {
        editor.chain().focus().deleteRange({ from, to }).insertContent(result).run();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium",
            "bg-muted text-foreground",
            "transition-colors hover:bg-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-60",
            className
          )}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {!compact && <span>Ask AI</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPrimitive.Content
        align="end"
        sideOffset={4}
        className="z-50 w-60 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      >
        <DropdownMenuLabel className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          AI actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIONS.map(({ key, label, icon: Icon }) => (
          <DropdownMenuItem
            key={key}
            onSelect={(e) => {
              e.preventDefault();
              void run(key);
            }}
            className="gap-2"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuPrimitive.Content>
    </DropdownMenu>
  );
};
