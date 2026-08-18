import { resolveWorkspaceTabIcon } from "../../lib/workspace-tab-icon"

export function WorkspaceTabKindIcon({
  kind,
  className = "h-3 w-3",
}: {
  kind: string | null | undefined
  className?: string
}) {
  const Icon = resolveWorkspaceTabIcon(kind)
  if (!Icon) return null
  return <Icon className={className} aria-hidden />
}
