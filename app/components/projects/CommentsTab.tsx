"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Textarea } from "../ui/textarea"
import { Button } from "../ui/button"
import { Loader2, Send, Trash2 } from "lucide-react"
import { toast } from "../ui/use-toast"
import { format, isToday, isYesterday, differenceInDays } from "date-fns"
import {
  listComments,
  addComment,
  deleteComment,
  type ProjectComment,
} from "../../lib/services/projects-briefing"
import { useCurrentUserStore } from "../../store/current-user"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"

interface CommentsTabProps {
  projectId: number
}

const AVATAR_COLORS = [
  "bg-gray-400 text-white",
  "bg-blue-600 text-white",
  "bg-gray-700 text-white",
  "bg-blue-400 text-white",
]

function getAvatarColor(userId: number, isMe: boolean) {
  if (isMe) return "bg-black text-white"
  let hash = 0
  const str = String(userId)
  for (let i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const idx = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

function getFriendlyDate(createdAt: string) {
  const date = new Date(createdAt)
  if (isToday(date)) {
    const diff = (Date.now() - date.getTime()) / 1000
    if (diff < 60) return "just now"
    return format(date, "HH:mm")
  } else if (isYesterday(date)) {
    return "yesterday"
  } else {
    const daysAgo = differenceInDays(new Date(), date)
    if (daysAgo < 10) return `${daysAgo} days ago`
    return format(date, "yyyy-MM-dd")
  }
}

function renderMarkdownLite(text: string) {
  // Simple markdown: links and code spans
  let html = text
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline">$1</a>'
    )
    .replace(/\n/g, "<br />")
  return html
}

export function CommentsTab({ projectId }: CommentsTabProps) {
  const queryClient = useQueryClient()
  const supabase = createClientComponentClient()
  const publicUserId = useCurrentUserStore((s) => s.publicUserId)
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [newComment, setNewComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const limit = 50

  const fetchComments = useCallback(async () => {
    if (isLoading || !hasMore) return

    setIsLoading(true)
    try {
      const { data, error } = await listComments(projectId, limit, offset)

      if (error) {
        console.error("Error fetching comments:", error)
        return
      }

      if (data && Array.isArray(data)) {
        if (data.length < limit) {
          setHasMore(false)
        }
        setComments((prev) => [...prev, ...data])
        setOffset((prev) => prev + data.length)
      } else {
        setHasMore(false)
      }
    } catch (err) {
      console.error("Error fetching comments:", err)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, limit, offset, isLoading, hasMore])

  useEffect(() => {
    fetchComments()
  }, [])

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoading) {
          fetchComments()
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    )

    observer.observe(sentinelRef.current)

    return () => {
      observer.disconnect()
    }
  }, [hasMore, isLoading, fetchComments])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim() || !publicUserId || isSubmitting) return

    setIsSubmitting(true)
    const optimisticComment: ProjectComment = {
      id: Date.now(), // Temporary ID
      project_id: projectId,
      user_id: publicUserId,
      comment: newComment,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    setComments((prev) => [optimisticComment, ...prev])
    setNewComment("")

    try {
      const { data, error } = await addComment(
        projectId,
        publicUserId,
        newComment
      )

      if (error) {
        toast({
          title: "Error",
          description: `Failed to post comment: ${error.message}`,
          variant: "destructive",
        })
        setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id))
      } else {
        toast({
          title: "Comment posted",
          description: "Your comment has been added",
        })
        queryClient.invalidateQueries({
          queryKey: ["project-comments", projectId],
        })
        // Reset and refetch
        setComments([])
        setOffset(0)
        setHasMore(true)
        fetchComments()
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to post comment",
        variant: "destructive",
      })
      setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (commentId: number) => {
    if (!publicUserId) return

    // Optimistic update
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, is_deleted: true } : c
      )
    )

    try {
      const { error } = await deleteComment(commentId)

      if (error) {
        toast({
          title: "Error",
          description: `Failed to delete comment: ${error.message}`,
          variant: "destructive",
        })
        // Revert
        queryClient.invalidateQueries({
          queryKey: ["project-comments", projectId],
        })
        setComments([])
        setOffset(0)
        setHasMore(true)
        fetchComments()
      } else {
        toast({
          title: "Comment deleted",
          description: "Your comment has been removed",
        })
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete comment",
        variant: "destructive",
      })
      queryClient.invalidateQueries({
        queryKey: ["project-comments", projectId],
      })
      setComments([])
      setOffset(0)
      setHasMore(true)
      fetchComments()
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Comments</h2>
      </div>
        {/* Comments List */}
        <div
          ref={scrollContainerRef}
          className="mb-4 max-h-[500px] space-y-4 overflow-y-auto"
        >
          {comments.length === 0 && !isLoading && (
            <div className="py-8 text-center text-gray-500">
              No comments yet. Be the first to comment!
            </div>
          )}

          {comments
            .filter((c) => !c.is_deleted)
            .map((comment) => {
              const isMe =
                publicUserId !== null && comment.user_id === publicUserId
              const displayName = `User ${comment.user_id}`
              const initials = displayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)
              const avatarColor = getAvatarColor(comment.user_id, isMe)

              return (
                <div
                  key={comment.id}
                  className="group flex flex-col gap-1 items-start w-full"
                >
                  <div className="flex items-center gap-2 w-full">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase border border-gray-300 ${avatarColor}`}
                      title={displayName}
                    >
                      {initials}
                    </div>
                    <span className="font-medium text-gray-900 text-sm">
                      {displayName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getFriendlyDate(comment.created_at)}
                    </span>
                    {isMe && (
                      <span className="hidden md:flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          aria-label="Delete comment"
                          className="hover:text-destructive"
                          onClick={() => handleDelete(comment.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="pl-10 w-full">
                    <div
                      className="text-sm text-gray-900 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownLite(comment.comment),
                      }}
                    />
                  </div>
                </div>
              )
            })}

          {/* Loading sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}
          {!hasMore && comments.length > 0 && (
            <div className="py-4 text-center text-xs text-gray-400">
              No more comments
            </div>
          )}
        </div>

        {/* Comment Input */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            disabled={isSubmitting || !publicUserId}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!newComment.trim() || isSubmitting || !publicUserId}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Post Comment
            </Button>
          </div>
        </form>
    </div>
  )
}

