'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { Sidebar } from '../../components/ui/Sidebar'
import { TeamDetailsPage } from '../../components/teams/TeamDetailsPage'
import { ThreadedRealtimeChat } from '../../components/threaded-realtime-chat'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useCurrentUserStore } from '../../store/current-user'
import { Loader2, X } from 'lucide-react'
import { Button } from '../../components/ui/button'

export default function TeamPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const teamId = parseInt(params.id as string, 10)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)

  // Get current user info for chat
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const fullName = useCurrentUserStore((s) => s.fullName)
  const userMetadata = useCurrentUserStore((s) => s.userMetadata)

  // Read right pane state from URL
  const rightView = searchParams.get('rightView')
  const rightThreadId = searchParams.get('rightThreadId')
  const isRightPaneOpen = !!(rightView === 'thread-chat' && rightThreadId)

  if (isNaN(teamId)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600">Invalid team ID</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="w-full sticky top-0 z-30 bg-white border-b flex items-center h-16 px-4 gap-4 shadow-sm">
        <button
          type="button"
          className="flex items-center justify-center p-2 rounded hover:bg-gray-100 focus:outline-none"
          aria-label="Toggle sidebar"
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <span className="text-2xl font-bold tracking-tight text-gray-900 select-none mr-4">Articulate</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <Sidebar isCollapsed={isSidebarCollapsed} />
        </div>

        {/* Middle Pane - Team Details */}
        <div className={`flex-1 overflow-hidden ${isRightPaneOpen ? 'max-w-[50%]' : ''}`}>
          <TeamDetailsPage teamId={teamId} />
        </div>

        {/* Right Pane - Thread Chat */}
        {isRightPaneOpen && (
          <div className="flex-1 border-l border-gray-200 flex flex-col overflow-hidden bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900">Team Chat</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const url = new URL(window.location.href)
                  url.searchParams.delete('rightView')
                  url.searchParams.delete('rightThreadId')
                  window.history.pushState({}, '', url.toString())
                  window.dispatchEvent(new PopStateEvent('popstate'))
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-auto">
              {rightThreadId && publicUserId && (
                <ThreadedRealtimeChat
                  threadId={Number(rightThreadId)}
                  currentUserId={publicUserId}
                  currentUserName={fullName || undefined}
                  currentUserAvatar={userMetadata?.avatar_url || undefined}
                  currentUserEmail={userMetadata?.email || ''}
                  currentPublicUserId={publicUserId}
                  hideInput={false}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
