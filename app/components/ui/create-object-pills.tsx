"use client"

import type { ComponentType } from "react"
import { Bot, FolderKanban, ListTodo, MessageSquare, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HeaderCreateType } from "./use-header-create-flow"

export type CreateObjectPillId = HeaderCreateType | "ai"

export const CREATE_OBJECT_PILL_OPTIONS: Array<{
  id: CreateObjectPillId
  label: string
  icon: ComponentType<{ className?: string }>
}> = [
  { id: "task", label: "Task", icon: ListTodo },
  { id: "project", label: "Project", icon: FolderKanban },
  { id: "user", label: "User", icon: UserRound },
  { id: "thread", label: "Thread", icon: MessageSquare },
  { id: "ai", label: "AI chat", icon: Bot },
]

interface CreateObjectPillsProps {
  value: HeaderCreateType
  onValueChange: (id: CreateObjectPillId) => void
  className?: string
}

/**
 * Object-type pills for create surfaces (desktop popup + mobile drawer). Task is the default
 * selection; AI chat delegates to the caller (opens AI pane / new thread, not an inline form).
 */
export function CreateObjectPills({ value, onValueChange, className }: CreateObjectPillsProps) {
  return (
    <div
      className={cn(
        "scrollbar-hide shrink-0 overflow-x-auto border-b border-gray-200 px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-nowrap gap-2">
        {CREATE_OBJECT_PILL_OPTIONS.map(({ id, label, icon: Icon }) => {
          const isActive = id !== "ai" && value === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onValueChange(id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              )}
              aria-pressed={isActive}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
