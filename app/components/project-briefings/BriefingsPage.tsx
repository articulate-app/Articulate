"use client"

import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { X, Loader2, Maximize2, Minimize2, MoreVertical, Settings } from 'lucide-react'
import { OverviewTab } from '../projects/OverviewTab'
import { CommentsTab } from '../projects/CommentsTab'
import { getProjectOverview, type ProjectOverview, uploadProjectFile } from '../../lib/services/projects-briefing'
import { ProjectAnalyticsTab } from '../projects/ProjectAnalyticsTab'
import { ProjectKeywordTrackingTab } from '../projects/ProjectKeywordTrackingTab'
import { ProjectAiVisibilityTab } from '../projects/ProjectAiVisibilityTab'
import { ProjectHeaderWatchers } from '../projects/ProjectHeaderWatchers'
import {
  ProjectSettingsPanel,
  type ProjectSettingsCategory,
} from '../projects/ProjectSettingsPanel'
import { getImageUrl } from "../../lib/public-media"
import { toast } from "../ui/use-toast"
import { usePrefetchProjectSharedQueries } from '../../hooks/use-project-shared-queries'
import { TASKS_SHALLOW_NAV_EVENT } from '../../lib/tasks-shallow-nav'
import { mergeWorkspaceUrlState } from '../../lib/workspace-url-state'
import { useMobileDetection } from '../../hooks/use-mobile-detection'
import { MobileDetailHeader, type MobileDetailAction } from '../ui/mobile-detail-header'

interface BriefingsPageProps {
  projectId: number
  onClose?: () => void
  isDetailsFocused?: boolean
  onFocusToggle?: () => void
}

const ALLOWED_TABS = [
  'overview',
  'activity',
  'comments',
  'analytics',
  'ai-visibility',
  'keywords',
  'tasks',
] as const

type TabValue = (typeof ALLOWED_TABS)[number]

function getTabValueFromParams(params: URLSearchParams): TabValue {
  const rawTab = params.get('centerTab') ?? params.get('rightTab') ?? params.get('tab')
  if (
    rawTab === "files"
    || rawTab === "briefings"
    || rawTab === "billing"
    || rawTab === "library"
  ) {
    return "overview"
  }
  return ALLOWED_TABS.includes(rawTab as any) ? (rawTab as TabValue) : 'overview'
}

function TabPanelFallback() {
  return (
    <div className="flex items-center justify-center h-full p-6 text-sm text-gray-500">
      Loading tab...
    </div>
  )
}

const ActivityTab = dynamic(
  () => import('../projects/ActivityTab').then((module) => ({ default: module.ActivityTab })),
  { loading: () => <TabPanelFallback /> }
)

const ProjectTasksTabContent = dynamic(
  () => import('../tasks/ProjectTasksTabContent').then((module) => ({ default: module.ProjectTasksTabContent })),
  { loading: () => <TabPanelFallback /> }
)

