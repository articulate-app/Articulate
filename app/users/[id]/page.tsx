'use client'

import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '../../components/ui/Sidebar'
import { UserDetailsPage } from '../../components/users/UserDetailsPageTabs'
import { useState, useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ThreadedRealtimeChat } from '../../components/threaded-realtime-chat'
import { X, Trash2, Plus, Clock, Search, Loader2 } from 'lucide-react'
import { useCurrentUserStore } from '../../store/current-user'
import { TaskDetails } from '../../components/tasks/TaskDetails'
import { BriefingsPage } from '../../components/project-briefings/BriefingsPage'
import { useQuery } from '@tanstack/react-query'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useTaskEditFields } from '../../hooks/use-task-edit-fields'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Button } from '../../components/ui/button'
import { deleteThread, createUserThread } from '../../lib/services/users'
import { UserDmThreadHistoryDrawer } from '../../components/users/UserDmThreadHistoryDrawer'
import { getUserProfile } from '../../lib/services/users'
import { toast } from '../../components/ui/use-toast'

export default function UserPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const userId = parseInt(params.id as string, 10)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const supabase = createClientComponentClient()

  // Get current user info for chat
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const fullName = useCurrentUserStore((s) => s.fullName)
  const userMetadata = useCurrentUserStore((s) => s.userMetadata)

  // Read right pane state from URL
  const rightView = searchParams.get('rightView')
  const rightThreadId = searchParams.get('rightThreadId')
  const rightTaskId = searchParams.get('rightTaskId')
  const rightProjectId = searchParams.get('rightProjectId')
  const rightTeamId = searchParams.get('rightTeamId')

  const isRightPaneOpen = !!(rightView && (rightThreadId || rightTaskId || rightProjectId || rightTeamId))

  // Get access token for task edit fields
  const [accessToken, setAccessToken] = useState<string | null>(null)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession()
      if (data?.session?.access_token) setAccessToken(data.session.access_token)
    })()
  }, [supabase])

  // Fetch task edit fields
  const { data: editFields } = useTaskEditFields(rightView === 'task-details' && accessToken ? accessToken : null)

  // Fetch task bootstrap data using the correct endpoint and method
  const { data: taskBootstrap, isLoading: taskLoading } = useQuery({
    queryKey: ['task', rightTaskId, accessToken],
    queryFn: async () => {
      if (!rightTaskId || !accessToken) return null
      
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/task-details-bootstrap?task_id=${rightTaskId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
      
      if (!response.ok) {
        console.error('Failed to fetch task details:', response.status, response.statusText)
        throw new Error('Failed to fetch task details')
      }
      
      const data = await response.json()
      console.log('Task details bootstrap data:', data)
      return data
    },
    enabled: rightView === 'task-details' && !!rightTaskId && !!accessToken,
    staleTime: 0,
  })

  // Merge task data properly (task fields might be nested)
  const selectedTask = taskBootstrap ? { ...(taskBootstrap.task || {}), ...taskBootstrap } : null

  const [showDeleteThreadDialog, setShowDeleteThreadDialog] = useState(false)
  const [isDeletingThread, setIsDeletingThread] = useState(false)
  const [showNewThreadDialog, setShowNewThreadDialog] = useState(false)
  const [newThreadTitle, setNewThreadTitle] = useState("")
  const [isCreatingThread, setIsCreatingThread] = useState(false)
  const [showThreadHistory, setShowThreadHistory] = useState(false)
  const [isSearchExpanded, setIsSearchExpanded] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [focusedMentionId, setFocusedMentionId] = useState<number | null>(null)
  const searchResultsRef = useRef<HTMLDivElement>(null)

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchResultsRef.current && !searchResultsRef.current.contains(event.target as Node)) {
        setShowSearchResults(false)
      }
    }

    if (showSearchResults) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSearchResults])

  // Fetch thread info for DM threads
  const { data: threadInfo } = useQuery({
    queryKey: ['thread-info', rightThreadId],
    queryFn: async () => {
      if (!rightThreadId || rightView !== 'thread-chat') return null
      
      const { data, error } = await supabase
        .from('threads')
        .select('id, title')
        .eq('id', rightThreadId)
        .single()
      
      if (error) throw error
      return data
    },
    enabled: rightView === 'thread-chat' && !!rightThreadId,
  })

  // Fetch user profile for search
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const { data, error } = await getUserProfile(userId)
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })

  // Debounced search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([])
      setShowSearchResults(false)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timer = setTimeout(async () => {
      try {
        const { searchUserDmMentions } = await import('../../lib/services/users')
        const { data, error } = await searchUserDmMentions(userId, searchTerm, 10, 0)
        if (error) throw error
        setSearchResults((data as any[]) || [])
        setShowSearchResults(true)
      } catch (err: any) {
        console.error('Search error:', err)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchTerm, userId])

  const handleDeleteThread = async () => {
    if (!rightThreadId) return
    
    setIsDeletingThread(true)
    try {
      const { error } = await deleteThread(Number(rightThreadId))
      
      if (error) throw error

      toast({
        title: "Success",
        description: "Thread deleted",
      })

      // Close the right pane
      handleCloseRightPane()
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete thread",
        variant: "destructive",
      })
    } finally {
      setIsDeletingThread(false)
      setShowDeleteThreadDialog(false)
    }
  }

  const handleCreateNewThread = async () => {
    if (!newThreadTitle.trim()) {
      toast({
        title: "Validation Error",
        description: "Thread name is required",
        variant: "destructive",
      })
      return
    }

    setIsCreatingThread(true)
    try {
      const { data: thread, error } = await createUserThread(userId, newThreadTitle.trim())
      
      if (error) throw error
      
      if (!thread) {
        throw new Error("Failed to create thread")
      }

      const threadId = typeof thread === 'object' && thread && 'id' in thread ? thread.id : thread

      toast({
        title: "Success",
        description: "Thread created successfully",
      })

      // Close dialog and reset form
      setShowNewThreadDialog(false)
      setNewThreadTitle("")

      // Navigate to the new thread
      const newParams = new URLSearchParams(searchParams.toString())
      newParams.set('rightView', 'thread-chat')
      newParams.set('rightThreadId', String(threadId))
      router.push(`${pathname}?${newParams.toString()}`)
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create thread",
        variant: "destructive",
      })
    } finally {
      setIsCreatingThread(false)
    }
  }

  const handleSelectThread = (threadId: number) => {
    const newParams = new URLSearchParams(searchParams.toString())
    newParams.set('rightView', 'thread-chat')
    newParams.set('rightThreadId', String(threadId))
    router.push(`${pathname}?${newParams.toString()}`)
  }

  const handleSelectSearchResult = (result: any) => {
    // Close search results and collapse search
    setShowSearchResults(false)
    setSearchTerm("")
    setIsSearchExpanded(false)
    
    // Navigate to the thread
    const newParams = new URLSearchParams(searchParams.toString())
    newParams.set('rightView', 'thread-chat')
    newParams.set('rightThreadId', String(result.thread_id))
    router.push(`${pathname}?${newParams.toString()}`)
    
    // Set focused mention ID to highlight the message
    setFocusedMentionId(result.mention_id)
  }

  const handleCloseRightPane = () => {
    const newParams = new URLSearchParams(searchParams.toString())
    newParams.delete('rightView')
    newParams.delete('rightThreadId')
    newParams.delete('rightTaskId')
    newParams.delete('rightProjectId')
    newParams.delete('rightTeamId')
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false })
  }

  if (isNaN(userId)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600">Invalid user ID</div>
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
        <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <Sidebar isCollapsed={isSidebarCollapsed} />
        </div>

        <PanelGroup direction="horizontal" className="flex-1">
          <Panel defaultSize={isRightPaneOpen ? 60 : 100} minSize={30}>
            <div className="h-full overflow-hidden">
              <UserDetailsPage userId={userId} />
            </div>
          </Panel>

          {isRightPaneOpen && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-200 hover:bg-blue-400 transition-colors" />
              <Panel defaultSize={40} minSize={25}>
                <div className="h-full flex flex-col bg-white border-l">
                  {/* Right Pane Header */}
                  <div className="flex flex-col border-b bg-white">
                    <div className="flex items-center justify-between px-4 py-3">
                      <h3 className="font-semibold text-sm text-gray-900">
                        {rightView === 'thread-chat' && (threadInfo?.title || 'Chat')}
                        {rightView === 'task-details' && 'Task Details'}
                        {rightView === 'project-details' && 'Project Details'}
                        {rightView === 'team-details' && 'Team Details'}
                      </h3>
                      <div className="flex items-center gap-2">
                        {rightView === 'thread-chat' && rightThreadId && (
                          <>
                            {isSearchExpanded ? (
                              <div className="relative flex-1 max-w-xs" ref={searchResultsRef}>
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                  type="text"
                                  placeholder={`Search messages with ${userProfile?.full_name || userProfile?.auth_email || 'user'}...`}
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  onFocus={() => {
                                    if (searchResults.length > 0) {
                                      setShowSearchResults(true)
                                    }
                                  }}
                                  onBlur={(e) => {
                                    // Don't close if clicking on results
                                    if (!searchResultsRef.current?.contains(e.relatedTarget as Node)) {
                                      if (!searchTerm.trim()) {
                                        setIsSearchExpanded(false)
                                      }
                                    }
                                  }}
                                  className="pl-9 pr-8 h-8 text-sm"
                                  autoFocus
                                />
                                <button
                                  onClick={() => {
                                    setIsSearchExpanded(false)
                                    setSearchTerm("")
                                    setShowSearchResults(false)
                                  }}
                                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded hover:bg-gray-200"
                                  aria-label="Close search"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                                {showSearchResults && (searchTerm.trim() || searchResults.length > 0) && (
                                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                                    {isSearching ? (
                                      <div className="flex items-center justify-center py-4">
                                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                      </div>
                                    ) : searchResults.length === 0 && searchTerm.trim() ? (
                                      <div className="text-sm text-gray-500 py-4 text-center">
                                        No messages found
                                      </div>
                                    ) : searchResults.length > 0 ? (
                                      <div className="py-2">
                                        {searchResults.map((result) => (
                                          <button
                                            key={result.mention_id}
                                            onClick={() => handleSelectSearchResult(result)}
                                            className="w-full text-left p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                                          >
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <span className="font-medium text-xs text-gray-900">
                                                    {result.thread_title || "Chat"}
                                                  </span>
                                                  <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    Thread #{result.thread_id}
                                                  </span>
                                                </div>
                                                <div className="text-xs text-gray-700 mb-1 line-clamp-2">
                                                  {result.comment}
                                                </div>
                                                <div className="text-xs text-gray-400">
                                                  {new Date(result.created_at).toLocaleString()}
                                                </div>
                                              </div>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => setIsSearchExpanded(true)}
                                className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                                aria-label="Search messages"
                                title="Search messages"
                              >
                                <Search className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setShowNewThreadDialog(true)}
                              className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                              aria-label="New thread"
                              title="New thread"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowThreadHistory(true)}
                              className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                              aria-label="Thread history"
                              title="Thread history"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowDeleteThreadDialog(true)}
                              className="p-1.5 rounded hover:bg-gray-200 transition-colors text-red-600 hover:text-red-700"
                              aria-label="Delete thread"
                              title="Delete thread"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={handleCloseRightPane}
                          className="p-1 rounded hover:bg-gray-200 transition-colors"
                          aria-label="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Pane Content */}
                  <div className="flex-1 overflow-auto">
                    {rightView === 'thread-chat' && rightThreadId && publicUserId && (
                      <ThreadedRealtimeChat
                        threadId={Number(rightThreadId)}
                        currentUserId={publicUserId}
                        currentUserName={fullName || undefined}
                        currentUserAvatar={userMetadata?.avatar_url || undefined}
                        currentUserEmail={userMetadata?.email || ''}
                        currentPublicUserId={publicUserId}
                        hideInput={false}
                        focusedMentionId={focusedMentionId}
                        onFocusedMentionCleared={() => setFocusedMentionId(null)}
                      />
                    )}

                    {rightView === 'task-details' && rightTaskId && (
                      <>
                        {taskLoading && (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-gray-500">Loading task...</div>
                          </div>
                        )}
                        {!taskLoading && !selectedTask && (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-gray-500">Task not found</div>
                          </div>
                        )}
                        {!taskLoading && selectedTask && (
                          <TaskDetails
                            selectedTask={selectedTask}
                            isCollapsed={false}
                            onClose={handleCloseRightPane}
                            onTaskUpdate={(updatedFields) => {
                              console.log('Task updated:', updatedFields)
                            }}
                            attachments={selectedTask.attachments || []}
                            threadId={selectedTask.thread_id || null}
                            mentions={selectedTask.mentions || []}
                            watchers={selectedTask.watchers || []}
                            currentUser={selectedTask.currentUser || null}
                            subtasks={selectedTask.subtasks || []}
                            project_watchers={selectedTask.project_watchers || []}
                            accessToken={accessToken}
                            pathname={pathname}
                          />
                        )}
                      </>
                    )}

                    {rightView === 'project-details' && rightProjectId && (
                      <BriefingsPage projectId={parseInt(rightProjectId, 10)} onClose={handleCloseRightPane} />
                    )}

                    {rightView === 'team-details' && rightTeamId && (
                      <div className="p-4">
                        <p className="text-sm text-gray-500">Team details for team #{rightTeamId}</p>
                        {/* TODO: Render team details */}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* New Thread Dialog */}
      <Dialog open={showNewThreadDialog} onOpenChange={setShowNewThreadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Thread</DialogTitle>
            <DialogDescription>
              Create a new named conversation thread with this user
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="thread-title">Thread Name</Label>
              <Input
                id="thread-title"
                placeholder="Chat"
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleCreateNewThread()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewThreadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateNewThread} disabled={isCreatingThread || !newThreadTitle.trim()}>
              {isCreatingThread ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Thread"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Thread History Drawer */}
      <UserDmThreadHistoryDrawer
        open={showThreadHistory}
        onOpenChange={setShowThreadHistory}
        userId={userId}
        activeThreadId={rightThreadId ? parseInt(rightThreadId, 10) : null}
        onSelectThread={handleSelectThread}
      />

      {/* Delete Thread Confirmation Dialog */}
      <AlertDialog open={showDeleteThreadDialog} onOpenChange={setShowDeleteThreadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Thread</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this thread? All messages in this thread will be removed for you and the other participant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingThread}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteThread}
              disabled={isDeletingThread}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingThread ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
