"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { AddDashedButton, type AddDashedButtonProps } from "../ui/add-dashed-button"

export { AddDashedButton }

export type AddComponentButtonProps = AddDashedButtonProps

export const AddComponentButton = React.forwardRef<HTMLButtonElement, AddComponentButtonProps>(
  ({ label = "Add component", ...props }, ref) => (
    <AddDashedButton ref={ref} label={label} {...props} />
  ),
)
AddComponentButton.displayName = "AddComponentButton"

interface AddComponentEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  onAdd: () => void
  title?: string
  description?: string
  ctaLabel?: string
}

export const AddComponentEmptyState = React.forwardRef<HTMLDivElement, AddComponentEmptyStateProps>(
  (
    {
      onAdd,
      title = "No components yet",
      description = "Add a component to start writing instructions and capturing output for this briefing.",
      ctaLabel = "Add component",
      className,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-16 text-center",
        className,
      )}
      {...props}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
      >
        <Plus className="h-3.5 w-3.5" />
        {ctaLabel}
      </button>
    </div>
  ),
)
AddComponentEmptyState.displayName = "AddComponentEmptyState"
