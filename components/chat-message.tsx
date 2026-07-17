import { getImageUrl } from '@/lib/public-media'
import type { ChatMessage as BaseChatMessage } from '../hooks/useThreadedChat'
import { Pencil, Reply, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns';
import { UserAvatar } from '../app/components/UserAvatar'

// Extend ChatMessage to allow optional attachment
export type ChatMessageWithAttachment = BaseChatMessage & { attachment?: string }

interface ChatMessageItemProps {
  message: ChatMessageWithAttachment
  showHeader: boolean
  onReply?: () => void
  isEditing?: boolean
  editValue?: string
  isProcessing?: boolean
  onEditStart?: () => void
  onEditChange?: (value: string) => void
  onEditSave?: () => void
  onEditCancel?: () => void
  onDelete?: () => void
  currentPublicUserId?: number | string | null
  replyPreview?: { author?: string; preview: string } | null
}

/** Relative time like activity timeline (e.g. "5 mins ago", "2 weeks ago"). */
function getRelativeTimeLabel(dateString: string | Date | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? 's' : ''} ago`;
}

/** Short date + time like activity (e.g. "14:32 · 02/25"). */
function formatDateShort(createdAt: string | Date | undefined): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m} · ${mm}/${yy}`;
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
  onReply,
  isEditing = false,
  editValue = '',
  isProcessing = false,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  currentPublicUserId,
  replyPreview = null,
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
  const relativeTime = getRelativeTimeLabel(message.createdAt ?? '');
  const shortDate = formatDateShort(message.createdAt ?? '');
  const exactDate = message.createdAt ? format(new Date(message.createdAt), 'yyyy-MM-dd HH:mm:ss') : '';
  const isMe = currentPublicUserId != null && (String(user?.userId ?? '') === String(currentPublicUserId) || String(user?.id ?? '') === String(currentPublicUserId));
  const photoUrl = getImageUrl(user?.avatar ?? null);

  return (
    <div className="group relative mt-2 flex w-full flex-col gap-1 items-start">
      {isEditing ? (
        <div className="w-full rounded-md border border-gray-200 bg-white px-3 py-2">
          <div className="mb-2 flex items-center gap-2">
            <UserAvatar name={displayName} photoUrl={photoUrl} size="xs" />
            <span className="font-medium text-gray-900 text-sm">{displayName}</span>
            <span className="ml-auto text-xs text-muted-foreground shrink-0" title={exactDate}>
              {relativeTime}{shortDate ? ` · ${shortDate}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 pl-9">
            <input
              className="w-48 rounded border px-2 py-1 text-sm"
              value={editValue}
              onChange={e => onEditChange?.(e.target.value)}
              disabled={isProcessing}
              maxLength={2000}
              autoFocus
            />
            <button className="text-xs text-primary hover:underline" onClick={onEditSave} disabled={isProcessing}>Save</button>
            <button className="text-xs text-muted-foreground hover:underline" onClick={onEditCancel} disabled={isProcessing}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="group w-full py-1.5">
          <div className="flex items-center gap-2 min-h-0">
            <UserAvatar name={displayName} photoUrl={photoUrl} />
            <span className="min-w-0 truncate text-sm font-medium text-gray-900">{displayName}</span>
            <div className="ml-auto flex shrink-0 items-center gap-1 text-right text-xs text-muted-foreground whitespace-nowrap">
              {relativeTime ? <span className="block">{relativeTime}</span> : null}
              {shortDate ? <span className="block">{shortDate}</span> : null}
              {!isMe && onReply ? (
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
                  aria-label="Reply"
                  title="Reply"
                  onClick={onReply}
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {isMe && onEditStart ? (
                <button
                  type="button"
                  aria-label="Edit message"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
                  onClick={onEditStart}
                  disabled={isProcessing}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {isMe && onDelete ? (
                <button
                  type="button"
                  aria-label="Delete message"
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-red-500 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
                  onClick={onDelete}
                  disabled={isProcessing}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          <div
            className="pl-10 text-sm text-gray-700"
            style={{ wordBreak: "break-word" }}
            dangerouslySetInnerHTML={{ __html: String(message.content ?? "") }}
          />
        </div>
      )}
      {!isEditing && replyPreview ? (
        <div className="w-full pl-9">
          <div className="mb-1 rounded border-l-2 border-gray-300 bg-gray-50 py-1 pl-3">
            <div className="text-[11px] font-medium text-gray-700">
              Replying to {replyPreview.author || 'message'}
            </div>
            <div className="truncate text-[11px] text-gray-600">{replyPreview.preview}</div>
          </div>
        </div>
      ) : null}
      {!isEditing && typeof message?.attachment === 'string' && message?.attachment ? (
        <div className="w-full pl-9">
          <div className="mt-1 flex w-fit items-center gap-2 rounded border bg-gray-50 px-3 py-2">
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
        </div>
      ) : null}
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
