"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect } from "react"
import type { ReactNode } from "react"
import { UnifiedShellPage } from "./UnifiedShellPage"
import { canonicalizeWorkspaceAliasPath, objectRouteFromPathname } from "../../lib/search-routing"
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav"

const WORKSPACE_SECTION_PATHS = new Set([
  "/",
  "/tasks",
  "/projects",
  "/mentions",
  "/users",
  "/teams",
  "/ai-threads",
])

export function WorkspaceRouteSwitch({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Only fold recognized workspace alias paths (e.g. /tasks, /users/40) into
    // the canonical "/" shell. Standalone routes such as /settings must be left
    // alone so they don't get rewritten to /?object=all.
    const isWorkspaceAliasPath = pathname === "/" || objectRouteFromPathname(pathname) !== "all"
    if (!isWorkspaceAliasPath) return
    const next = canonicalizeWorkspaceAliasPath(pathname, new URLSearchParams(searchParams.toString()))
    if (!next.changed) return
    shallowReplaceSearchParams(next.pathname, next.searchParams, "workspace-alias-canonicalize")
  }, [pathname, searchParams])

  if (WORKSPACE_SECTION_PATHS.has(pathname)) {
    // Keep one mounted shell across section path changes so center/right panes
    // preserve component identity when pane params are unchanged.
    return <UnifiedShellPage />
  }
  return <>{children}</>
}
