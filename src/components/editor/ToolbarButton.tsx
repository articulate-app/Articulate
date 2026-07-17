import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tooltip?: string;
  shortcut?: string;
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ active, tooltip, shortcut, className, children, ...props }, ref) => {
    const button = (
      <button
        ref={ref}
        type="button"
        data-active={active ? "true" : undefined}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-sm",
          "text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          "data-[active=true]:bg-accent data-[active=true]:text-foreground",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );

    if (!tooltip) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          <span>{tooltip}</span>
          {shortcut && (
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {shortcut}
            </kbd>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }
);
ToolbarButton.displayName = "ToolbarButton";

export const ToolbarSeparator = () => (
  <div className="mx-1 h-5 w-px bg-border" />
);
