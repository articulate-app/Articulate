"use client"

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
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="comments">Comments</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
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

