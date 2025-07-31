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
}: RealtimeChatProps) => {
  const { containerRef, scrollToBottom } = useChatScroll()

  const [newMessage, setNewMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const isConnected = !!onSend
  const [search, setSearch] = useState('');

  // Use only the messages prop
  const allMessages = useMemo(() => {
    const uniqueMessages = initialMessages.filter(
      (message, index, self) => index === self.findIndex((m) => m.id === message.id)
    )
    return uniqueMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [initialMessages])

  // Filtered messages for search
  const filteredMessages = useMemo(() => {
    if (!search.trim()) return allMessages;
    const s = search.trim().toLowerCase();
    return allMessages.filter(m => {
      const content = (m.content || '').toLowerCase();
      const user = m.user || {};
      const name = (user.displayName || user.email || user.userId || '').toLowerCase();
      return content.includes(s) || name.includes(s);
    });
  }, [allMessages, search]);

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

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground antialiased">
      {/* Search bar for mentions/messages */}
      <div className="p-4 pb-0">
        <Input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search mentions..."
          className="w-full mb-2"
        />
      </div>
      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground">
            No messages found.
          </div>
        ) : null}
        <div className="space-y-1">
          {filteredMessages.map((message, index) => {
            const prevMessage = index > 0 ? filteredMessages[index - 1] : null
            const showHeader = !prevMessage || prevMessage.user.userId !== message.user.userId
            // Use created_by for 'my' message detection
            const isOwnMessage = currentPublicUserId != null && message.created_by === currentPublicUserId;

            return (
              <div
                key={message.id}
                className="animate-in fade-in slide-in-from-bottom-4 duration-300"
              >
                <ChatMessageItem
                  message={message}
                  showHeader={showHeader}
                  isEditing={editingId === message.id}
                  editValue={editValue}
                  isProcessing={isProcessing}
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
            )
          })}
        </div>
      </div>
      {!hideInput && (
        <form onSubmit={handleSendMessage} className="flex w-full gap-2 border-t border-border p-4">
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
        </form>
      )}
    </div>
  )
}
