"use client"

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { ExpandableBriefingsList } from './ExpandableBriefingsList'
import { LibraryTab } from './LibraryTab'
import { Edit, X, Loader2 } from 'lucide-react'
import { OverviewTab } from '../projects/OverviewTab'
import { BillingTab } from '../projects/BillingTab'
import { ActivityTab } from '../projects/ActivityTab'
import { CommentsTab } from '../projects/CommentsTab'
import { FilesTab } from '../projects/FilesTab'
import { getProjectOverview, type ProjectOverview } from '../../lib/services/projects-briefing'
import { ProjectAnalyticsTab } from '../projects/ProjectAnalyticsTab'
import { ProjectKeywordTrackingTab } from '../projects/ProjectKeywordTrackingTab'
import { ProjectAiVisibilityTab } from '../projects/ProjectAiVisibilityTab'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { PUBLIC_MEDIA_BUCKET, getImageUrl, uploadImage } from "../../lib/public-media"
import { updateProjectOverview } from "../../lib/services/projects-briefing"
import { toast } from "../ui/use-toast"
import {
  fetchProjectBriefingTypes,
  type ProjectBriefingType,
} from '../../lib/services/project-briefings'

interface BriefingsPageProps {
  projectId: number
  onClose?: () => void
}

const ALLOWED_TABS = [
  'overview',
  'billing',
  'activity',
  'comments',
  'files',
  'analytics',
  'ai-visibility',
  'keywords',
  'briefings',
  'library',
] as const

type TabValue = (typeof ALLOWED_TABS)[number]

