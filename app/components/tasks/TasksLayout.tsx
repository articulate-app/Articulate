import { ReactNode } from "react"
import { Sidebar } from "./Sidebar"
import { TaskDetails } from "./TaskDetails"

interface TasksLayoutProps {
  children: ReactNode
}

export function TasksLayout({ children }: TasksLayoutProps) {
  return (
    <div className="flex h-screen">
      {/* Left Pane - Sidebar */}
      <div className="w-64 border-r border-gray-200">
        <Sidebar />
      </div>

      {/* Center Pane - Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <header className="h-16 border-b border-gray-200 px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Articulate</h1>
            <div className="relative">
              <input
                type="text"
                placeholder="Search tasks..."
                className="w-64 px-4 py-2 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* User avatar and menu will go here */}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Right Pane - Task Details */}
      <div className="w-96 border-l border-gray-200">
        <TaskDetails />
      </div>
    </div>
  )
} 