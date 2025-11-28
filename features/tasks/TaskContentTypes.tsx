"use client"

import React, { useState, useEffect } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../../app/components/ui/button"
import { Badge } from "../../app/components/ui/badge"
import { Plus, Trash2, Star, StarOff, Loader2 } from "lucide-react"
import { toast } from "../../app/components/ui/use-toast"

interface ContentTypeForTask {
  content_type_id: number
  content_type_title: string
  assigned: boolean
  ctt_id: string | null
  is_primary: boolean
  has_final_output: boolean
}

interface TaskContentTypesProps {
  taskId: number
}

export function TaskContentTypes({ taskId }: TaskContentTypesProps) {
  const [contentTypes, setContentTypes] = useState<ContentTypeForTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isActionLoading, setIsActionLoading] = useState<number | null>(null)
  const supabase = createClientComponentClient()

  const fetchContentTypes = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase.rpc('content_types_for_task', {
        p_task_id: taskId
      })
      
      if (error) throw error
      setContentTypes(data || [])
    } catch (error) {
      console.error('Failed to fetch content types:', error)
      toast({
        title: 'Error',
        description: 'Failed to load content types',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (taskId) {
      fetchContentTypes()
    }
  }, [taskId])

  const handleAddContentType = async (contentTypeId: number) => {
    try {
      setIsActionLoading(contentTypeId)
      const { error } = await supabase.rpc('ai_ensure_content_type_for_task', {
        p_task_id: taskId,
        p_content_type_id: contentTypeId,
        p_is_primary: false,
      })
      
      if (error) throw error
      
      toast({
        title: 'Success',
        description: 'Content type added to task',
      })
      
      await fetchContentTypes()
    } catch (error) {
      console.error('Failed to add content type:', error)
      toast({
        title: 'Error',
        description: 'Failed to add content type',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(null)
    }
  }

  const handleRemoveContentType = async (cttId: string) => {
    try {
      setIsActionLoading(parseInt(cttId))
      const { error } = await supabase
        .from('content_types_tasks')
        .delete()
        .eq('id', cttId)
      
      if (error) throw error
      
      toast({
        title: 'Success',
        description: 'Content type removed from task',
      })
      
      await fetchContentTypes()
    } catch (error) {
      console.error('Failed to remove content type:', error)
      toast({
        title: 'Error',
        description: 'Failed to remove content type',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(null)
    }
  }

  const handleSetPrimary = async (contentTypeId: number) => {
    try {
      setIsActionLoading(contentTypeId)
      const { error } = await supabase.rpc('set_primary_content_type_for_task', {
        p_task_id: taskId,
        p_content_type_id: contentTypeId,
      })
      
      if (error) throw error
      
      toast({
        title: 'Success',
        description: 'Primary content type updated',
      })
      
      await fetchContentTypes()
    } catch (error) {
      console.error('Failed to set primary content type:', error)
      toast({
        title: 'Error',
        description: 'Failed to update primary content type',
        variant: 'destructive',
      })
    } finally {
      setIsActionLoading(null)
    }
  }

  if (isLoading) {
    return (
      <div className="mt-6">
        <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Content Types</label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading content types...
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <label className="text-sm font-medium text-gray-400 text-left mb-1 block">Content Types</label>
      
      {contentTypes.length === 0 ? (
        <div className="text-sm text-muted-foreground">No content types assigned</div>
      ) : (
        <div className="space-y-2">
          {contentTypes.map((contentType) => (
            <div
              key={contentType.content_type_id}
              className="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{contentType.content_type_title}</span>
                  {contentType.is_primary && (
                    <Badge variant="secondary" className="text-xs">
                      Primary
                    </Badge>
                  )}
                  {contentType.has_final_output && (
                    <Badge variant="outline" className="text-xs">
                      Draft saved
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {contentType.assigned ? (
                  <>
                    {/* Primary toggle */}
                    <button
                      onClick={() => handleSetPrimary(contentType.content_type_id)}
                      disabled={isActionLoading === contentType.content_type_id}
                      className={`p-1 rounded transition-colors ${
                        contentType.is_primary 
                          ? 'text-yellow-600 hover:text-yellow-700' 
                          : 'text-gray-400 hover:text-yellow-600'
                      }`}
                      title={contentType.is_primary ? 'Remove as primary' : 'Set as primary'}
                    >
                      {isActionLoading === contentType.content_type_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : contentType.is_primary ? (
                        <Star className="w-4 h-4 fill-current" />
                      ) : (
                        <StarOff className="w-4 h-4" />
                      )}
                    </button>
                    
                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveContentType(contentType.ctt_id!)}
                      disabled={isActionLoading === contentType.content_type_id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {isActionLoading === contentType.content_type_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddContentType(contentType.content_type_id)}
                    disabled={isActionLoading === contentType.content_type_id}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    {isActionLoading === contentType.content_type_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Add
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
