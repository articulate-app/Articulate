import React, { useRef, useEffect, useState } from "react";
import { InfiniteList } from "../ui/infinite-list";
import { format } from 'date-fns';
import { getImageUrl } from '../../lib/public-media';
import { TaskMentionCard } from "../../../components/task-mention-card";

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

/** Relative time like activity timeline (e.g. "5 mins ago", "2 weeks ago"). */
function getRelativeTimeLabel(dateString) {
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
function formatDateShort(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m} · ${mm}/${yy}`;
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
        <div className="flex flex-col gap-2 pl-0 pr-4">
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
          <div className="flex flex-col gap-4 pt-4 pr-4 pb-4 pl-0">
            {mentions.map((mention) => {
              // User info
              const user = mention.users || {};
              const displayName = user.full_name || user.email || mention.created_by;
              const photoUrl = getImageUrl(user.photo ?? null);
              const initials = (user.full_name || user.email || '?')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const relativeTime = getRelativeTimeLabel(mention.created_at);
              const shortDate = formatDateShort(mention.created_at);
              const exactDate = mention.created_at ? format(new Date(mention.created_at), 'yyyy-MM-dd HH:mm:ss') : '';
              return (
                <div key={mention.id} className="flex flex-col gap-1 items-start">
                  <TaskMentionCard
                    mention={mention}
                    author={{ ...user, photo: user.photo ?? photoUrl, full_name: displayName }}
                  />
                  <div className="w-full pl-9">
                    <div className="text-[11px] text-muted-foreground" title={exactDate}>
                      {relativeTime}{shortDate ? ` · ${shortDate}` : ''}
                    </div>
                    {mention.attachment && (
                      <div className="mt-2 flex w-fit items-center gap-2 rounded border bg-gray-50 px-3 py-2">
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