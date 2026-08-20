"use client"

import type { ReactNode } from "react"
import { ChevronLeft, Menu, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTasksSidebar } from "../../contexts/tasks-sidebar-context"

export const MOBILE_CIRCLE_BUTTON_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"

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
        "sticky top-0 z-30 flex min-h-14 shrink-0 items-center gap-2 bg-white px-4 py-2",
        "relative pt-[max(0.5rem,env(safe-area-inset-top))]",
        className,
      )}
    >
      <div className="z-10 flex shrink-0 items-center gap-2">
        {sidebar?.onSidebarToggle ? (
          <button
            type="button"
            onClick={sidebar.onSidebarToggle}
            className={MOBILE_CIRCLE_BUTTON_CLASS}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
        ) : null}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={MOBILE_CIRCLE_BUTTON_CLASS}
            aria-label={backLabel}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
          </button>
        ) : null}
        {leadingExtra}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full items-end justify-center px-16 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex min-h-10 w-auto max-w-[min(56vw,14rem)] items-center justify-center">
          {center ? (
            center
          ) : title ? (
            <div className="min-w-0 text-center">
              <h1 className="truncate text-[15px] font-semibold tracking-tight text-gray-900">{title}</h1>
              {subtitle ? <div className="truncate text-xs text-gray-500">{subtitle}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="z-10 ml-auto flex shrink-0 items-center gap-2">
        {onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className={MOBILE_CIRCLE_BUTTON_CLASS}
            aria-label={createLabel}
          >
            <Plus className="h-5 w-5" strokeWidth={1.75} />
          </button>
        ) : null}
        {actions}
      </div>
    </header>
  )
}
