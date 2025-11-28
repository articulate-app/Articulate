"use client"

import { ReactNode, useState } from "react"
import { Sidebar } from "../components/ui/Sidebar"
import { AiPane } from "../../features/ai-chat/AiPane"
import { Bot } from "lucide-react"

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isAiOpen, setIsAiOpen] = useState(false)
  return (
    <div className="flex h-screen">
      {/* Left Pane - Sidebar */}
      <div className="w-64 border-r border-gray-200">
        <Sidebar isCollapsed={false} />
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
                placeholder="Search..."
                className="w-64 px-4 py-2 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Open AI Assistant"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-gray-50"
              onClick={() => setIsAiOpen(true)}
            >
              <Bot className="w-4 h-4" />
              <span className="text-sm">AI</span>
            </button>
            {/* User avatar and menu will go here */}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
      <AiPane isOpen={isAiOpen} onClose={() => setIsAiOpen(false)} initialScope="global" />
    </div>
  )
} 