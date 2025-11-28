"use client"

import React, { useMemo, useRef, useState, useEffect } from "react"
import type { AiThread } from "./types"
import { useMessages, useThreadContext, useUpdateVisibility, useContentTypesRealtime } from "./hooks"
import { MessageBubble } from "./MessageBubble"
import { Composer } from "./Composer"

interface ChatWindowProps {
  thread: AiThread
  taskId?: number
  activeChannelId?: number | null
  // Chat context for Build with AI flows
  chatContext?: {
    componentId?: string | null
    briefingMode?: boolean
    preFillMessage?: string
    mode?: "build_component" | "build_briefing" | null
  }
}

export function ChatWindow({ thread, taskId, activeChannelId, chatContext }: ChatWindowProps) {
  const { messages } = useMessages(thread?.id)
  const { context } = useThreadContext(thread?.id)
  const [pendingMsgs, setPendingMsgs] = useState<any[]>([])
  const updateVisibility = useUpdateVisibility()
  const chatEndRef = useRef<HTMLDivElement>(null)
  
  // Subscribe to content types realtime updates
  useContentTypesRealtime(taskId)

  const handleOptimistic = (temp: { id: string; content: string; attachments?: any[] }) => {
    setPendingMsgs(prev => {
      // Check if we already have a pending message with the same content
      const hasDuplicate = prev.some(pending => pending.content === temp.content && pending.role === 'user')
      if (hasDuplicate) {
        return prev // Don't add duplicate
      }
      return [...prev, { id: temp.id, thread_id: thread.id, role: 'user', content: temp.content, attachments: temp.attachments, status: 'pending', created_at: new Date().toISOString() }]
    })
  }

  // Remove pending messages when real messages arrive
  React.useEffect(() => {
    if (messages && messages.length > 0) {
      setPendingMsgs(prev => {
        // Remove any pending messages that have been confirmed by realtime
        // Match by content and role since IDs might be different
        const realMessages = messages.filter(m => m.role === 'user')
        return prev.filter(pending => {
          // Check if there's a real message with the same content and role
          const hasMatchingRealMessage = realMessages.some(real => 
            real.content === pending.content && real.role === pending.role
          )
          return !hasMatchingRealMessage
        })
      })
    }
  }, [messages])

  // Clear pending messages when thread changes
  React.useEffect(() => {
    setPendingMsgs([])
  }, [thread.id])

  const headerChips = useMemo(() => {
    const chips: string[] = []
    chips.push(thread.scope)
    if (thread.visibility) chips.push(thread.visibility)
    if (context?.effective_language_code) chips.push(context.effective_language_code)
    return chips
  }, [thread.scope, thread.visibility, context?.effective_language_code])

  const doSetVisibility = async (next: any) => {
    await updateVisibility(thread.id, next, thread.is_collaborative)
  }

  const allMessages = [...(messages || []), ...pendingMsgs]
  
  // Auto-scroll after every new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [allMessages.length])

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-4 space-y-4 min-h-0">
        {allMessages.map((m) => (
          <MessageBubble 
            key={m.id} 
            msg={m as any} 
            isMine={m.role === 'user'} 
            taskId={taskId}
            threadContext={context ?? undefined}
            activeChannelId={activeChannelId}
            chatContext={chatContext}
          />
        ))}
        <div ref={chatEndRef} />
      </div>
      <div className="p-4 flex-shrink-0">
        <Composer 
          threadId={thread.id} 
          onOptimistic={handleOptimistic} 
          activeChannelId={activeChannelId}
          preFillMessage={chatContext?.preFillMessage}
          mode={chatContext?.mode}
          componentId={chatContext?.componentId}
        />
      </div>
    </div>
  )
}


