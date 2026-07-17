import * as React from "react";
import {
  GripVertical,
  ChevronDown,
  MoreHorizontal,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ---------- Types ----------
export type ComponentItem = {
  id: string;
  title: string;
  instructions?: string;
  output: string; // HTML string (rendered as preview when collapsed)
  savedAt: number; // epoch ms
};

export interface ComponentCardProps {
  component: ComponentItem;
  index: number;
  total: number;
  expanded: boolean;
  isDragging?: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<ComponentItem>) => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  /**
   * Render the editor body when expanded. The card supplies layout (border-top wrapper);
   * the consumer supplies the actual editor (e.g. RichTextEditor).
   */
  renderEditor?: () => React.ReactNode;
}

// ---------- Helpers ----------
const relTime = (ts: number) => {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

// ---------- Component ----------
export const ComponentCard: React.FC<ComponentCardProps> = ({
  component,
  index,
  total,
  expanded,
  isDragging,
  onToggle,
  onPatch,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
  renderEditor,
}) => {
  const [showInstr, setShowInstr] = React.useState(false);
  const hasInstr = !!component.instructions?.trim();

  return (
    <li
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative rounded-xl border border-border bg-card transition-all",
        "hover:border-foreground/20 hover:shadow-sm",
        expanded && "border-foreground/20 shadow-sm",
        isDragging && "opacity-40"
      )}
    >
      {/* Desktop drag handle (rail) */}
      <div
        draggable
        onDragStart={onDragStart}
        className="absolute -left-5 top-1/2 hidden h-8 w-5 -translate-y-1/2 cursor-grab items-center justify-center text-muted-foreground/0 transition-colors group-hover:text-muted-foreground active:cursor-grabbing sm:flex"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          onClick={onToggle}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform hover:text-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
          style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        <span className="hidden shrink-0 text-[11px] font-mono text-muted-foreground/60 sm:inline">
          {String(index + 1).padStart(2, "0")}
        </span>

        <input
          value={component.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/60"
          placeholder="Untitled component"
        />

        <span className="hidden shrink-0 text-[11px] text-muted-foreground/70 sm:inline">
          {relTime(component.savedAt)}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100 group-hover:opacity-100"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={index === 0} onClick={onMoveUp}>
              <ArrowUp className="mr-2 h-3.5 w-3.5" /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === total - 1} onClick={onMoveDown}>
              <ArrowDown className="mr-2 h-3.5 w-3.5" /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowInstr(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" /> {hasInstr ? "Edit" : "Add"} instructions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Instructions (only visible when expanded) */}
      {expanded && (hasInstr || showInstr) && (
        <div className="border-t border-border/60 bg-muted/30 px-3 py-2 sm:px-4">
          {showInstr ? (
            <textarea
              autoFocus
              value={component.instructions ?? ""}
              onChange={(e) => onPatch({ instructions: e.target.value })}
              onBlur={() => setShowInstr(false)}
              rows={2}
              className="w-full resize-none bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60"
              placeholder="Instructions for this component..."
            />
          ) : (
            <button
              onClick={() => setShowInstr(true)}
              className="line-clamp-2 w-full text-left text-xs text-muted-foreground hover:text-foreground"
            >
              {component.instructions}
            </button>
          )}
        </div>
      )}

      {/* Output */}
      {expanded ? (
        <div className="border-t border-border/60">
          {renderEditor ? (
            renderEditor()
          ) : (
            <textarea
              value={component.output}
              onChange={(e) => onPatch({ output: e.target.value })}
              rows={6}
              className="w-full resize-none bg-transparent px-3 py-3 text-sm outline-none sm:px-4"
              placeholder="Write the output..."
            />
          )}
        </div>
      ) : (
        <button
          onClick={onToggle}
          className="block w-full border-t border-border/60 px-3 py-2.5 text-left text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground sm:px-4"
        >
          <span
            className="line-clamp-2"
            dangerouslySetInnerHTML={{
              __html:
                component.output ||
                '<span class="opacity-60">Empty output — click to write</span>',
            }}
          />
        </button>
      )}
    </li>
  );
};

export default ComponentCard;
