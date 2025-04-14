"use client"

import { TasksLayout } from "../components/tasks/TasksLayout"
import { TaskList } from "../components/tasks/TaskList"
import { Filter, Search } from "lucide-react"

export default function TasksPage() {
  return (
    <TasksLayout>
      <div className="flex-1 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks..."
                className="pl-10 pr-4 py-2 border rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <select className="px-4 py-2 border rounded-md">
              <option>All Projects</option>
              {/* Project options will go here */}
            </select>
            <select className="px-4 py-2 border rounded-md">
              <option>All Statuses</option>
              <option>To Do</option>
              <option>In Progress</option>
              <option>Done</option>
            </select>
            <select className="px-4 py-2 border rounded-md">
              <option>All Content Types</option>
              {/* Content type options will go here */}
            </select>
          </div>
          
          <TaskList />
        </div>
      </div>
    </TasksLayout>
  )
} 