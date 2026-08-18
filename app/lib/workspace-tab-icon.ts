import type { LucideIcon } from "lucide-react"
import {
  Bookmark,
  Bot,
  FileText,
  FolderKanban,
  Globe2,
  Inbox,
  LayoutTemplate,
  Lightbulb,
  ListTodo,
  MessageSquare,
  Plus,
  Search,
  User,
  Users,
} from "lucide-react"

const WORKSPACE_TAB_ICONS: Record<string, LucideIcon> = {
  task: ListTodo,
  "task-list": ListTodo,
  suggestion: ListTodo,
  project: FolderKanban,
  "project-list": FolderKanban,
  user: User,
  "user-list": Users,
  team: Users,
  thread: MessageSquare,
  "mention-list": Inbox,
  artifact: FileText,
  "artifact-list": FileText,
  source: Bookmark,
  template: LayoutTemplate,
  "template-list": LayoutTemplate,
  research: Lightbulb,
  "keyword-research": Lightbulb,
  "prompt-research": Lightbulb,
  create: Plus,
  start: Plus,
  "search-results": Search,
  ai: Bot,
  "ai-thread-list": Bot,
  browser: Globe2,
  details: FileText,
}

export function resolveWorkspaceTabKind(tab: { kind?: string | null; key?: string | null }): string | null {
  const explicit = tab.kind?.trim()
  if (explicit) return explicit
  const key = tab.key?.trim() ?? ""
  const separator = key.indexOf(":")
  if (separator <= 0) return null
  return key.slice(0, separator)
}

export function resolveWorkspaceTabIcon(kind: string | null | undefined): LucideIcon | null {
  const normalized = kind?.trim() ?? ""
  if (!normalized) return null
  return WORKSPACE_TAB_ICONS[normalized] ?? null
}
