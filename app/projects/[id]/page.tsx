'use client'

import { BriefingsPage } from '../../components/project-briefings/BriefingsPage'
import { useParams, useRouter } from 'next/navigation'
import { Sidebar } from '../../components/ui/Sidebar'
import { useState } from 'react'
import { Share2, MoreVertical, Trash2, Copy } from 'lucide-react'
import { Button } from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { toast } from '../../components/ui/use-toast'
import { deleteProject, duplicateProject } from '../../lib/services/projects'

export default function ProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = parseInt(params.id as string, 10)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [duplicateProjectName, setDuplicateProjectName] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)

  const handleDeleteProject = async () => {
    setIsDeleting(true)
    try {
      const { error } = await deleteProject(projectId)
      
      if (error) throw error

      toast({
        title: "Success",
        description: "Project deleted successfully",
      })

      // Navigate to tasks page
      router.push('/tasks')
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete project",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleDuplicateProject = async () => {
    if (!duplicateProjectName.trim()) {
      toast({
        title: "Validation Error",
        description: "Project name is required",
        variant: "destructive",
      })
      return
    }

    setIsDuplicating(true)
    try {
      const { data, error } = await duplicateProject(projectId, duplicateProjectName.trim())
      
      if (error) throw error

      if (!data) {
        throw new Error("Failed to duplicate project")
      }

      toast({
        title: "Success",
        description: "Project duplicated successfully",
      })

      // Navigate to the new project
      router.push(`/projects/${data.id}`)

      setShowDuplicateDialog(false)
      setDuplicateProjectName("")
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to duplicate project",
        variant: "destructive",
      })
    } finally {
      setIsDuplicating(false)
    }
  }

  const handleShare = () => {
    // Copy the current URL to clipboard
    const url = window.location.href
    navigator.clipboard.writeText(url).then(() => {
      toast({
        title: "Success",
        description: "Project link copied to clipboard",
      })
    }).catch(() => {
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive",
      })
    })
  }

  if (isNaN(projectId)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600">Invalid project ID</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Header Bar */}
      <header className="w-full sticky top-0 z-30 bg-white border-b flex items-center h-16 px-4 gap-4 shadow-sm">
        {/* Hamburger icon */}
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
        {/* App name */}
        <span className="text-2xl font-bold tracking-tight text-gray-900 select-none mr-4">Articulate</span>
        {/* Search bar hidden for project briefing page */}
        
        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={handleShare}
            title="Share project"
            className="h-9 w-9"
          >
            <Share2 className="w-4 h-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate Project
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`border-r border-gray-200 transition-all duration-300 ease-in-out z-20 flex-shrink-0 ${isSidebarCollapsed ? 'w-16' : 'w-64'}`}>
          <Sidebar isCollapsed={isSidebarCollapsed} />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <BriefingsPage 
            projectId={projectId}
          />
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone and will mark the project as inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Project Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Project</DialogTitle>
            <DialogDescription>
              Enter a name for the duplicated project
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-name">
                Project Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="duplicate-name"
                value={duplicateProjectName}
                onChange={(e) => setDuplicateProjectName(e.target.value)}
                placeholder="e.g., Project Copy"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isDuplicating) {
                    handleDuplicateProject()
                  }
                }}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDuplicateDialog(false)
                setDuplicateProjectName("")
              }}
              disabled={isDuplicating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDuplicateProject}
              disabled={isDuplicating || !duplicateProjectName.trim()}
            >
              {isDuplicating ? "Duplicating..." : "Duplicate Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

