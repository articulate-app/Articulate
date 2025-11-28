"use client"

import React, { useState, useMemo } from "react"
import type { AiMessage } from "./types"
import { Attachments } from "./Attachments"
import { MessageActionLog } from "./MessageActionLog"
import { ContentTypePicker } from "./ContentTypePicker"
import { ComponentPicker } from "./ComponentPicker"
import { Button } from "../../app/components/ui/button"
import { FileText, Copy, Edit2, Send, X } from "lucide-react"
import { marked } from "marked"
import { toast } from "../../app/components/ui/use-toast"
import { getSupabaseBrowser } from "../../lib/supabase-browser"

interface MessageBubbleProps {
  msg: AiMessage
  isMine: boolean
  taskId?: number
  threadContext?: { 
    effective_language_code?: string | null
    project_id?: number | null
    task_id?: number | null
  }
  activeChannelId?: number | null
  chatContext?: {
    componentId?: string | null
    briefingMode?: boolean
  }
}

export function MessageBubble({ msg, isMine, taskId, threadContext, activeChannelId, chatContext }: MessageBubbleProps) {
  const toolResults = (msg.content_json as any)?.tool_results
  const status = msg.status
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [isComponentPickerOpen, setIsComponentPickerOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(msg.content || '')
  
  // Convert markdown to HTML for assistant messages
  const htmlContent = useMemo(() => {
    if (!msg.content || msg.role !== 'assistant') return null
    try {
      // Configure marked options
      marked.setOptions({
        breaks: true, // Convert \n to <br>
        gfm: true, // GitHub Flavored Markdown
      })
      return marked.parse(msg.content)
    } catch (error) {
      console.error('Error parsing markdown:', error)
      return msg.content // Fallback to original content
    }
  }, [msg.content, msg.role])
  
  // Copy message to clipboard
  const handleCopy = async () => {
    if (!msg.content) return
    try {
      await navigator.clipboard.writeText(msg.content)
      toast({
        title: 'Copied to clipboard',
        description: 'Message content copied',
      })
    } catch (error) {
      console.error('Failed to copy:', error)
      toast({
        title: 'Copy failed',
        description: 'Failed to copy to clipboard',
        variant: 'destructive'
      })
    }
  }
  
  // Start editing message
  const handleEdit = () => {
    setIsEditing(true)
    setEditedContent(msg.content || '')
  }
  
  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditedContent(msg.content || '')
  }
  
  // Send edited message and regenerate AI response
  const handleSendEdit = async () => {
    if (!editedContent.trim() || !msg.thread_id) return
    
    const supabase = getSupabaseBrowser()
    
    try {
      // 1. Update the message content in database
      const { error: updateError } = await supabase
        .from('ai_messages')
        .update({ content: editedContent.trim() })
        .eq('id', msg.id)
      
      if (updateError) throw updateError
      
      // 2. Delete all messages that came after this one (to re-generate from this point)
      const { error: deleteError } = await supabase
        .from('ai_messages')
        .delete()
        .eq('thread_id', msg.thread_id)
        .gt('created_at', msg.created_at)
      
      if (deleteError) throw deleteError
      
      // 3. Call ai-chat to regenerate response
      const session = (await supabase.auth.getSession()).data.session
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          thread_id: msg.thread_id, 
          message: editedContent.trim(),
          active_channel_id: activeChannelId ?? null,
          mode: null,
          component_id: chatContext?.componentId ?? null,
          auto_run: true,
        }),
      })
      
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText)
      }
      
      setIsEditing(false)
      
      toast({
        title: 'Message updated',
        description: 'AI is regenerating response...',
      })
      
    } catch (error: any) {
      console.error('Failed to edit message:', error)
      toast({
        title: 'Edit failed',
        description: error.message || 'Failed to update message',
        variant: 'destructive'
      })
    }
  }
  
  // Only show save button for assistant messages with content but no tool results
  const shouldShowSaveButton = !isMine && 
    msg.role === 'assistant' && 
    msg.content && 
    msg.content.trim().length > 10 && // Minimum content length
    (!toolResults || toolResults.length === 0) &&
    taskId
  
  // Contextual save buttons per spec
  // If component-based chat, show "Save to component"
  const shouldShowSaveToComponent = shouldShowSaveButton && chatContext?.componentId
  // If briefing-based chat (no componentId but has channel), show "Apply to briefing"
  const shouldShowApplyToBriefing = shouldShowSaveButton && !chatContext?.componentId && activeChannelId

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} w-full`}> 
      <div className={`max-w-[80%] min-w-0 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${isMine ? 'bg-blue-50' : 'bg-muted'}`}>
        {status === 'pending' && (
          <div className="text-xs text-muted-foreground">Sending…</div>
        )}
        {status === 'failed' && (
          <div className="text-xs text-red-600">Failed to send. Retry?</div>
        )}
        
        {/* Render AI messages as HTML (markdown converted), user messages as plain text or editable */}
        {isEditing && isMine ? (
          <div className="space-y-2">
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full border rounded p-2 text-sm resize-none min-h-[80px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  e.preventDefault()
                  handleSendEdit()
                } else if (e.key === 'Escape') {
                  handleCancelEdit()
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSendEdit}
                disabled={!editedContent.trim()}
                className="h-7 px-2 text-xs"
              >
                <Send className="w-3 h-3 mr-1" />
                Send & Regenerate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelEdit}
                className="h-7 px-2 text-xs"
              >
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
              <span className="text-xs text-gray-400 ml-auto">⌘+Enter to send</span>
            </div>
          </div>
        ) : msg.content ? (
          msg.role === 'assistant' && htmlContent ? (
            <div 
              className="assistant-message prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap">{msg.content}</div>
          )
        ) : null}
        <Attachments items={msg.attachments} />
        
        {/* Action Log for tool results */}
        {toolResults && Array.isArray(toolResults) && toolResults.length > 0 && (
          <MessageActionLog toolResults={toolResults} />
        )}
        
        {/* Minimalistic action icons below messages (hide when editing) */}
        {!isEditing && (
          <div className="mt-2 flex items-center gap-1">
            {/* For user messages: show edit icon */}
            {isMine && (
              <button
                onClick={handleEdit}
                className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors"
                title="Edit message"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
          
          {/* For AI messages: show copy icon and save buttons */}
          {!isMine && msg.role === 'assistant' && (
            <>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              
              {/* Contextual save buttons */}
              {shouldShowSaveButton && (
                <>
                  <div className="h-4 w-px bg-gray-300 mx-1" />
                  {shouldShowSaveToComponent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsComponentPickerOpen(true)}
                      className="h-7 px-2 text-xs"
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      Save to component
                    </Button>
                  )}
                  {shouldShowApplyToBriefing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsComponentPickerOpen(true)}
                      className="h-7 px-2 text-xs"
                    >
                      <FileText className="w-3 h-3 mr-1" />
                      Apply to briefing
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          </div>
        )}
      </div>
      
      {/* Component Picker Dialog */}
      {taskId && activeChannelId && (
        <ComponentPicker
          isOpen={isComponentPickerOpen}
          onClose={() => setIsComponentPickerOpen(false)}
          taskId={taskId}
          channelId={activeChannelId}
          messageContent={msg.content || ''}
        />
      )}
    </div>
  )
}


