"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { PopoverContent } from "./popover"
import { getImageUrl } from "../../lib/public-media"
import { cn } from "@/lib/utils"

// Hover/focus timing: a short open delay avoids flicker on quick passes; the close grace period lets
// the pointer travel from the trigger into the card without it dismissing.
const OPEN_DELAY = 280
const CLOSE_DELAY = 160

export interface HoverCardUser {
  full_name?: string | null
  email?: string | null
  photo?: string | null
  role?: string | null
}

function getInitials(name?: string | null) {
  if (!name || typeof name !== "string") return "?"
  const parts = name.trim().split(" ").filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Comfortable, app-consistent user card shown on hover/keyboard-focus of a trigger (e.g. an avatar).
 * Built on the shared Radix Popover primitive, so it portals (no clipping inside scroll containers)
 * and auto-flips on collision in any layout. Reuse this anywhere a richer-than-tooltip user preview
 * is needed instead of building a one-off tooltip style.
 */
export function UserHoverCard({
  user,
  children,
  side = "top",
  align = "center",
  className,
}: {
  user: HoverCardUser
  children: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  align?: "start" | "center" | "end"
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearOpen = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }
  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  React.useEffect(
    () => () => {
      clearOpen()
      clearClose()
    },
    [],
  )

  const scheduleOpen = () => {
    clearClose()
    if (open) return
    clearOpen()
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY)
  }
  const scheduleClose = () => {
    clearOpen()
    clearClose()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY)
  }
  const closeNow = () => {
    clearOpen()
    clearClose()
    setOpen(false)
  }

  const name = user.full_name || user.email || "User"
  const photoUrl = getImageUrl(user.photo || undefined)
  const showEmail = !!user.email && user.email !== name

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        // Hover/focus drive opening; only honor programmatic closes (e.g. Escape, collision dismiss).
        if (!next) closeNow()
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <span
          className="inline-flex"
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          onFocus={scheduleOpen}
          onBlur={scheduleClose}
          onPointerDown={closeNow}
        >
          {children}
        </span>
      </PopoverPrimitive.Anchor>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        // Hover preview: never steal focus from the page/trigger.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={clearClose}
        onMouseLeave={scheduleClose}
        className={cn("z-[300] w-64 p-3", className)}
      >
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={name}
              className="h-12 w-12 shrink-0 rounded-full border border-gray-200 object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-muted text-sm font-semibold uppercase text-gray-700">
              {getInitials(name)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-gray-900">{name}</div>
            {user.role ? <div className="truncate text-xs text-gray-500">{user.role}</div> : null}
            {showEmail ? <div className="truncate text-xs text-gray-500">{user.email}</div> : null}
          </div>
        </div>
      </PopoverContent>
    </PopoverPrimitive.Root>
  )
}
