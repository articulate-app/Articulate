"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  CreditCard,
  FileText,
  Layers,
  Loader2,
  Settings2,
  Sparkles,
  Target,
  Users,
  X,
  Globe2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { toast } from "../ui/use-toast"
import { ToastAction } from "../ui/toast"
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
import { PUBLIC_MEDIA_BUCKET, getImageUrl, uploadImage } from "../../lib/public-media"
import {
  getProjectOverview,
  updateProjectOverview,
  type ProjectOverview,
} from "../../lib/services/projects-briefing"
import { OverviewConfigDropdowns } from "./OverviewConfigDropdowns"
import { ProjectStatusesSection } from "./ProjectStatusesSection"
import { ProjectOverviewPlanningSection } from "./planning/ProjectOverviewPlanningSection"
import { BillingTab } from "./BillingTab"
import { LibraryTab } from "../project-briefings/LibraryTab"
import { ProjectTeamSettingsPanel } from "./project-team-settings-panel"
import { ProjectWebsiteIndexSection } from "./project-website-index-section"
import { ProjectBrandKitSection } from "./project-brand-kit-section"
import {
  PROJECT_SITE_INDEX_STATUS_QUERY_KEY,
  fetchProjectSiteIndexStatus,
  refreshProjectSiteIndex,
} from "@/lib/services/project-site-index"

export type ProjectSettingsCategory =
  | "details"
  | "configuration"
  | "status"
  | "planning"
  | "billing"
  | "website-index"
  | "team"
  | "components"

const CATEGORIES: { id: ProjectSettingsCategory; label: string; icon: typeof Target }[] = [
  { id: "details", label: "Details", icon: Target },
  { id: "configuration", label: "Configuration", icon: Settings2 },
  { id: "status", label: "Status", icon: FileText },
  { id: "planning", label: "AI planning", icon: Sparkles },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "website-index", label: "Website index", icon: Globe2 },
  { id: "team", label: "Team", icon: Users },
  { id: "components", label: "Components", icon: Layers },
]

const DETAIL_FIELDS = [
  "name",
  "description",
  "color",
  "goal",
  "target_audience",
  "editorial_line",
  "project_url",
] as const

type DetailField = (typeof DETAIL_FIELDS)[number]

interface ProjectSettingsPanelProps {
  open: boolean
  onClose?: () => void
  projectId: number
  initialCategory?: ProjectSettingsCategory
}

function normalizeDetailValue(field: DetailField, value: unknown): string | null {
  if (field === "name") return String(value ?? "").trim()
  if (field === "color") return String(value ?? "").trim() || null
  if (field === "project_url") return String(value ?? "").trim() || null
  const trimmed = String(value ?? "").trim()
  return trimmed || null
}

function getDetailSnapshot(source: Partial<ProjectOverview> | null | undefined) {
  return {
    name: normalizeDetailValue("name", source?.name),
    description: normalizeDetailValue("description", source?.description),
    color: normalizeDetailValue("color", source?.color),
    goal: normalizeDetailValue("goal", source?.goal),
    target_audience: normalizeDetailValue("target_audience", source?.target_audience),
    editorial_line: normalizeDetailValue("editorial_line", source?.editorial_line),
    project_url: normalizeDetailValue("project_url", source?.project_url),
  }
}

