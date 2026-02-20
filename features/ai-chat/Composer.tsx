"use client"

import React, { useCallback, useMemo, useRef, useState, useEffect } from "react"
import { getSupabaseBrowser } from "../../lib/supabase-browser"
import type { AiAttachmentMeta } from "./types"

interface ComposerProps {
  threadId: string
  onOptimistic?: (temp: { id: string; content: string; attachments?: AiAttachmentMeta[] }) => void
  activeChannelId?: number | null
  preFillMessage?: string
  mode?: "build_component" | "build_briefing" | null
  componentId?: string | null
  autoRun?: boolean // Controls auto_run parameter (defaults to false)
}

export function Composer({ threadId, onOptimistic, activeChannelId, preFillMessage, mode, componentId, autoRun = false }: ComposerProps) {
  const supabase = getSupabaseBrowser()
  const [text, setText] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [isSending, setIsSending] = useState(false)
  
  // Pre-fill message from Build with AI flows
  useEffect(() => {
    if (preFillMessage) {
      setText(preFillMessage)
    }
  }, [preFillMessage])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    setFiles(Array.from(e.target.files))
  }

  const uploadAttachments = useCallback(async (filesToUpload: File[]): Promise<AiAttachmentMeta[]> => {
    const attachments: AiAttachmentMeta[] = []
    for (const file of filesToUpload) {
      const path = `ai/${threadId}/${Date.now()}_${file.name}`
      const { data: up, error } = await supabase.storage.from('attachments').upload(path, file, { upsert: false })
      if (error) throw error
      attachments.push({ file_name: file.name, file_path: up.path, mime_type: file.type, size: file.size })
    }
    return attachments
  }, [supabase, threadId])

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed && files.length === 0) return
    
    // Store values before clearing
    const messageText = trimmed
    const messageFiles = [...files]
    
    // Clear input immediately for better UX
    setText("")
    setFiles([])
    setIsSending(true)
    
    try {
      const attachments = await uploadAttachments(messageFiles)
      const tempId = `temp-${Date.now()}`
      onOptimistic?.({ id: tempId, content: messageText, attachments })

      const session = (await supabase.auth.getSession()).data.session
      
      // Use new Edge Function contract with configurable auto_run
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          thread_id: threadId, 
          message: messageText,  // Always send user's message text, never null
          attachments,
          active_channel_id: activeChannelId ?? null,
          mode: mode ?? null,  // Pass mode from Build with AI flows
          component_id: componentId ?? null,  // Pass componentId from Build with AI flows
          auto_run: autoRun,  // Configurable: true for normal chat, false for generic builds
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText)
      }
    } catch (e) {
      console.error('send failed', e)
      // optimistic error handled by caller via message status when realtime doesn't confirm
    } finally {
      setIsSending(false)
    }
  }, [text, files, supabase, threadId, uploadAttachments, onOptimistic, activeChannelId, mode, componentId, autoRun])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  // Auto-resize textarea based on content
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto'
    // Set height based on content, with min 80px and max 400px
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 80), 400)
    textarea.style.height = `${newHeight}px`
  }, [text])

  return (
    <div className="border-t pt-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type a message..."
        className="w-full border rounded p-2 text-sm resize-none overflow-y-auto"
        style={{ minHeight: '80px', maxHeight: '400px' }}
      />
      <div className="mt-2 flex items-center gap-2">
        <input type="file" multiple onChange={onFileChange} />
        <button className="px-3 py-1 text-sm rounded bg-black text-white disabled:opacity-50" onClick={() => void send()} disabled={isSending}>
          Send
        </button>
      </div>
    </div>
  )
}


