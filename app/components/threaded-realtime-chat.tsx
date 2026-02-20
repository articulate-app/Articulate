'use client'

import { useThreadedChat } from '../../hooks/useThreadedChat'
import { RealtimeChat } from '../../components/realtime-chat'
import { useCurrentUserStore } from '../store/current-user'
import { useEffect, useRef, useState } from 'react'

interface ThreadedRealtimeChatProps {
  threadId: number
  currentUserId: number
  currentUserName?: string
  currentUserAvatar?: string
  currentUserEmail?: string
  currentPublicUserId?: number
  hideInput?: boolean
  initialMessages?: any[]
  focusedMentionId?: number | null
  onFocusedMentionCleared?: () => void
  onReplySelected?: (reply: { id: number; author?: string; preview: string }) => void
  groupByDate?: boolean
}

export function ThreadedRealtimeChat({ threadId, currentUserId, currentUserName, currentUserAvatar, currentUserEmail, currentPublicUserId, hideInput, initialMessages, focusedMentionId, onFocusedMentionCleared, onReplySelected, groupByDate }: ThreadedRealtimeChatProps) {
  const {
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    isLoading,
    error,
    hasMore,
    loadOlderMessages,
    isLoadingMore
  } = useThreadedChat(
    threadId,
    currentUserId,
    { displayName: currentUserName || 'You', avatar: currentUserAvatar, email: currentUserEmail },
    initialMessages
  )

  // IMPORTANT: always call hooks unconditionally (avoid hook-order bugs).
  const storePublicUserId = useCurrentUserStore((s) => s.publicUserId)
  const publicUserId = currentPublicUserId ?? storePublicUserId
  const [replyTo, setReplyTo] = useState<{ id: string; author?: string; preview: string } | null>(null)

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim()

  // When sending a new message, include publicUserId as created_by
  const handleSendMessage = async (content: string) => {
    const replyToId = replyTo?.id ? Number(replyTo.id) : null
    await sendMessage(content, publicUserId ?? undefined, {
      replyToId: Number.isFinite(replyToId as any) ? (replyToId as number) : null,
    });
    setReplyTo(null)
  };

  // Infinite scroll: load older messages when scrolled to top
  const chatContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (container.scrollTop === 0 && hasMore && !isLoadingMore) {
        loadOlderMessages();
      }
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, isLoadingMore, loadOlderMessages]);

  // Scroll to bottom when a new message is added (unless we're focusing on a specific message)
  useEffect(() => {
    if (focusedMentionId) return; // Don't auto-scroll if we're focusing on a message
    const container = chatContainerRef.current;
    if (!container) return;
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }, [messages, focusedMentionId]);

  // Handle focusing on a specific message (from search results)
  useEffect(() => {
    if (!focusedMentionId || !messages.length) return;

    // Wait a bit for messages to render
    const timer = setTimeout(() => {
      const el = document.querySelector(
        `[data-mention-id="${focusedMentionId}"]`
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-indigo-500", "ring-offset-2");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-indigo-500", "ring-offset-2");
          if (onFocusedMentionCleared) {
            onFocusedMentionCleared();
          }
        }, 2000);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [focusedMentionId, messages, onFocusedMentionCleared]);

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading chat…</div>
  if (error) return <div className="p-4 text-destructive">{error}</div>

  return (
    <div ref={chatContainerRef} className="relative h-full overflow-auto">
      <RealtimeChat
        roomName={`thread-${threadId}`}
        username={currentUserEmail || ''}
        messages={messages}
        onSend={handleSendMessage}
        onEdit={editMessage}
        onDelete={deleteMessage}
        hideInput={hideInput || !publicUserId}
        currentPublicUserId={publicUserId}
        focusedMentionId={focusedMentionId}
        groupByDate={groupByDate}
        onReplyMessage={(messageId) => {
          const msg = messages.find((m) => String(m.id) === String(messageId))
          if (!msg) return
          const payload = {
            id: Number(msg.id),
            author: msg.user?.displayName || msg.user?.email,
            preview: stripHtml(msg.content || '').slice(0, 120) || '…',
          }
          // If the inline composer is hidden (TaskDetails), delegate reply selection to parent UI.
          if (hideInput && onReplySelected) {
            if (Number.isFinite(payload.id)) onReplySelected(payload)
            return
          }
          setReplyTo({ id: String(payload.id), author: payload.author, preview: payload.preview })
        }}
        replyTo={hideInput ? null : replyTo}
        onClearReply={() => setReplyTo(null)}
      />
      {isLoadingMore && <div className="absolute top-0 left-0 w-full text-center text-xs text-muted-foreground">Loading more…</div>}
    </div>
  )
} 