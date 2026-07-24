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
        <TabsTrigger value="overview" className="-mb-px rounded-none border-b-0 data-[state=active]:bg-transparent data-[state=active]:shadow-[inset_0_-2px_0_0_#111827]">
          Overview
        </TabsTrigger>
        <TabsTrigger value="billing" className="-mb-px rounded-none border-b-0 data-[state=active]:bg-transparent data-[state=active]:shadow-[inset_0_-2px_0_0_#111827]">
          Billing
        </TabsTrigger>
        <TabsTrigger value="activity" className="-mb-px rounded-none border-b-0 data-[state=active]:bg-transparent data-[state=active]:shadow-[inset_0_-2px_0_0_#111827]">
          Activity
        </TabsTrigger>
        <TabsTrigger value="comments" className="-mb-px rounded-none border-b-0 data-[state=active]:bg-transparent data-[state=active]:shadow-[inset_0_-2px_0_0_#111827]">
          Comments
        </TabsTrigger>
        <TabsTrigger value="files" className="-mb-px rounded-none border-b-0 data-[state=active]:bg-transparent data-[state=active]:shadow-[inset_0_-2px_0_0_#111827]">
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

