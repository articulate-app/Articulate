"use client"

import * as React from "react"
import type { Editor } from "@tiptap/react"
import {
  Columns3,
  Grid3x3,
  Minus,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ToolbarButton } from "./ToolbarButton"

const CELL_BG_PRESETS: Array<{ label: string; value: string | null; swatch: string }> = [
  { label: "None", value: null, swatch: "transparent" },
  { label: "Yellow", value: "#fef3c7", swatch: "#fef3c7" },
  { label: "Green", value: "#dcfce7", swatch: "#dcfce7" },
  { label: "Blue", value: "#dbeafe", swatch: "#dbeafe" },
  { label: "Gray", value: "#f3f4f6", swatch: "#f3f4f6" },
  { label: "Red", value: "#fee2e2", swatch: "#fee2e2" },
]

type TableToolbarControlsProps = {
  editor: Editor
}

/** TipTap table insert/edit controls shared by compact + full toolbars. */
export function TableToolbarControls({ editor }: TableToolbarControlsProps) {
  const inTable = editor.isActive("table")

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          tooltip={inTable ? "Edit table" : "Insert table"}
          active={inTable}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Grid3x3 className="h-4 w-4" />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-[120] w-56 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {!inTable ? (
            <DropdownMenuItem
              className="gap-2"
              onSelect={() =>
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
              }
            >
              <Grid3x3 className="h-4 w-4 text-muted-foreground" />
              Insert 3×3 table
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => editor.chain().focus().addColumnBefore().run()}
              >
                <Columns3 className="h-4 w-4 text-muted-foreground" />
                Add column before
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => editor.chain().focus().addColumnAfter().run()}
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                Add column after
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => editor.chain().focus().deleteColumn().run()}
              >
                <Minus className="h-4 w-4 text-muted-foreground" />
                Delete column
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => editor.chain().focus().addRowBefore().run()}
              >
                <Rows3 className="h-4 w-4 text-muted-foreground" />
                Add row before
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => editor.chain().focus().addRowAfter().run()}
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                Add row after
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => editor.chain().focus().deleteRow().run()}
              >
                <Minus className="h-4 w-4 text-muted-foreground" />
                Delete row
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => editor.chain().focus().toggleHeaderRow().run()}
              >
                Toggle header row
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Cell fill
              </div>
              {CELL_BG_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.label}
                  className="gap-2"
                  onSelect={() =>
                    editor.chain().focus().setCellAttribute("backgroundColor", preset.value).run()
                  }
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 rounded-sm border border-border",
                      preset.value == null && "bg-[linear-gradient(135deg,#fff_45%,#ef4444_46%,#ef4444_54%,#fff_55%)]",
                    )}
                    style={preset.value ? { backgroundColor: preset.swatch } : undefined}
                  />
                  {preset.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-destructive focus:text-destructive"
                onSelect={() => editor.chain().focus().deleteTable().run()}
              >
                <Trash2 className="h-4 w-4" />
                Delete table
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenu>
  )
}