export function ProjectSettingsPanel({
  open,
  onClose,
  projectId,
  initialCategory = "details",
}: ProjectSettingsPanelProps) {
  const queryClient = useQueryClient()
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [activeCategory, setActiveCategory] = useState<ProjectSettingsCategory>(initialCategory)
  const [formData, setFormData] = useState<Partial<ProjectOverview>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const pendingCloseActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (open) setActiveCategory(initialCategory)
  }, [open, initialCategory])

  // DropdownMenu (e.g. sidebar "Definitions") can leave body pointer-events:none when
  // this dialog opens from a menu item — same race as settings-panel / billing modals.
  useEffect(() => {
    if (!open) return

    const clearPointerEvents = () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = ""
      }
    }

    clearPointerEvents()
    const clearTimers = [
      window.setTimeout(clearPointerEvents, 0),
      window.setTimeout(clearPointerEvents, 50),
      window.setTimeout(clearPointerEvents, 150),
    ]

    return () => {
      clearTimers.forEach((timerId) => window.clearTimeout(timerId))
      clearPointerEvents()
    }
  }, [open])

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-overview", projectId],
    queryFn: async () => {
      const result = await getProjectOverview(projectId)
      if (result.error) throw result.error
      return result.data
    },
    enabled: open,
  })

  useEffect(() => {
    if (data) setFormData(data)
  }, [data])

  const isDirty = useMemo(() => {
    if (!data) return false
    const current = getDetailSnapshot(formData)
    const original = getDetailSnapshot(data)
    return DETAIL_FIELDS.some((field) => current[field] !== original[field])
  }, [data, formData])

  const requestLeave = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action()
        return
      }
      pendingCloseActionRef.current = action
      setShowDiscardDialog(true)
    },
    [isDirty],
  )

  const handleClose = useCallback(() => {
    requestLeave(() => onClose?.())
  }, [onClose, requestLeave])

  const handleCategoryChange = useCallback(
    (next: ProjectSettingsCategory) => {
      if (next === activeCategory) return
      requestLeave(() => {
        if (data) setFormData(data)
        setActiveCategory(next)
      })
    },
    [activeCategory, data, requestLeave],
  )

  const confirmDiscard = useCallback(() => {
    if (data) setFormData(data)
    const action = pendingCloseActionRef.current
    pendingCloseActionRef.current = null
    setShowDiscardDialog(false)
    action?.()
  }, [data])

  const cancelDiscard = useCallback(() => {
    pendingCloseActionRef.current = null
    setShowDiscardDialog(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!data || isSaving) return

    const snapshot = getDetailSnapshot(formData)
    if (!snapshot.name) {
      toast({
        title: "Error",
        description: "Label is required",
        variant: "destructive",
      })
      return
    }

    const original = getDetailSnapshot(data)
    const patch: Partial<{
      name: string
      description: string | null
      color: string | null
      goal: string | null
      target_audience: string | null
      editorial_line: string | null
      project_url: string | null
    }> = {}

    for (const field of DETAIL_FIELDS) {
      if (snapshot[field] !== original[field]) {
        if (field === "name") {
          patch.name = snapshot.name
        } else {
          patch[field] = snapshot[field]
        }
      }
    }

    if (Object.keys(patch).length === 0) return

    setIsSaving(true)
    try {
      const { error: updateError } = await updateProjectOverview(projectId, patch)
      if (updateError) {
        toast({
          title: "Error",
          description: updateError.message || "Failed to save changes",
          variant: "destructive",
        })
        return
      }

      const nextData = { ...data, ...patch }
      queryClient.setQueryData(["project-overview", projectId], nextData)
      setFormData(nextData)
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] })
      toast({
        title: "Saved",
        description: "Project preferences updated.",
      })

      // Non-blocking: offer an initial website-index refresh when a URL was just saved
      // and no index exists yet.
      const savedUrl = typeof patch.project_url === "string" ? patch.project_url.trim() : ""
      if (savedUrl) {
        void (async () => {
          try {
            const status = await fetchProjectSiteIndexStatus(projectId)
            const hasIndex =
              (status.active_page_count ?? 0) > 0
              || Boolean(status.latest_run)
            if (hasIndex) return
            toast({
              title: "Index this website?",
              description: "Map and enrich pages for natural internal linking.",
              action: (
                <ToastAction
                  altText="Refresh website index"
                  onClick={() => {
                    setActiveCategory("website-index")
                    void (async () => {
                      const result = await refreshProjectSiteIndex({ projectId })
                      await queryClient.invalidateQueries({
                        queryKey: [PROJECT_SITE_INDEX_STATUS_QUERY_KEY, projectId],
                      })
                      if (!result.ok) {
                        toast({
                          title: "Website index refresh failed",
                          description: result.error ?? "Please try again from Website index.",
                          variant: "destructive",
                        })
                        return
                      }
                      toast({
                        title: "Website index refreshed",
                        description: `Discovered ${result.discovered_count ?? 0} pages.`,
                      })
                    })()
                  }}
                >
                  Refresh now
                </ToastAction>
              ),
            })
          } catch {
            /* status check is best-effort; saving already succeeded */
          }
        })()
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save changes",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [data, formData, isSaving, projectId, queryClient, setActiveCategory])

  const handleLogoUpload = useCallback(
    async (file: File) => {
      setIsLogoUploading(true)
      try {
        const { storagePath, error: uploadError } = await uploadImage({
          bucket: PUBLIC_MEDIA_BUCKET,
          path: `projects/${projectId}`,
          file,
          upsert: true,
        })
        if (uploadError || !storagePath) throw uploadError ?? new Error("Upload failed")

        const { error: updateError } = await updateProjectOverview(projectId, {
          logo: storagePath,
        })
        if (updateError) throw updateError

        queryClient.setQueryData(["project-overview", projectId], (prev: ProjectOverview | null | undefined) =>
          prev ? { ...prev, logo: storagePath } : prev,
        )
        setFormData((prev) => ({ ...prev, logo: storagePath }))
        queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] })
        toast({
          title: "Logo updated",
          description: "Project logo uploaded successfully",
        })
      } catch (err: any) {
        toast({
          title: "Upload failed",
          description: err?.message || "Failed to upload logo",
          variant: "destructive",
        })
      } finally {
        setIsLogoUploading(false)
        if (logoInputRef.current) logoInputRef.current.value = ""
      }
    },
    [projectId, queryClient],
  )

  useEffect(() => {
    if (!open || !isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [open, isDirty])

  const activeLabel = CATEGORIES.find((c) => c.id === activeCategory)?.label ?? "Settings"
  const logoUrl = useMemo(() => getImageUrl(formData.logo ?? null), [formData.logo])
  const showFooter = activeCategory === "details"

  const renderDetails = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </div>
      )
    }
    if (error || !data) {
      return (
        <div className="py-12 text-center text-sm text-red-500">
          Failed to load project details.
        </div>
      )
    }

    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border bg-gray-50">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Project logo" className="h-full w-full object-cover" />
              ) : (
                <div className="text-xs text-gray-400">Logo</div>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={isLogoUploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleLogoUpload(file)
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
              disabled={isLogoUploading}
              className="gap-2"
            >
              {isLogoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Change logo
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-name">Label</Label>
          <Input
            id="settings-name"
            value={formData.name || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            disabled={isSaving}
            placeholder="Enter project label"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-description">Description</Label>
          <Textarea
            id="settings-description"
            value={formData.description || ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            disabled={isSaving}
            placeholder="Enter description"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-color">Color</Label>
          <input
            id="settings-color"
            type="color"
            value={formData.color || "#000000"}
            onChange={(e) => {
              const nextColor = e.target.value
              setFormData((prev) => ({ ...prev, color: nextColor }))
            }}
            disabled={isSaving}
            className="h-9 w-16 rounded border border-gray-200 bg-white p-1"
          />
        </div>

        <div className="space-y-5 border-t border-gray-100 pt-5">
          <div className="space-y-2">
            <Label htmlFor="settings-goal">Goal</Label>
            <Textarea
              id="settings-goal"
              value={formData.goal || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, goal: e.target.value }))}
              disabled={isSaving}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-target-audience">Target audience</Label>
            <Textarea
              id="settings-target-audience"
              value={formData.target_audience || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, target_audience: e.target.value }))}
              disabled={isSaving}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-editorial-line">Editorial line</Label>
            <Textarea
              id="settings-editorial-line"
              value={formData.editorial_line || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, editorial_line: e.target.value }))}
              disabled={isSaving}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-project-url">URL</Label>
            <Input
              id="settings-project-url"
              type="url"
              value={formData.project_url || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, project_url: e.target.value }))}
              disabled={isSaving}
              placeholder="https://example.com"
            />
          </div>
        </div>

        <ProjectBrandKitSection
          projectId={projectId}
          projectUrl={formData.project_url ?? data?.project_url ?? null}
          canEdit
          onApplied={(kit) => {
            const primary = kit.effective.colors.primary
            const logoPath = kit.effective.logo_path
            setFormData((prev) => ({
              ...prev,
              ...(primary ? { color: primary } : {}),
              ...(logoPath ? { logo: logoPath } : {}),
              ...(kit.source_url ? { project_url: kit.source_url } : {}),
            }))
          }}
        />
      </div>
    )
  }

  const renderCategory = () => {
    switch (activeCategory) {
      case "details":
        return renderDetails()
      case "configuration":
        return <OverviewConfigDropdowns projectId={projectId} />
      case "status":
        return <ProjectStatusesSection projectId={projectId} />
      case "planning":
        return <ProjectOverviewPlanningSection projectId={projectId} hideTitle />
      case "billing":
        return <BillingTab projectId={projectId} hideTitle />
      case "website-index":
        return (
          <ProjectWebsiteIndexSection
            projectId={projectId}
            projectUrl={formData.project_url ?? data?.project_url ?? null}
            canEdit
          />
        )
      case "team":
        return (
          <ProjectTeamSettingsPanel
            teamId={data?.team_id ?? null}
            teamName={data?.team_name ?? null}
            isLoading={isLoading}
          />
        )
      case "components":
        return (
          <div className="-mx-2 min-h-[420px]">
            <LibraryTab
              projectId={projectId}
              selectedBriefingTypeId={null}
              onRefresh={() => {
                queryClient.invalidateQueries({ queryKey: ["projBriefings:library:index", projectId] })
                queryClient.invalidateQueries({ queryKey: ["projBriefings:components"] })
              }}
            />
          </div>
        )
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
              if (isDirty) {
                event.preventDefault()
                handleClose()
              }
            }}
            onPointerDownOutside={(event) => {
              if (isDirty) {
                event.preventDefault()
                handleClose()
              }
            }}
            className="fixed left-1/2 top-1/2 z-50 flex h-[min(85vh,720px)] w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl duration-200 focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <DialogPrimitive.Title className="sr-only">Project settings</DialogPrimitive.Title>

            <aside className="flex w-52 shrink-0 flex-col border-r border-gray-100 bg-gray-50/60 p-3">
              <div className="px-2 pb-2 pt-1 text-base font-semibold text-gray-900">Project settings</div>
              <nav className="mt-1 space-y-0.5">
                {CATEGORIES.filter((category) => {
                  if (category.id !== "website-index") return true
                  const url = (formData.project_url ?? data?.project_url ?? "").trim()
                  return url.length > 0
                }).map(({ id, label, icon: Icon }) => (
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
                  aria-label="Close project settings"
                  onClick={handleClose}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
                {renderCategory()}
              </div>

              {showFooter && !isLoading && data ? (
                <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-3">
                  <Button
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={isSaving || !isDirty || !String(formData.name ?? "").trim()}
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              ) : null}
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
