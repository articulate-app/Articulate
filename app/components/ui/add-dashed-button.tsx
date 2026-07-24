"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export type AddDashedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string
}

/**
 * Shared dashed “Add …” control used across entity lists
 * (components, keywords, attachments, reviews, etc.).
 */
export const AddDashedButton = React.forwardRef<HTMLButtonElement, AddDashedButtonProps>(
  ({ label = "Add", className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "mt-3 inline-flex w-full items-center justify-center gap-1.5",
        "rounded-lg border border-dashed border-border py-2.5",
        "text-sm text-muted-foreground transition-colors",
        "hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  ),
)
AddDashedButton.displayName = "AddDashedButton"
