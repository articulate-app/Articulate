"use client"

import * as React from "react"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu"
import { MobileAppHeader } from "./mobile-app-header"

/**
 * A single action surfaced in a mobile detail view's top-right overflow ("...") menu. Actions reuse
 * the same handlers as their desktop counterparts so behavior, state, and URL updates stay identical.
 */
export type MobileDetailAction = {
  id: string
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  destructive?: boolean
  /** Render a divider above this item (used to group destructive actions). */
  separatorBefore?: boolean
}

/**
 * Standalone overflow menu — a top-right "..." trigger that reveals `actions`. Use this when a detail
 * view already owns its header layout and only needs the consolidated action menu (e.g. TaskDetails).
 */
export function ObjectActionsOverflow({
  actions,
  align = "end",
  triggerClassName,
  ariaLabel = "More actions",
}: {
  actions: MobileDetailAction[]
  align?: "start" | "center" | "end"
  triggerClassName?: string
  ariaLabel?: string
}) {
  if (actions.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500",
            triggerClassName,
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[12rem]">
        {actions.map((action) => (
          <React.Fragment key={action.id}>
            {action.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={action.disabled}
              onClick={action.onSelect}
              className={cn(action.destructive && "text-red-600 focus:text-red-600")}
            >
              {action.icon ? (
                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">{action.icon}</span>
              ) : null}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Consistent mobile detail header: a left back button, a stable (truncating) title/subtitle block, an
 * optional inline `rightSlot` for high-frequency controls, and a top-right "..." overflow menu. The
 * title always occupies the same position regardless of how many actions exist so it never shifts
 * between object types.
 */
export function MobileDetailHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  actions = [],
  rightSlot,
  leadingSlot,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onBack?: () => void
  backLabel?: string
  actions?: MobileDetailAction[]
  rightSlot?: React.ReactNode
  /** Optional identity marker (e.g. avatar) shown before the title block. */
  leadingSlot?: React.ReactNode
  className?: string
}) {
  return (
    <MobileAppHeader
      onBack={onBack}
      backLabel={backLabel}
      title={title}
      subtitle={subtitle}
      leadingExtra={leadingSlot}
      actions={
        <>
          {rightSlot}
          <ObjectActionsOverflow actions={actions} />
        </>
      }
      className={className}
    />
  )
}
