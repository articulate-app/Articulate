"use client"

import type { ReactNode } from "react"
import { ChevronLeft, Menu, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTasksSidebar } from "../../contexts/tasks-sidebar-context"

const ICON_BUTTON_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

/**
 * Persistent mobile chrome: sidebar toggle, optional back, title/center, and actions.
 * Used by list screens and detail views so navigation stays consistent without duplicated headers.
 */
export function MobileAppHeader({
  onBack,
  backLabel = "Back",
  title,
  subtitle,
  center,
  leadingExtra,
  onCreate,
  createLabel = "Create",
  actions,
  className,
}: {
  onBack?: () => void
  backLabel?: string
  title?: ReactNode
  subtitle?: ReactNode
  center?: ReactNode
  leadingExtra?: ReactNode
  onCreate?: () => void
  createLabel?: string
  actions?: ReactNode
  className?: string
}) {
  const sidebar = useTasksSidebar()

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex min-h-12 shrink-0 items-center gap-0.5 border-b border-gray-200 bg-white px-1.5 py-1",
        "pt-[max(0.25rem,env(safe-area-inset-top))]",
        className,
      )}
    >
      {sidebar?.onSidebarToggle ? (
        <button
          type="button"
          onClick={sidebar.onSidebarToggle}
          className={ICON_BUTTON_CLASS}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      ) : null}
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={ICON_BUTTON_CLASS}
          aria-label={backLabel}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}
      {onCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className={ICON_BUTTON_CLASS}
          aria-label={createLabel}
        >
          <Plus className="h-5 w-5" />
        </button>
      ) : null}
      {leadingExtra}
      <div className="min-w-0 flex-1 px-1">
        {center ? (
          center
        ) : title ? (
          <>
            <h1 className="truncate text-sm font-semibold text-gray-900">{title}</h1>
            {subtitle ? <div className="truncate text-xs text-gray-500">{subtitle}</div> : null}
          </>
        ) : null}
      </div>
      {actions}
    </header>
  )
}
