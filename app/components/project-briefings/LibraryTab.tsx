"use client"

import React, { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { toast } from '../ui/use-toast'
import { Plus, Edit2, Trash2, Search } from 'lucide-react'
import {
  type ProjectComponent,
  fetchProjectComponents,
  createProjectComponent,
  updateProjectComponent,
  deleteProjectComponent,
  addProjectComponentToBriefing,
} from '../../lib/services/project-briefings'

interface LibraryTabProps {
  projectId: number
  selectedBriefingTypeId: number | null
  onRefresh: () => void
}

export function LibraryTab({
  projectId,
  selectedBriefingTypeId,
  onRefresh,
}: LibraryTabProps) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingComponent, setEditingComponent] = useState<ProjectComponent | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [componentToDelete, setComponentToDelete] = useState<ProjectComponent | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')

  // Fetch project components
  const { data: components, isLoading, error } = useQuery({
    queryKey: ['projBriefings:library', projectId],
    queryFn: async () => {
      const { data, error } = await fetchProjectComponents(projectId)
      if (error) throw error
      return data || []
    },
  })

  const filteredComponents = React.useMemo(() => {
    if (!components) return []
    if (!searchQuery.trim()) return components

    const query = searchQuery.toLowerCase()
    return components.filter(
      c =>
        c.title.toLowerCase().includes(query) ||
        (c.description && c.description.toLowerCase().includes(query))
    )
  }, [components, searchQuery])

  const resetForm = useCallback(() => {
    setTitle('')
    setDescription('')
    setRules('')
    setEditingComponent(null)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      })
      return
    }

    try {
      const { data, error } = await createProjectComponent(
        projectId,
        title.trim(),
        description.trim() || null,
        rules.trim() || null
      )
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Component created',
      })

      setIsCreateDialogOpen(false)
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library', projectId] })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create component',
        variant: 'destructive',
      })
    }
  }, [projectId, title, description, rules, resetForm, queryClient, onRefresh])

  const handleEdit = useCallback((component: ProjectComponent) => {
    setEditingComponent(component)
    setTitle(component.title)
    setDescription(component.description || '')
    setRules(component.rules || '')
    setIsCreateDialogOpen(true)
  }, [])

  const handleUpdate = useCallback(async () => {
    if (!editingComponent || !title.trim()) {
      toast({
        title: 'Error',
        description: 'Title is required',
        variant: 'destructive',
      })
      return
    }

    try {
      const { error } = await updateProjectComponent(editingComponent.id, {
        title: title.trim(),
        description: description.trim() || null,
        rules: rules.trim() || null,
      })
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Component updated',
      })

      setIsCreateDialogOpen(false)
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library', projectId] })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update component',
        variant: 'destructive',
      })
    }
  }, [editingComponent, title, description, rules, resetForm, queryClient, projectId, onRefresh])

  const handleDelete = useCallback(async () => {
    if (!componentToDelete) return

    try {
      const { error } = await deleteProjectComponent(componentToDelete.id)
      if (error) throw error

      toast({
        title: 'Success',
        description: 'Component deleted',
      })

      setIsDeleteDialogOpen(false)
      setComponentToDelete(null)
      queryClient.invalidateQueries({ queryKey: ['projBriefings:library', projectId] })
      onRefresh()
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete component',
        variant: 'destructive',
      })
    }
  }, [componentToDelete, queryClient, projectId, onRefresh])

  const handleAddToBriefing = useCallback(
    async (componentId: number) => {
      if (!selectedBriefingTypeId) {
        toast({
          title: 'Error',
          description: 'Please select a briefing type first',
          variant: 'destructive',
        })
        return
      }

      try {
        const { error } = await addProjectComponentToBriefing(
          projectId,
          selectedBriefingTypeId,
          componentId,
          null,
          null,
          null
        )
        if (error) throw error

        toast({
          title: 'Success',
          description: 'Component added to briefing template',
        })

        queryClient.invalidateQueries({
          queryKey: ['projBriefings:components', projectId, selectedBriefingTypeId],
        })
        onRefresh()
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to add component to briefing',
          variant: 'destructive',
        })
      }
    },
    [projectId, selectedBriefingTypeId, queryClient, onRefresh]
  )

  const handleDialogClose = useCallback(() => {
    setIsCreateDialogOpen(false)
    resetForm()
  }, [resetForm])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading components...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-red-600">Error loading components: {String(error)}</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Project Components Library</h2>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage project-scoped briefing components
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
          if (!open) {
            handleDialogClose()
          } else {
            setIsCreateDialogOpen(true)
            resetForm()
          }
        }}>
          <DialogTrigger asChild>
            <Button 
              size="sm" 
              className="gap-2"
              onClick={() => {
                setIsCreateDialogOpen(true)
                resetForm()
              }}
            >
              <Plus className="w-4 h-4" />
              New Component
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingComponent ? 'Edit Component' : 'Create New Component'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Component title"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Component description"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="rules">Rules</Label>
                <Textarea
                  id="rules"
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="Component rules or guidelines"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleDialogClose}>
                Cancel
              </Button>
              <Button
                onClick={editingComponent ? handleUpdate : handleCreate}
                disabled={!title.trim()}
              >
                {editingComponent ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Components list */}
      {filteredComponents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <p className="text-gray-500 mb-4">
            {searchQuery ? 'No components match your search' : 'No components created yet'}
          </p>
          <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Component
          </Button>
        </div>
      ) : (
        <div className="space-y-3 overflow-auto">
          {filteredComponents.map(component => (
            <div
              key={component.id}
              className="border rounded-lg p-4 bg-white border-gray-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900">{component.title}</h3>
                  {component.description && (
                    <p className="text-sm text-gray-600 mt-1">{component.description}</p>
                  )}
                  {component.rules && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-700">
                      <strong>Rules:</strong> {component.rules}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedBriefingTypeId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddToBriefing(component.id)}
                    >
                      Add to Current Briefing
                    </Button>
                  )}
                  <button
                    onClick={() => handleEdit(component)}
                    className="p-1 rounded hover:bg-gray-100 text-gray-600"
                    title="Edit component"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setComponentToDelete(component)
                      setIsDeleteDialogOpen(true)
                    }}
                    className="p-1 rounded hover:bg-red-50 text-red-500"
                    title="Delete component"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Component</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete "{componentToDelete?.title}"? This action cannot be
              undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

