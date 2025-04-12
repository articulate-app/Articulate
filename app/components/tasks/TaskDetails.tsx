import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function TaskDetails() {
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
                placeholder="Task title"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Status</label>
              <select className="w-full mt-1 px-3 py-2 border rounded-md">
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
              />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="briefing">
          <div className="h-full">
            <textarea
              className="w-full h-full p-3 border rounded-md"
              placeholder="Enter briefing details..."
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
                placeholder="Meta title"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Meta Description</label>
              <textarea
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="Meta description"
              />
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="activity">
          <div className="space-y-4">
            {/* Activity feed will go here */}
            <p className="text-sm text-gray-500">No activity yet</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
} 