export function BriefingsPage({ projectId, onClose }: BriefingsPageProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selectedBriefingTypeId, setSelectedBriefingTypeId] = useState<number | null>(null)
  const [showEditProjectDialog, setShowEditProjectDialog] = useState(false)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [editProjectForm, setEditProjectForm] = useState({
    name: "",
    description: "",
  })
  
  // Read tab from URL, default to 'overview'
  const rawTab = searchParams.get('tab')
  const tabFromUrl: TabValue = ALLOWED_TABS.includes(rawTab as any) ? (rawTab as TabValue) : 'overview'
  const [activeTab, setActiveTab] = useState<TabValue>(tabFromUrl)

  // Initialize URL with default tab if none specified
  useEffect(() => {
    const current = searchParams.get('tab')
    if (!current || !ALLOWED_TABS.includes(current as any)) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', 'overview')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, []) // Run only once on mount

  // Sync state with URL changes
  useEffect(() => {
    const current = searchParams.get('tab')
    const urlTab: TabValue = ALLOWED_TABS.includes(current as any) ? (current as TabValue) : 'overview'
    if (urlTab !== activeTab) {
      setActiveTab(urlTab)
    }
    if (current && !ALLOWED_TABS.includes(current as any)) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', 'overview')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, [searchParams, activeTab, pathname, router])

  // Handle tab change and update URL
  const handleTabChange = (value: string) => {
    const newTab = value as TabValue
    setActiveTab(newTab)
    
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', newTab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Fetch project briefing types
  const { data: briefingTypes, isLoading, error } = useQuery({
    queryKey: ['projBriefings:list', projectId],
    queryFn: async () => {
      const { data, error } = await fetchProjectBriefingTypes(projectId)
      if (error) throw error
      return data || []
    },
  })

  // Fetch project overview to get project name for header
  const { data: projectOverview } = useQuery<ProjectOverview | null>({
    queryKey: ['project-overview', projectId],
    queryFn: async () => {
      const result = await getProjectOverview(projectId)
      if (result.error) {
        console.error('Error loading project overview in BriefingsPage:', result.error)
        return null
      }
      return result.data
    },
  })

  const logoUrl = useMemo(() => getImageUrl(projectOverview?.logo ?? null), [projectOverview?.logo])

  const handleOpenEditProject = () => {
    setEditProjectForm({
      name: projectOverview?.name || "",
      description: projectOverview?.description || "",
    })
    setShowEditProjectDialog(true)
  }

  const handleSaveProjectEdits = async () => {
    if (!editProjectForm.name.trim()) {
      toast({
        title: "Error",
        description: "Label is required",
        variant: "destructive",
      })
      return
    }

    try {
      const { error } = await updateProjectOverview(projectId, {
        name: editProjectForm.name.trim(),
        description: editProjectForm.description.trim() ? editProjectForm.description.trim() : null,
      })
      if (error) throw error

      toast({
        title: "Success",
        description: "Project updated successfully",
      })
      queryClient.invalidateQueries({ queryKey: ["project-overview", projectId] })
      setShowEditProjectDialog(false)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to update project",
        variant: "destructive",
      })
    }
  }

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projBriefings:list', projectId] })
    queryClient.invalidateQueries({ 
      queryKey: ['projBriefings:components'] 
    })
  }, [queryClient, projectId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error loading briefings: {String(error)}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-t-0">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-md border bg-gray-50 overflow-hidden flex items-center justify-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Project logo" className="h-full w-full object-cover" />
            ) : (
              <div className="text-xs text-gray-400">Logo</div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">
                {projectOverview?.name || 'Project'}
              </h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenEditProject}
                className="h-6 w-6 p-0"
                disabled={!projectOverview}
                title="Edit project"
              >
                <Edit className="w-3 h-3" />
              </Button>
            </div>
          <p className="text-sm text-gray-500 mt-1">
            Manage briefings, files, activity, and performance for this project
          </p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Edit Project Dialog (styled like user edit modal) */}
      <Dialog open={showEditProjectDialog} onOpenChange={setShowEditProjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update the project's logo, label, and description
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-md border bg-gray-50 overflow-hidden flex items-center justify-center">
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
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return

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
                        prev ? { ...prev, logo: storagePath } : prev
                      )
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
                  {isLogoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Change logo
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-project-name">Label</Label>
              <Input
                id="edit-project-name"
                value={editProjectForm.name}
                onChange={(e) => setEditProjectForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Enter project label"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-project-description">Description</Label>
              <Textarea
                id="edit-project-description"
                value={editProjectForm.description}
                onChange={(e) => setEditProjectForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Enter description"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditProjectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProjectEdits}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main content with tabs */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
          <TabsList className="px-6 bg-transparent border-b border-gray-200 rounded-none justify-start border-t-0 h-auto overflow-x-auto overflow-y-hidden whitespace-nowrap flex-nowrap">
            <TabsTrigger 
              value="overview"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="billing"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Billing
            </TabsTrigger>
            <TabsTrigger 
              value="activity"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Activity
            </TabsTrigger>
            <TabsTrigger 
              value="comments"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Comments
            </TabsTrigger>
            <TabsTrigger 
              value="files"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Files
            </TabsTrigger>
            <TabsTrigger 
              value="analytics"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger 
              value="ai-visibility"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              AI Visibility
            </TabsTrigger>
            <TabsTrigger 
              value="keywords"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Keyword Tracking
            </TabsTrigger>
            <TabsTrigger 
              value="briefings"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Briefings
            </TabsTrigger>
            <TabsTrigger 
              value="library"
              className="data-[state=active]:border-b-2 data-[state=active]:border-black data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:-mb-px rounded-none relative"
            >
              Components
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            <TabsContent value="overview" className="h-full m-0 mt-0 p-6">
              <OverviewTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="billing" className="h-full m-0 mt-0 p-6">
              <BillingTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="activity" className="h-full m-0 mt-0 p-0 overflow-hidden">
              <ActivityTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="comments" className="h-full m-0 mt-0 p-6">
              <CommentsTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="files" className="h-full m-0 mt-0 p-6">
              <FilesTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="analytics" className="h-full m-0 mt-0 p-6">
              <ProjectAnalyticsTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="ai-visibility" className="h-full m-0 mt-0 p-6">
              <ProjectAiVisibilityTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="keywords" className="h-full m-0 mt-0 p-6">
              <ProjectKeywordTrackingTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="briefings" className="h-full m-0 mt-0 p-6">
              <ExpandableBriefingsList
                projectId={projectId}
                briefingTypes={briefingTypes || []}
                onRefresh={handleRefresh}
              />
            </TabsContent>

            <TabsContent value="library" className="h-full m-0 mt-0 p-6">
              <LibraryTab
                projectId={projectId}
                selectedBriefingTypeId={selectedBriefingTypeId}
                onRefresh={handleRefresh}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

    </div>
  )
}

