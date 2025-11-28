"use client"

import React, { useState, useEffect } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Button } from "../../app/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "../../app/components/ui/dialog"
import { Loader2 } from "lucide-react"

interface ContentType {
  content_type_id: number
  content_type_title: string
  assigned: boolean
  ctt_id: string | null
  is_primary: boolean
  has_final_output: boolean
}

interface ContentTypePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (contentTypeId: number) => void
  taskId: number
  messageContent: string
  messageId: string
  languageCode?: string | null
}

export function ContentTypePicker({ 
  isOpen, 
  onClose, 
  onSelect, 
  taskId, 
  messageContent, 
  messageId,
  languageCode 
}: ContentTypePickerProps) {
  const supabase = createClientComponentClient()
  const [contentTypes, setContentTypes] = useState<ContentType[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedContentType, setSavedContentType] = useState<number | null>(null)

  useEffect(() => {
    if (isOpen && taskId) {
      fetchContentTypes()
    }
  }, [isOpen, taskId])

  const fetchContentTypes = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.rpc('content_types_for_task', { 
        p_task_id: taskId 
      })
      if (error) throw error
      setContentTypes(data || [])
    } catch (error) {
      console.error('Error fetching content types:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelect = async (contentTypeId: number) => {
    setIsSaving(true)
    try {
      // First, ensure the content type is assigned to the task
      const { data: ctt_id, error: ensureError } = await supabase.rpc('ai_ensure_content_type_for_task', {
        p_task_id: taskId,
        p_content_type_id: contentTypeId,
        p_is_primary: false
      })
      
      if (ensureError) throw ensureError

      // Then save the final output
      const { error: saveError } = await supabase.rpc('ai_save_final_output', {
        p_ctt_id: ctt_id,
        p_output_text: messageContent,
        p_output_html: null,
        p_language_code: languageCode,
        p_from_message_id: messageId
      })

      if (saveError) throw saveError

      setSavedContentType(contentTypeId)
      onSelect(contentTypeId)
      
      // Close after a short delay to show the "Saved" message
      setTimeout(() => {
        onClose()
        setSavedContentType(null)
      }, 1500)
    } catch (error) {
      console.error('Error saving content type:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogTitle>Save as Content Type</DialogTitle>
        
        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-2">
              {contentTypes.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">
                  No content types available for this task
                </div>
              ) : (
                contentTypes.map((ct) => (
                  <Button
                    key={ct.content_type_id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleSelect(ct.content_type_id)}
                    disabled={isSaving}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{ct.content_type_title}</span>
                      {savedContentType === ct.content_type_id && (
                        <span className="text-green-600 text-sm">Saved!</span>
                      )}
                    </div>
                  </Button>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
