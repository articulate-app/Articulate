import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddComponentButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export const AddComponentButton = React.forwardRef<HTMLButtonElement, AddComponentButtonProps>(({
  label = "Add component",
  className,
  type = "button",
  ...props
}, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      "mt-3 inline-flex w-full items-center justify-center gap-1.5",
      "rounded-lg border border-dashed border-border py-2.5",
      "text-sm text-muted-foreground transition-colors",
      "hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground",
      className,
    )}
    {...props}
  >
    <Plus className="h-3.5 w-3.5" />
    {label}
  </button>
));
AddComponentButton.displayName = "AddComponentButton";

interface AddComponentEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  onAdd: () => void;
  title?: string;
  description?: string;
  ctaLabel?: string;
}

export const AddComponentEmptyState = React.forwardRef<HTMLDivElement, AddComponentEmptyStateProps>(({
  onAdd,
  title = "No components yet",
  description = "Add a component to start writing instructions and capturing output for this briefing.",
  ctaLabel = "Add component",
  className,
  ...props
}, ref) => (
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
));
AddComponentEmptyState.displayName = "AddComponentEmptyState";
