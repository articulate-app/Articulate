"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  FolderOpen,
  Gauge,
  Lightbulb,
  Mail,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog"
import { UserProfileSettingsSection } from "./user-profile-settings-section"
import { UserTeamsSettingsSection } from "./user-teams-settings-section"
import { UserProjectsSettingsSection } from "./user-projects-settings-section"
import { UserSkillsSettingsSection } from "./user-skills-settings-section"
import { UserCommunicationSettingsSection } from "./user-communication-settings-section"
import { UserAiLimitsTab } from "./user-ai-limits-tab"
import { UserCapacitySettingsSection } from "./user-capacity-settings-section"
import { getUserTeamsWithRoles } from "../../lib/services/userSkillsAndMemberships"

export type UserSettingsCategory =
  | "profile"
  | "teams"
  | "projects"
  | "skills"
  | "communication"
  | "ai-limits"
  | "capacity"

const CATEGORIES: { id: UserSettingsCategory; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Name & photo", icon: User },
  { id: "teams", label: "Teams", icon: Users },
  { id: "projects", label: "Projects", icon: FolderOpen },
  { id: "skills", label: "Skills", icon: Lightbulb },
  { id: "communication", label: "Communication", icon: Mail },
  { id: "ai-limits", label: "AI limits", icon: Sparkles },
  { id: "capacity", label: "Capacity", icon: Gauge },
]

interface UserSettingsPanelProps {
  open: boolean
  onClose?: () => void
  userId: number
  initialCategory?: UserSettingsCategory
  onOpenTeam?: (teamId: number) => void
  onOpenProject?: (projectId: number) => void
}

export function UserSettingsPanel({
  open,
  onClose,
  userId,
  initialCategory = "profile",
  onOpenTeam,
  onOpenProject,
}: UserSettingsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<UserSettingsCategory>(initialCategory)
  const [isProfileDirty, setIsProfileDirty] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const pendingCloseActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (open) {
      setActiveCategory(initialCategory)
      setIsProfileDirty(false)
    }
  }, [open, initialCategory])

  const { data: teams } = useQuery({
    queryKey: ["user-teams", userId],
    queryFn: async () => {
      const result = await getUserTeamsWithRoles(userId)
      if (result.error) throw result.error
      return result.data || []
    },
    enabled: open && activeCategory === "ai-limits",
  })

  const requestLeave = useCallback(
    (action: () => void) => {
      if (!isProfileDirty || activeCategory !== "profile") {
        action()
        return
      }
      pendingCloseActionRef.current = action
      setShowDiscardDialog(true)
    },
    [activeCategory, isProfileDirty],
  )

  const handleClose = useCallback(() => {
    requestLeave(() => onClose?.())
  }, [onClose, requestLeave])

  const handleCategoryChange = useCallback(
    (next: UserSettingsCategory) => {
      if (next === activeCategory) return
      requestLeave(() => {
        setIsProfileDirty(false)
        setActiveCategory(next)
      })
    },
    [activeCategory, requestLeave],
  )

  const confirmDiscard = useCallback(() => {
    const action = pendingCloseActionRef.current
    pendingCloseActionRef.current = null
    setShowDiscardDialog(false)
    setIsProfileDirty(false)
    action?.()
  }, [])

  const cancelDiscard = useCallback(() => {
    pendingCloseActionRef.current = null
    setShowDiscardDialog(false)
  }, [])

  useEffect(() => {
    if (!open || !isProfileDirty || activeCategory !== "profile") return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [open, isProfileDirty, activeCategory])

  const activeLabel = CATEGORIES.find((c) => c.id === activeCategory)?.label ?? "Settings"

  const renderCategory = () => {
    switch (activeCategory) {
      case "profile":
        return (
          <UserProfileSettingsSection userId={userId} onDirtyChange={setIsProfileDirty} />
        )
      case "teams":
        return <UserTeamsSettingsSection userId={userId} onOpenTeam={onOpenTeam} />
      case "projects":
        return <UserProjectsSettingsSection userId={userId} onOpenProject={onOpenProject} />
      case "skills":
        return <UserSkillsSettingsSection userId={userId} />
      case "communication":
        return <UserCommunicationSettingsSection userId={userId} />
      case "ai-limits":
        return <UserAiLimitsTab userId={userId} teams={teams} />
      case "capacity":
        return <UserCapacitySettingsSection userId={userId} />
      default:
        return null
    }
  }

  return (
    <>
      <DialogPrimitive.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClose()
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => {
              if (isProfileDirty && activeCategory === "profile") {
                event.preventDefault()
                handleClose()
              }
            }}
            onPointerDownOutside={(event) => {
              if (isProfileDirty && activeCategory === "profile") {
                event.preventDefault()
                handleClose()
              }
            }}
            className="fixed left-1/2 top-1/2 z-50 flex h-[min(85vh,720px)] w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl duration-200 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <DialogPrimitive.Title className="sr-only">User settings</DialogPrimitive.Title>

            <aside className="flex w-52 shrink-0 flex-col border-r border-gray-100 bg-gray-50/60 p-3">
              <div className="px-2 pb-2 pt-1 text-base font-semibold text-gray-900">
                User settings
              </div>
              <nav className="mt-1 space-y-0.5">
                {CATEGORIES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleCategoryChange(id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      activeCategory === id
                        ? "bg-gray-200/70 font-medium text-gray-900"
                        : "text-gray-600 hover:bg-gray-100",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </nav>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h2 className="truncate text-sm font-medium text-gray-900">{activeLabel}</h2>
                <button
                  type="button"
                  aria-label="Close user settings"
                  onClick={handleClose}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-6 py-5">{renderCategory()}</div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <AlertDialog
        open={showDiscardDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) cancelDiscard()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Do you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscard}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
