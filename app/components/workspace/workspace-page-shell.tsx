"use client"

import * as React from "react"
import type { ReactNode, Ref } from "react"
import { CHAT_CONTENT_COLUMN_CLASS } from "../../lib/chat-content-column"
import { cn } from "@/lib/utils"

export type WorkspacePageShellProps = {
  title: string
  subtitle?: string | null
  /** Optional trailing control (e.g. Add project) — no close “x”. */
  actions?: ReactNode
  children: ReactNode
  /** Outer scroll root (single pane scrollbar on the right). */
  scrollRef?: Ref<HTMLDivElement>
  className?: string
  /**
   * `scroll` — one outer scrollbar (Projects / Inbox).
   * `fill` — header scrolls with page chrome; children fill remaining height (task table).
   */
  layout?: "scroll" | "fill"
  /** Override the reading column (default max-w-3xl). */
  columnClassName?: string
  /** Mark the outer scroll root for task-list virtualization (`data-task-scroll-container`). */
  taskScrollContainer?: boolean
}

/**
 * Shared page chrome for workspace list pages: headline + actions; either one
 * outer scrollbar or a fill-height body. Redundant descriptive subtitles are
 * intentionally omitted to keep list chrome compact.
 */
export function WorkspacePageShell({
  title,
  actions,
  children,
  scrollRef,
  className,
  layout = "scroll",
  columnClassName,
  taskScrollContainer = false,
}: WorkspacePageShellProps) {
  // `columnClassName` last so callers can override default width/padding (e.g. Tasks `px-6`).
  const column = cn(
    "flex flex-col gap-4 px-4",
    layout === "fill" ? "min-h-0 flex-1 py-6" : "py-6",
    columnClassName ?? CHAT_CONTENT_COLUMN_CLASS,
  )

  if (layout === "fill") {
    return (
      <div
        className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-white", className)}
      >
        <div className={column}>
          <div className="flex shrink-0 items-start justify-between gap-3">
            <h2 className="text-lg font-medium tracking-tight text-gray-900">{title}</h2>
            {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
          </div>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      {...(taskScrollContainer ? { "data-task-scroll-container": "" } : {})}
      className={cn("h-full min-h-0 overflow-auto bg-white [scrollbar-gutter:stable]", className)}
    >
      <div className={column}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium tracking-tight text-gray-900">{title}</h2>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
        {children}
      </div>
    </div>
  )
}

/** Title row used inside `layout="fill"` shells (Tasks). */
export function WorkspacePageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string | null
  actions?: ReactNode
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3">
      <div className={subtitle ? "space-y-1" : undefined}>
        <h2 className="text-lg font-medium tracking-tight text-gray-900">{title}</h2>
        {subtitle ? <p className="text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  )
}

/** Search field used under workspace page headlines. */
export function WorkspacePageSearchInput({
  value,
  onChange,
  placeholder,
  autoFocus = false,
  onCommit,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  autoFocus?: boolean
  /** Called on Enter (e.g. open full search results). */
  onCommit?: (value: string) => void
}) {
  return (
    <div className="relative shrink-0">
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          onCommit?.(event.currentTarget.value)
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        className="h-10 w-full rounded-md border border-gray-200 bg-white py-2 pl-3 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
      />
    </div>
  )
}

/** Black pill CTA for Add project / Add user / Add template on workspace list pages. */
export const WorkspacePageAddButton = React.forwardRef<
  HTMLButtonElement,
  {
    label: string
    onClick?: () => void
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function WorkspacePageAddButton({ label, onClick, className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full bg-black px-3.5 text-xs font-medium text-white transition-colors hover:bg-neutral-900",
        className,
      )}
      {...props}
    >
      {label}
    </button>
  )
})
