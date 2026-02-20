'use client'

import { cn } from '@/lib/utils'
import { ChatMessageItem } from './chat-message'
import { useChatScroll } from '../hooks/use-chat-scroll'
import type { ChatMessage as BaseChatMessage } from '../hooks/useThreadedChat'

type ChatMessage = Omit<BaseChatMessage, 'user'> & {
  user: BaseChatMessage['user'] & { email?: string }
}
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, isToday, isYesterday } from 'date-fns'

interface RealtimeChatProps {
  roomName: string
  username: string
  onMessage?: (messages: ChatMessage[]) => void
  messages?: ChatMessage[]
  onSend?: (text: string) => void | Promise<void>
  onEdit?: (id: string, newContent: string) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
  hideInput?: boolean
  currentPublicUserId?: number | null
  focusedMentionId?: number | null
  onReplyMessage?: (messageId: string) => void
  replyTo?: { id: string; author?: string; preview: string } | null
  onClearReply?: () => void
  groupByDate?: boolean
}

/**
 * Realtime chat component
 * @param roomName - The name of the room to join. Each room is a unique chat.
 * @param username - The username of the user
 * @param onMessage - The callback function to handle the messages. Useful if you want to store the messages in a database.
 * @param messages - The messages to display in the chat. Useful if you want to display messages from a database.
 * @returns The chat component
 */
export const RealtimeChat = ({
  roomName,
  username,
  onMessage,
  messages: initialMessages = [],
  onSend,
  onEdit,
  onDelete,
  hideInput = false,
  currentPublicUserId,
  focusedMentionId,
  onReplyMessage,
  replyTo,
  onClearReply,
  groupByDate = false,
}: RealtimeChatProps) => {
  const { containerRef, scrollToBottom } = useChatScroll()

  const [newMessage, setNewMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const isConnected = !!onSend

  // Use only the messages prop
  const allMessages = useMemo(() => {
    const uniqueMessages = initialMessages.filter(
      (message, index, self) => index === self.findIndex((m) => m.id === message.id)
    )
    return uniqueMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [initialMessages])

  useEffect(() => {
    if (onMessage) {
      onMessage(allMessages)
    }
  }, [allMessages, onMessage])

  useEffect(() => {
    // Scroll to bottom whenever messages change
    scrollToBottom()
  }, [allMessages, scrollToBottom])

  const handleSendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!newMessage.trim() || !isConnected) return
      if (onSend) {
        onSend(newMessage)
      }
      setNewMessage('')
    },
    [newMessage, isConnected, onSend]
  )

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMessage>()
    for (const m of allMessages) map.set(String(m.id), m)
    return map
  }, [allMessages])

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()

  const getBucketLabel = (iso: string | undefined) => {
    if (!iso) return null
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    if (isToday(date)) return 'Today'
    if (isYesterday(date)) return 'Yesterday'
    const daysAgo = differenceInCalendarDays(new Date(), date)
    if (daysAgo >= 2 && daysAgo <= 6) return 'Past week'
    // This month bucket (roughly)
    const now = new Date()
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return 'This month'
    return 'Older'
  }

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground antialiased">
      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {allMessages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground">
            No messages found.
          </div>
        ) : null}
        <div className="space-y-1">
          {allMessages.map((message, index) => {
            const prevMessage = index > 0 ? allMessages[index - 1] : null
            const showHeader = !prevMessage || prevMessage.user.userId !== message.user.userId
            // Use created_by for 'my' message detection
            const isOwnMessage = currentPublicUserId != null && message.created_by === currentPublicUserId;

            // Check if this message should be highlighted (focusedMentionId matches message.id)
            const isFocused = focusedMentionId !== null && focusedMentionId !== undefined && 
              (message.id === focusedMentionId.toString() || Number(message.id) === focusedMentionId)

            const thisBucket = groupByDate ? getBucketLabel(message.createdAt) : null
            const prevBucket = groupByDate ? getBucketLabel(prevMessage?.createdAt) : null
            const showBucket = groupByDate && thisBucket && thisBucket !== prevBucket

            return (
              <div key={message.id} className="space-y-2">
                {showBucket ? (
                  <div className="flex items-center justify-center py-2">
                    <div className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                      {thisBucket}
                    </div>
                  </div>
                ) : null}
                <div
                  data-mention-id={message.id}
                  className="animate-in fade-in slide-in-from-bottom-4 duration-300"
                >
                  <ChatMessageItem
                    message={message}
                    showHeader={showHeader}
                    isEditing={editingId === message.id}
                    editValue={editValue}
                    isProcessing={isProcessing}
                    onReply={() => onReplyMessage?.(message.id)}
                    replyPreview={
                      typeof (message as any).reply_to_id === 'number'
                        ? (() => {
                            const replied = messagesById.get(String((message as any).reply_to_id))
                            if (!replied) return null
                            const author = replied.user?.displayName || replied.user?.email
                            return { author, preview: stripHtml(replied.content || '').slice(0, 120) || '…' }
                          })()
                        : null
                    }
                    onEditStart={() => {
                      setEditingId(message.id)
                      setEditValue(message.content)
                    }}
                    onEditChange={setEditValue}
                    onEditSave={async () => {
                      if (!onEdit) return
                      setIsProcessing(true)
                      await onEdit(message.id, editValue)
                      setIsProcessing(false)
                      setEditingId(null)
                    }}
                    onEditCancel={() => setEditingId(null)}
                    onDelete={async () => {
                      if (!onDelete) return
                      setIsProcessing(true)
                      await onDelete(message.id)
                      setIsProcessing(false)
                    }}
                    currentPublicUserId={currentPublicUserId}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {!hideInput && (
        <form onSubmit={handleSendMessage} className="flex w-full flex-col gap-2 border-t border-border p-4">
          {replyTo ? (
            <div className="flex items-start justify-between gap-3 rounded-md border bg-gray-50 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-700">Replying to {replyTo.author || 'message'}</div>
                <div className="text-xs text-gray-600 truncate">{replyTo.preview}</div>
              </div>
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-900"
                onClick={onClearReply}
                aria-label="Cancel reply"
                title="Cancel reply"
              >
                ×
              </button>
            </div>
          ) : null}
          <div className="flex w-full gap-2">
          <Input
            className={cn(
              'rounded-full bg-background text-sm transition-all duration-300',
              isConnected && newMessage.trim() ? 'w-[calc(100%-36px)]' : 'w-full'
            )}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={!isConnected}
          />
          {isConnected && newMessage.trim() && (
            <Button
              className="aspect-square rounded-full animate-in fade-in slide-in-from-right-4 duration-300"
              type="submit"
              disabled={!isConnected}
            >
              <Send className="size-4" />
            </Button>
          )}
          </div>
        </form>
      )}
    </div>
  )
}
