"use client"

import { type WheelEvent, useCallback, useRef, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs"
import { OverviewTab } from "./OverviewTab"
import { BillingTab } from "./BillingTab"
import { ActivityTab } from "./ActivityTab"
import { CommentsTab } from "./CommentsTab"
import { FilesTab } from "./FilesTab"

interface ProjectBriefingTabsProps {
  projectId: number
}

export default function ProjectBriefingTabs({
  projectId,
}: ProjectBriefingTabsProps) {
  const tabsListRef = useRef<HTMLDivElement | null>(null)
  const [isTabsHovered, setIsTabsHovered] = useState(false)

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!isTabsHovered) return
    const el = tabsListRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (delta === 0) return
    event.preventDefault()
    el.scrollLeft += delta
  }, [isTabsHovered])

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList
        ref={tabsListRef}
        className="ai-chat-tabs-scroll flex w-full justify-start gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-none border-b border-gray-200 bg-transparent p-0"
        onMouseEnter={() => setIsTabsHovered(true)}
        onMouseLeave={() => setIsTabsHovered(false)}
        onWheel={handleWheel}
      >
        <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:shadow-none">
          Overview
        </TabsTrigger>
        <TabsTrigger value="billing" className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:shadow-none">
          Billing
        </TabsTrigger>
        <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:shadow-none">
          Activity
        </TabsTrigger>
        <TabsTrigger value="comments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:shadow-none">
          Comments
        </TabsTrigger>
        <TabsTrigger value="files" className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 data-[state=active]:shadow-none">
          Files
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <OverviewTab projectId={projectId} />
      </TabsContent>

      <TabsContent value="billing" className="mt-4">
        <BillingTab projectId={projectId} />
      </TabsContent>

      <TabsContent value="activity" className="mt-4">
        <ActivityTab projectId={projectId} />
      </TabsContent>

      <TabsContent value="comments" className="mt-4">
        <CommentsTab projectId={projectId} />
      </TabsContent>

      <TabsContent value="files" className="mt-4">
        <FilesTab projectId={projectId} />
      </TabsContent>
    </Tabs>
  )
}

