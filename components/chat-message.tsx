import { cn } from '@/lib/utils'
import type { ChatMessage } from '../hooks/useThreadedChat'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'

interface ChatMessageItemProps {
  message: ChatMessage
  isOwnMessage: boolean
  showHeader: boolean
  isEditing?: boolean
  editValue?: string
  isProcessing?: boolean
  onEditStart?: () => void
  onEditChange?: (value: string) => void
  onEditSave?: () => void
  onEditCancel?: () => void
  onDelete?: () => void
}

export const ChatMessageItem = ({
  message,
  isOwnMessage,
  showHeader,
  isEditing = false,
  editValue = '',
  isProcessing = false,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
}: ChatMessageItemProps) => {
  const [showMobileActions, setShowMobileActions] = useState(false)
  let longPressTimer: NodeJS.Timeout | null = null

  return (
    <div
      className={`flex mt-2 ${isOwnMessage ? 'justify-end' : 'justify-start'} group`}
      onTouchStart={isOwnMessage ? () => {
        longPressTimer = setTimeout(() => setShowMobileActions(true), 500)
      } : undefined}
      onTouchEnd={isOwnMessage ? () => {
        if (longPressTimer) clearTimeout(longPressTimer)
      } : undefined}
    >
      <div
        className={cn('max-w-[75%] w-fit flex flex-col gap-1', {
          'items-end': isOwnMessage,
        })}
      >
        {showHeader && (
          <div
            className={cn('flex items-center gap-2 text-xs px-3', {
              'justify-end flex-row-reverse': isOwnMessage,
            })}
          >
            <span className={'font-medium'}>{message.user.displayName}</span>
          </div>
        )}
        {isEditing ? (
          <div className="flex gap-2 items-center">
            <input
              className="py-1 px-2 rounded border text-sm w-48"
              value={editValue}
              onChange={e => onEditChange?.(e.target.value)}
              disabled={isProcessing}
              maxLength={2000}
              autoFocus
            />
            <button className="text-xs text-primary hover:underline" onClick={onEditSave} disabled={isProcessing}>Save</button>
            <button className="text-xs text-muted-foreground hover:underline" onClick={onEditCancel} disabled={isProcessing}>Cancel</button>
          </div>
        ) : (
          <>
            <div
              className={cn(
                'py-2 px-3 rounded-xl text-sm w-fit',
                isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              )}
            >
              {message.content}
            </div>
            <div className={cn('flex items-center gap-2 text-xs text-muted-foreground mt-1', isOwnMessage ? 'justify-end' : 'justify-start')}
            >
              {new Date(
                message.createdAt.endsWith('Z') ? message.createdAt : message.createdAt + 'Z'
              ).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })}
              {isOwnMessage && (
                <span className="hidden md:flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button aria-label="Edit message" className="hover:text-primary" onClick={onEditStart} disabled={isProcessing}>
                    <Pencil size={16} />
                  </button>
                  <button aria-label="Delete message" className="hover:text-destructive" onClick={onDelete} disabled={isProcessing}>
                    <Trash2 size={16} />
                  </button>
                </span>
              )}
              {isOwnMessage && showMobileActions && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMobileActions(false)}>
                  <div className="bg-white rounded shadow p-4 flex flex-col gap-2 min-w-[120px]">
                    <button className="flex items-center gap-2 text-sm py-2 px-3 hover:bg-muted rounded" onClick={() => { setShowMobileActions(false); onEditStart?.(); }}>
                      <Pencil size={16} /> Edit
                    </button>
                    <button className="flex items-center gap-2 text-sm py-2 px-3 text-destructive hover:bg-muted rounded" onClick={() => { setShowMobileActions(false); onDelete?.(); }}>
                      <Trash2 size={16} /> Delete
                    </button>
                    <button className="flex items-center gap-2 text-sm py-2 px-3 hover:bg-muted rounded" onClick={() => setShowMobileActions(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
