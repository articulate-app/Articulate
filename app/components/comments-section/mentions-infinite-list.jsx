import React, { useRef, useEffect, useState } from "react";
import { InfiniteList } from "../ui/infinite-list";
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';

function getFileIcon(ext) {
  if (!ext) return null;
  if (['pdf'].includes(ext)) return (
    <span className="text-red-500"><svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.828A2 2 0 0 0 19.414 7.414l-4.828-4.828A2 2 0 0 0 12.172 2H6zm6 1.414L18.586 10H13a1 1 0 0 1-1-1V3.414z"/></svg></span>
  );
  if (['doc', 'docx'].includes(ext)) return (
    <span className="text-blue-500"><svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.828A2 2 0 0 0 19.414 7.414l-4.828-4.828A2 2 0 0 0 12.172 2H6zm6 1.414L18.586 10H13a1 1 0 0 1-1-1V3.414z"/></svg></span>
  );
  return <span className="text-gray-400"><svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect width="20" height="24" x="2" y="2" rx="2" fill="currentColor" opacity=".1"/><rect width="20" height="24" x="2" y="2" rx="2" stroke="currentColor" strokeWidth="2"/></svg></span>;
}

function getFileName(url) {
  if (!url) return '';
  try {
    return decodeURIComponent(url.split('/').pop().split('?')[0]);
  } catch {
    return url;
  }
}

function getFileExt(url) {
  const name = getFileName(url);
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getFriendlyDate(createdAt) {
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

export function MentionsInfiniteList({
  reloadCount,
  threadId,
  editingId,
  isProcessing,
  deletingId,
  editValue,
  editError,
  handleEdit,
  handleEditSave,
  setEditingId,
  setEditValue,
  handleDelete,
  currentPublicUserId,
  queryKey, // add queryKey prop
}) {
  const bottomRef = useRef(null);
  const [latestMentions, setLatestMentions] = useState([]);

  useEffect(() => {
    if (bottomRef.current) {
      console.log('SCROLL EFFECT: Scrolling to bottomRef', bottomRef.current);
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    } else {
      console.log('SCROLL EFFECT: bottomRef is null');
    }
  }, [threadId, latestMentions.length]);

  return (
    <InfiniteList
      key={reloadCount}
      tableName={"mentions"}
      columns="*"
      pageSize={20}
      trailingQuery={(query) => query.eq('thread_id', threadId).order('created_at', { ascending: false })}
      queryKey={queryKey} // pass queryKey to InfiniteList
      renderNoResults={() => (
        <div className="text-center text-muted-foreground py-10">No comments yet.</div>
      )}
      renderSkeleton={(count) => (
        <div className="flex flex-col gap-2 px-4">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="h-8 w-full bg-muted animate-pulse rounded" />
          ))}
        </div>
      )}
      >
      {(mentions) => {
        // Update local state for scroll effect
        useEffect(() => {
          setLatestMentions(mentions);
        }, [mentions]);
        return (
          <div className="flex flex-col gap-4 p-4">
            {mentions.map((mention) => {
              // User info
              const user = mention.users || {};
              const displayName = user.full_name || user.email || mention.created_by;
              // Avatar: colored circle with initials
              const initials = (user.full_name || user.email || '?')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              // Date formatting
              const friendlyDate = getFriendlyDate(mention.created_at);
              const exactDate = mention.created_at ? format(new Date(mention.created_at), 'yyyy-MM-dd HH:mm:ss') : '';
              return (
                <div key={mention.id} className="flex flex-col gap-1 items-start">
                  {/* 1st line: avatar, name, date */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-yellow-200 flex items-center justify-center text-xs font-bold uppercase text-gray-900 border border-gray-300" title={displayName}>
                      {initials}
                    </div>
                    <span className="font-medium text-gray-900 text-sm">{displayName}</span>
                    <span className="text-xs text-muted-foreground" title={exactDate}>{friendlyDate}</span>
                  </div>
                  {/* 2nd line: message and attachments */}
                  <div className="pl-10 w-full">
                    <div className="text-sm text-gray-900" style={{ wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: mention.comment }} />
                    {mention.attachment && (
                      <div className="mt-2 flex items-center gap-2 bg-gray-50 border rounded px-3 py-2 w-fit">
                        {getFileIcon(getFileExt(mention.attachment))}
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-gray-900">{getFileName(mention.attachment)}</span>
                          <a
                            href={mention.attachment}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 underline"
                          >
                            {getFileExt(mention.attachment).toUpperCase()} · Download
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        );
      }}
    </InfiniteList>
  );
} 