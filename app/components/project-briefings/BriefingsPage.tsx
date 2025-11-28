"use client"

import React, { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { ExpandableBriefingsList } from './ExpandableBriefingsList'
import { LibraryTab } from './LibraryTab'
import { X, Loader2 } from 'lucide-react'
import { OverviewTab } from '../projects/OverviewTab'
import { BillingTab } from '../projects/BillingTab'
import { ActivityTab } from '../projects/ActivityTab'
import { CommentsTab } from '../projects/CommentsTab'
import { FilesTab } from '../projects/FilesTab'
import {
  fetchProjectBriefingTypes,
  type ProjectBriefingType,
} from '../../lib/services/project-briefings'

interface BriefingsPageProps {
  projectId: number
  onClose?: () => void
}

type TabValue = 'overview' | 'billing' | 'activity' | 'comments' | 'files' | 'briefings' | 'library'

export function BriefingsPage({ projectId, onClose }: BriefingsPageProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selectedBriefingTypeId, setSelectedBriefingTypeId] = useState<number | null>(null)
  
  // Read tab from URL, default to 'overview'
  const tabFromUrl = (searchParams.get('tab') as TabValue) || 'overview'
  const [activeTab, setActiveTab] = useState<TabValue>(tabFromUrl)

  // Initialize URL with default tab if none specified
  useEffect(() => {
    if (!searchParams.get('tab')) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', 'overview')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, []) // Run only once on mount

  // Sync state with URL changes
  useEffect(() => {
    const urlTab = (searchParams.get('tab') as TabValue) || 'overview'
    if (urlTab !== activeTab) {
      setActiveTab(urlTab)
    }
  }, [searchParams, activeTab])

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
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Project Briefings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage briefing types and templates for this project</p>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

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

            <TabsContent value="activity" className="h-full m-0 mt-0 p-6">
              <ActivityTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="comments" className="h-full m-0 mt-0 p-6">
              <CommentsTab projectId={projectId} />
            </TabsContent>

            <TabsContent value="files" className="h-full m-0 mt-0 p-6">
              <FilesTab projectId={projectId} />
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