export function BriefingsPage({ projectId, onClose, isDetailsFocused = false, onFocusToggle }: BriefingsPageProps) {
  const isMobile = useMobileDetection()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [projectMiddlePaneHost, setProjectMiddlePaneHost] = useState<HTMLDivElement | null>(null)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<ProjectSettingsCategory>("details")
  const [isTabsHovered, setIsTabsHovered] = useState(false)
  const [isDropzoneActive, setIsDropzoneActive] = useState(false)
  const tabsScrollRef = useRef<HTMLDivElement | null>(null)
  const openedLegacySettingsRef = useRef(false)
  
  const [activeTab, setActiveTab] = useState<TabValue>(() =>
    getTabValueFromParams(new URLSearchParams(searchParams.toString()))
  )

  // Keep local tab state synced when Next searchParams updates.
  useEffect(() => {
    setActiveTab(getTabValueFromParams(new URLSearchParams(searchParams.toString())))
  }, [searchParams])

  // Keep local tab state synced for shallow history updates.
  useEffect(() => {
    const syncFromWindow = () => {
      if (typeof window === 'undefined') return
      setActiveTab(getTabValueFromParams(new URLSearchParams(window.location.search)))
    }
    window.addEventListener(TASKS_SHALLOW_NAV_EVENT, syncFromWindow)
    window.addEventListener('popstate', syncFromWindow)
    return () => {
      window.removeEventListener(TASKS_SHALLOW_NAV_EVENT, syncFromWindow)
      window.removeEventListener('popstate', syncFromWindow)
    }
  }, [])

  useEffect(() => {
    console.log("[project-detail] active tab from URL", activeTab)
  }, [activeTab])

  // Warm project/global data once in the page shell so tab switches do not refetch shared resources.
  usePrefetchProjectSharedQueries(projectId)

  // Preload heavy tab modules in idle time to reduce click-to-content delay.
  const warmTabModule = useCallback((tab: TabValue) => {
    switch (tab) {
      case 'activity':
        void import('../projects/ActivityTab')
        break
      case 'tasks':
        void import('../tasks/ProjectTasksTabContent')
        break
      default:
        break
    }
  }, [])

  const openProjectSettings = useCallback((category: ProjectSettingsCategory = "details") => {
    setSettingsCategory(category)
    setShowProjectSettings(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const warmHeavyTabs = () => {
      warmTabModule('activity')
      warmTabModule('tasks')
    }
    if ('requestIdleCallback' in window) {
      const idleId = (window as any).requestIdleCallback(warmHeavyTabs, { timeout: 1200 })
      return () => (window as any).cancelIdleCallback?.(idleId)
    }
    const timerId = setTimeout(warmHeavyTabs, 300)
    return () => clearTimeout(timerId)
  }, [warmTabModule])

  useEffect(() => {
    const el = tabsScrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!isTabsHovered) return
      if (el.scrollWidth <= el.clientWidth) return
      let deltaX = e.deltaX
      let deltaY = e.deltaY
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaX *= 16
        deltaY *= 16
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaX *= el.clientWidth
        deltaY *= el.clientHeight
      }
      const delta = e.shiftKey ? deltaY : Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
      if (delta === 0) return
      e.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', onWheel, true)
  }, [isTabsHovered])

  // Handle tab change and update URL
  const handleTabChange = (value: string) => {
    const newTab = value as TabValue
    if (!ALLOWED_TABS.includes(newTab)) return
    if (newTab === activeTab) return
    console.log("[project-detail] tab click", newTab)
    warmTabModule(newTab)
    setActiveTab(newTab)

    const params = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : searchParams.toString()
    )
    const isAiRightPane = params.get('rightView') === 'ai'
    mergeWorkspaceUrlState(
      isAiRightPane
        ? {
            centerTab: newTab === "overview" ? null : newTab,
            rightTab: null,
            tab: null,
          }
        : {
            rightTab: newTab === "overview" ? null : newTab,
            centerTab: null,
            tab: null,
          },
      { source: "project-tab-change" },
    )
  }

  // Fetch project overview to get project name for header
  const { data: projectOverview, isFetching: projectOverviewFetching } = useQuery<ProjectOverview | null>({
    queryKey: ['project-overview', projectId],
    queryFn: async () => {
      const result = await getProjectOverview(projectId)
      if (result.error) {
        console.error('Error loading project overview in BriefingsPage:', result.error)
        return null
      }
      return result.data
    },
    initialData: () => queryClient.getQueryData<ProjectOverview | null>(['project-overview', projectId]),
    staleTime: 0,
  })

  const logoUrl = useMemo(() => getImageUrl(projectOverview?.logo ?? null), [projectOverview?.logo])

  // Legacy deep-links to billing/components tabs open the settings modal instead.
  useEffect(() => {
    if (openedLegacySettingsRef.current) return
    const rawTab = searchParams.get('centerTab') ?? searchParams.get('rightTab') ?? searchParams.get('tab')
    if (rawTab === 'billing') {
      openedLegacySettingsRef.current = true
      openProjectSettings('billing')
    } else if (rawTab === 'library') {
      openedLegacySettingsRef.current = true
      openProjectSettings('components')
    } else if (rawTab === 'files') {
      openedLegacySettingsRef.current = true
      openProjectSettings('files')
    }
  }, [searchParams, openProjectSettings])

  const tabTriggerClassName =
    "relative rounded-none border-b-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-[-5px] after:h-px after:bg-transparent data-[state=active]:after:bg-black"

  const handleProjectDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDropzoneActive(false)
      const dropped = event.dataTransfer?.files
      if (!dropped || dropped.length === 0) return

      const files = Array.from(dropped)
      let uploaded = 0
      for (const file of files) {
        try {
          await uploadProjectFile(projectId, file)
          uploaded += 1
        } catch (error: any) {
          toast({
            title: "Upload failed",
            description: error?.message || `Failed to upload ${file.name}`,
            variant: "destructive",
          })
        }
      }

      if (uploaded > 0) {
        queryClient.invalidateQueries({ queryKey: ["project-files", projectId] })
        toast({
          title: "Files uploaded",
          description: `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded to this project.`,
        })
      }
    },
    [projectId, queryClient],
  )

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(event) => {
        event.preventDefault()
        setIsDropzoneActive(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDropzoneActive(false)
        }
      }}
      onDrop={handleProjectDrop}
    >
      {isDropzoneActive ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-blue-400 bg-blue-50/70">
          <div className="rounded-md bg-white/90 px-4 py-2 text-sm font-medium text-blue-700 shadow">
            Drop files to upload to this project
          </div>
        </div>
      ) : null}
      {/* Mobile header: stable title + top-right "..." overflow with project actions. */}
      {isMobile ? (
        <MobileDetailHeader
          onBack={onClose}
          backLabel="Close details"
          title={projectOverview?.name || 'Project'}
          rightSlot={<ProjectHeaderWatchers projectId={projectId} />}
          actions={(
            [
              {
                id: 'project-settings',
                label: 'Project settings',
                icon: <Settings className="h-4 w-4" />,
                onSelect: () => openProjectSettings('details'),
              },
            ] as MobileDetailAction[]
          )}
        />
      ) : (
      /* Header */
      <div className="flex min-w-0 items-center justify-between gap-2 border-t-0 bg-white px-6 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-gray-50">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Project logo" className="h-full w-full object-cover" />
            ) : (
              <div className="text-[10px] text-gray-400">Logo</div>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-gray-900">
              {projectOverview?.name || 'Project'}
            </h1>
            {projectOverviewFetching && (projectOverview as ProjectOverview & { __partial?: boolean })?.__partial ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-400" aria-label="Loading full details" />
            ) : null}
            <ProjectHeaderWatchers projectId={projectId} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Project settings"
            aria-label="Project settings"
            onClick={() => openProjectSettings('details')}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {onFocusToggle ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                console.log("[project-detail] focus click", { focused: !isDetailsFocused })
                onFocusToggle()
              }}
              title={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
              aria-label={isDetailsFocused ? "Restore details pane" : "Expand details pane"}
            >
              {isDetailsFocused ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          ) : null}
          {onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>
      )}

      <ProjectSettingsPanel
        open={showProjectSettings}
        onClose={() => setShowProjectSettings(false)}
        projectId={projectId}
        initialCategory={settingsCategory}
      />

      {/* Main content with tabs */}
      <div ref={setProjectMiddlePaneHost} className="relative flex flex-1 flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
          <div
            ref={tabsScrollRef}
            className="ai-chat-tabs-scroll min-h-0 min-w-0 overflow-x-auto overflow-y-hidden border-b border-gray-200"
            onMouseEnter={() => setIsTabsHovered(true)}
            onMouseLeave={() => setIsTabsHovered(false)}
          >
            <TabsList className="px-6 bg-transparent rounded-none justify-start border-t-0 h-auto whitespace-nowrap flex-nowrap">
            <TabsTrigger 
              value="overview"
              className={tabTriggerClassName}
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="activity"
              onMouseEnter={() => warmTabModule('activity')}
              onFocus={() => warmTabModule('activity')}
              className={tabTriggerClassName}
            >
              Activity
            </TabsTrigger>
            <TabsTrigger 
              value="comments"
              className={tabTriggerClassName}
            >
              Comments
            </TabsTrigger>
            <TabsTrigger 
              value="analytics"
              className={tabTriggerClassName}
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger 
              value="ai-visibility"
              className={tabTriggerClassName}
            >
              AI Visibility
            </TabsTrigger>
            <TabsTrigger 
              value="keywords"
              className={tabTriggerClassName}
            >
              Keyword Tracking
            </TabsTrigger>
            <TabsTrigger 
              value="tasks"
              onMouseEnter={() => warmTabModule('tasks')}
              onFocus={() => warmTabModule('tasks')}
              className={tabTriggerClassName}
            >
              Tasks
            </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="overview" className="h-full m-0 mt-0 p-6">
              <OverviewTab
                projectId={projectId}
                briefingOverlayContainer={projectMiddlePaneHost}
                onNavigateTab={(tab) => handleTabChange(tab)}
              />
            </TabsContent>

            <TabsContent value="activity" className="h-full m-0 mt-0 p-0 overflow-hidden">
              <ActivityTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="comments" className="h-full m-0 mt-0 p-0">
              <CommentsTab projectId={projectId} />
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

            <TabsContent value="tasks" className="h-full m-0 mt-0 p-0 overflow-hidden">
              <ProjectTasksTabContent projectId={projectId} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

    </div>
  )
}

