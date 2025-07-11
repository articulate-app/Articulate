import { useThreadedChat } from '../../hooks/useThreadedChat'
import { RealtimeChat } from '../../components/realtime-chat'

interface ThreadedRealtimeChatProps {
  threadId: number
  currentUserId: number
  currentUserName?: string
  currentUserAvatar?: string
  hideInput?: boolean
}

export function ThreadedRealtimeChat({ threadId, currentUserId, currentUserName, currentUserAvatar, hideInput }: ThreadedRealtimeChatProps) {
  const { messages, sendMessage, editMessage, deleteMessage, isLoading, error } = useThreadedChat(
    threadId,
    currentUserId,
    { displayName: currentUserName || 'You', avatar: currentUserAvatar }
  )

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading chat…</div>
  if (error) return <div className="p-4 text-destructive">{error}</div>

  return (
    <>
      <RealtimeChat
        roomName={`thread-${threadId}`}
        username={String(currentUserId)}
        messages={messages}
        onSend={text => sendMessage(text, currentUserId)}
        onEdit={editMessage}
        onDelete={deleteMessage}
        hideInput={hideInput}
      />
    </>
  )
} 