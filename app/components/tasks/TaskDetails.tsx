"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"

interface TaskDetailsProps {
  task: {
    id: string
    title: string
    status: string
    due_date: string
    briefing: string
    meta_title?: string
    meta_description?: string
  } | null
}

export function TaskDetails({ task }: TaskDetailsProps) {
  if (!task) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Select a task to view details
      </div>
    )
  }

  return (
    <div className="h-full p-4">
      <Tabs defaultValue="overview" className="h-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="briefing">Briefing</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="h-[calc(100%-40px)]">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 border rounded-md"
                value={task.title}
                readOnly
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Status</label>
              <select 
                className="w-full mt-1 px-3 py-2 border rounded-md"
                value={task.status}
                disabled
              >
                <option>To Do</option>
                <option>In Progress</option>
                <option>Done</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Due Date</label>
              <input
                type="date"
                className="w-full mt-1 px-3 py-2 border rounded-md"
                value={task.due_date}
                readOnly
              />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="briefing">
          <div className="h-full">
            <textarea
              className="w-full h-full p-3 border rounded-md"
              value={task.briefing}
              readOnly
            />
          </div>
        </TabsContent>
        
        <TabsContent value="seo">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Meta Title</label>
              <input
                type="text"
                className="w-full mt-1 px-3 py-2 border rounded-md"
                value={task.meta_title || ""}
                readOnly
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Meta Description</label>
              <textarea
                className="w-full mt-1 px-3 py-2 border rounded-md"
                value={task.meta_description || ""}
                readOnly
              />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="activity">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">No activity yet</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 