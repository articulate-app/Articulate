"use client"

import { cn } from "@/lib/utils"
import { useCurrentUserStore } from "../../store/current-user"

function resolveCurrentUserFirstName(
  fullName: string | null | undefined,
  userMetadata: { full_name?: string | null } | null | undefined,
): string | null {
  const name = (fullName ?? userMetadata?.full_name ?? "").trim()
  if (!name) return null
  const firstName = name.split(/\s+/)[0]?.trim()
  return firstName || null
}

export function buildHomePaneGreeting(
  fullName: string | null | undefined,
  userMetadata: { full_name?: string | null } | null | undefined,
): string {
  const firstName = resolveCurrentUserFirstName(fullName, userMetadata)
  return firstName ? `Hello, ${firstName}` : "Hello"
}

/** Personalized Home screen title — only render on the All/Home left-pane object. */
export function HomePaneGreeting({ className }: { className?: string }) {
  const fullName = useCurrentUserStore((s) => s.fullName)
  const userMetadata = useCurrentUserStore((s) => s.userMetadata)

  return (
    <h1 className={cn("text-lg font-semibold text-gray-900", className)}>
      {buildHomePaneGreeting(fullName, userMetadata)}
    </h1>
  )
}
