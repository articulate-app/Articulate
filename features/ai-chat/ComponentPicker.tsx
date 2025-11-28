"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../app/components/ui/dialog"
import { Button } from "../../app/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../app/components/ui/select"
import { toast } from "../../app/components/ui/use-toast"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import { applyToComponent } from "./ai-utils"
import { Loader2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

interface ComponentPickerProps {
  isOpen: boolean
  onClose: () => void
  taskId: number
  channelId: number
  messageContent: string
}

interface Component {
  briefing_component_id: number | null
  project_component_id: number | null
  title: string
  custom_title: string | null
}

export function ComponentPicker({
  isOpen,
  onClose,
  taskId,
  channelId,
  messageContent,
}: ComponentPickerProps) {
  const [components, setComponents] = useState<Component[]>([])
  const [selectedComponentId, setSelectedComponentId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Fetch components for the task × channel
  useEffect(() => {
    if (!isOpen) return

    const fetchComponents = async () => {
      setIsLoading(true)
      try {
        const supabase = getSupabaseBrowser()
        const { data, error } = await supabase.rpc('tc_components_for_task_channel', {
          p_task_id: taskId,
          p_channel_id: channelId
        })

        if (error) throw error

        // Filter to only selected components
        const selectedComponents = (data || [])
          .filter((c: any) => c.selected)
          .map((c: any) => ({
            briefing_component_id: c.briefing_component_id,
            project_component_id: c.project_component_id,
            title: c.title,
            custom_title: c.custom_title,
          }))

        setComponents(selectedComponents)

        // Auto-select first component if only one
        if (selectedComponents.length === 1) {
          const firstId = selectedComponents[0].briefing_component_id || selectedComponents[0].project_component_id
          setSelectedComponentId(firstId)
        }
      } catch (err: any) {
        console.error('Failed to fetch components:', err)
        toast({
          title: 'Error loading components',
          description: err.message,
          variant: 'destructive'
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchComponents()
  }, [isOpen, taskId, channelId])

  const handleApply = async () => {
    if (!selectedComponentId) {
      toast({
        title: 'No component selected',
        description: 'Please select a component',
        variant: 'destructive'
      })
      return
    }

    setIsSaving(true)
    try {
      await applyToComponent({
        taskId,
        channelId,
        briefingComponentId: selectedComponentId,
        contentText: messageContent,
      })

      toast({
        title: 'Content applied',
        description: 'AI-generated content has been applied to the component',
      })

      // Close the dialog
      onClose()
      
      // Close AI chat pane and expand the component in content tab
      const newParams = new URLSearchParams(searchParams.toString())
      newParams.delete('middleView')
      newParams.delete('aiThreadId')
      newParams.delete('chatMode')
      newParams.delete('chatComponentId')
      newParams.delete('chatPreFill')
      // Add expand component param to trigger expansion
      newParams.set('expandComponent', selectedComponentId.toString())
      
      router.push(`?${newParams.toString()}`, { scroll: false })
      
    } catch (err: any) {
      console.error('Failed to apply content:', err)
      toast({
        title: 'Failed to apply content',
        description: err.message,
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply to Component</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : components.length === 0 ? (
            <p className="text-sm text-gray-500">
              No components available for this channel. Please ensure components are selected.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Component</label>
                <Select
                  value={selectedComponentId?.toString() || ''}
                  onValueChange={(value) => setSelectedComponentId(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a component..." />
                  </SelectTrigger>
                  <SelectContent>
                    {components.map((component) => {
                      const id = component.briefing_component_id || component.project_component_id
                      const displayTitle = component.custom_title || component.title
                      return (
                        <SelectItem key={id} value={id!.toString()}>
                          {displayTitle}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Content Preview</label>
                <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs">
                  {messageContent.substring(0, 500)}
                  {messageContent.length > 500 && '...'}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedComponentId || isSaving || isLoading}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Apply to Component
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

