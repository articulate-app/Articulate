import { cn } from '@/lib/utils'
import type { ChatMessage as BaseChatMessage } from '../hooks/useThreadedChat'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';

// Extend ChatMessage to allow optional attachment
export type ChatMessageWithAttachment = BaseChatMessage & { attachment?: string }

interface ChatMessageItemProps {
  message: ChatMessageWithAttachment
  showHeader: boolean
  isEditing?: boolean
  editValue?: string
  isProcessing?: boolean
  onEditStart?: () => void
  onEditChange?: (value: string) => void
  onEditSave?: () => void
  onEditCancel?: () => void
  onDelete?: () => void
  currentPublicUserId?: number | string | null
}

// Minimalistic palette
const AVATAR_COLORS = [
  'bg-gray-400 text-white',
  'bg-blue-600 text-white',
  'bg-gray-700 text-white',
  'bg-blue-400 text-white',
]

function getAvatarColor(userId: string, isMe: boolean) {
  if (isMe) return 'bg-black text-white';
  // Simple hash for consistent color
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function getFriendlyDate(createdAt: string | Date | undefined) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (isToday(date)) {
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'just now';
    return format(date, 'HH:mm');
  } else if (isYesterday(date)) {
    return 'yesterday';
  } else {
    const daysAgo = differenceInDays(new Date(), date);
    if (daysAgo < 10) return `${daysAgo} days ago`;
    return format(date, 'yyyy-MM-dd');
  }
}

function getFileIcon(ext: string) {
  if (!ext) return null;
  if (['pdf'].includes(ext)) return (
    <span className="text-red-500"><svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.828A2 2 0 0 0 19.414 7.414l-4.828-4.828A2 2 0 0 0 12.172 2H6zm6 1.414L18.586 10H13a1 1 0 0 1-1-1V3.414z"/></svg></span>
  );
  if (['doc', 'docx'].includes(ext)) return (
    <span className="text-blue-500"><svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.828A2 2 0 0 0 19.414 7.414l-4.828-4.828A2 2 0 0 0 12.172 2H6zm6 1.414L18.586 10H13a1 1 0 0 1-1-1V3.414z"/></svg></span>
  );
  return <span className="text-gray-400"><svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect width="20" height="24" x="2" y="2" rx="2" fill="currentColor" opacity=".1"/><rect width="20" height="24" x="2" y="2" rx="2" stroke="currentColor" strokeWidth="2"/></svg></span>;
}

function getFileName(url: string) {
  if (!url) return '';
  try {
    const fileName = url.split('/').pop();
    if (!fileName) return url;
    return decodeURIComponent(fileName.split('?')[0]);
  } catch {
    return url;
  }
}

function getFileExt(url: string) {
  const name = getFileName(url);
  const parts = name.split('.');
  const extension = parts.length > 1 ? parts.pop() : undefined;
  return extension ? extension.toLowerCase() : '';
}

export const ChatMessageItem = ({
  message,
  showHeader,
  isEditing = false,
  editValue = '',
  isProcessing = false,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  currentPublicUserId,
}: Omit<ChatMessageItemProps, 'isOwnMessage'>) => {
  const [showMobileActions, setShowMobileActions] = useState(false)
  let longPressTimer: NodeJS.Timeout | null = null

  // Avatar and name
  const user: Record<string, any> = (typeof message.user === 'object' && message.user !== null) ? message.user : {};
  const displayName = typeof user?.displayName === 'string' && user.displayName
    ? user.displayName
    : typeof user?.email === 'string' && user.email
    ? user.email
    : typeof user?.userId === 'string' && user.userId
    ? user.userId
    : 'User';
  const initialsSource = typeof user?.displayName === 'string' && user.displayName
    ? user.displayName
    : typeof user?.email === 'string' && user.email
    ? user.email
    : '?';
  const initials = initialsSource.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const friendlyDate = getFriendlyDate(message.createdAt ?? '');
  const exactDate = message.createdAt ? format(new Date(message.createdAt), 'yyyy-MM-dd HH:mm:ss') : '';
  // Determine if this is the current user
  const isMe = currentPublicUserId != null && (String(user?.userId ?? '') === String(currentPublicUserId) || String(user?.id ?? '') === String(currentPublicUserId));
  // Use userId/email/name for color hash
  const colorKey = String(user?.userId ?? '') || String(user?.id ?? '') || String(user?.email ?? '') || String(user?.displayName ?? '');
  const avatarColor = getAvatarColor(colorKey, isMe);

  return (
    <div className="flex flex-col gap-1 items-start w-full mt-2 group relative">
      {/* 1st line: avatar, name, date, edit/delete buttons */}
      <div className="flex items-center gap-2 w-full">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase border border-gray-300 ${avatarColor}`} title={displayName}>
          {initials}
        </div>
        <span className="font-medium text-gray-900 text-sm">{displayName}</span>
        <span className="text-xs text-muted-foreground" title={exactDate}>{friendlyDate}</span>
        {/* Edit/Delete buttons on hover (desktop) */}
        {isMe && (
          <span className="hidden md:flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <button aria-label="Edit message" className="hover:text-primary" onClick={onEditStart} disabled={isProcessing}>
              <Pencil size={16} />
            </button>
            <button aria-label="Delete message" className="hover:text-destructive" onClick={onDelete} disabled={isProcessing}>
              <Trash2 size={16} />
            </button>
          </span>
        )}
      </div>
      {/* 2nd line: message and attachments */}
      <div className="pl-10 w-full">
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
            <div className="text-sm text-gray-900" style={{ wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: message.content ?? '' }} />
            {typeof message?.attachment === 'string' && message?.attachment && (
              <div className="mt-2 flex items-center gap-2 bg-gray-50 border rounded px-3 py-2 w-fit">
                {getFileIcon(getFileExt(message.attachment))}
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-gray-900">{getFileName(message.attachment)}</span>
                  <a
                    href={message.attachment}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    {getFileExt(message.attachment).toUpperCase()} · Download
                  </a>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {/* Mobile: show edit/delete on long-press */}
      {isMe && showMobileActions && (
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
  )
}
