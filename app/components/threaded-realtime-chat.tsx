import { useThreadedChat } from '../../hooks/useThreadedChat'
import { RealtimeChat } from '../../components/realtime-chat'
import { useCurrentUserStore } from '../store/current-user';
import React from 'react';

interface ThreadedRealtimeChatProps {
  threadId: number
  currentUserId: number
  currentUserName?: string
  currentUserAvatar?: string
  currentUserEmail?: string
  currentPublicUserId?: number
  hideInput?: boolean
  initialMessages?: any[]
}

export function ThreadedRealtimeChat({ threadId, currentUserId, currentUserName, currentUserAvatar, currentUserEmail, currentPublicUserId, hideInput, initialMessages }: ThreadedRealtimeChatProps) {
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

  const publicUserId = currentPublicUserId ?? useCurrentUserStore((s) => s.publicUserId);

  // When sending a new message, include publicUserId as created_by
  const handleSendMessage = async (content: string) => {
    await sendMessage(content, publicUserId ?? undefined);
  };

  // Infinite scroll: load older messages when scrolled to top
  const chatContainerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
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

  // Scroll to bottom when a new message is added
  React.useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }, [messages]);

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
      />
      {isLoadingMore && <div className="absolute top-0 left-0 w-full text-center text-xs text-muted-foreground">Loading more…</div>}
    </div>
  )
} 