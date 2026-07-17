"use client"

import { useState, useEffect, useImperativeHandle, forwardRef } from "react"
import { Edit, Trash2 } from "lucide-react"
import { Review } from "../../lib/types/tasks"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Textarea } from "../ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { toast } from "../ui/use-toast"
import { useCurrentUserStore } from "../../store/current-user"
import { useQueryClient } from "@tanstack/react-query"
import { fetchTaskReviews, taskReviewsQueryKey } from "../../hooks/use-task-reviews-query"

interface TaskReviewsListProps {
  taskId: number;
  reviewCount?: number | null;
  onReviewsChanged: () => void; // Callback to refresh the summary
  autoOpen?: boolean;
}

export interface TaskReviewsListRef {
  refreshReviews: () => void;
}

function StarDisplay({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-xs text-gray-600">{score.toFixed(1)}</span>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`text-xs ${i < score ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
      ))}
    </span>
  );
}

function StarInputEdit({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? value ?? 0;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`text-sm ${star <= active ? 'text-yellow-400' : 'text-gray-300'} hover:text-yellow-400`}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onChange(value === star ? null : star)}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// Get relative time display
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
}

type ReviewFormData = {
  review_title: string;
  score_seo: number | null;
  score_relevance: number | null;
  score_grammar: number | null;
  score_delays: number | null;
  positive_feedback: string;
  negative_feedback: string;
};

function ReviewCard({
  review,
  currentUserPublicId,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  review: Review;
  currentUserPublicId: number | null;
  isEditing: boolean;
  onEdit: (review: Review) => void;
  onCancelEdit: () => void;
  onSaveEdit: (data: ReviewFormData) => Promise<void>;
  onDelete: (review: Review) => void;
}) {
  const isOwnReview = currentUserPublicId === review.created_by;
  const isUpdated = new Date(review.updated_at) > new Date(review.created_at);
  const [formData, setFormData] = useState<ReviewFormData>({
    review_title: review.review_title || '',
    score_seo: review.score_seo,
    score_relevance: review.score_relevance,
    score_grammar: review.score_grammar,
    score_delays: review.score_delays,
    positive_feedback: review.positive_feedback || '',
    negative_feedback: review.negative_feedback || '',
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setFormData({
        review_title: review.review_title || '',
        score_seo: review.score_seo,
        score_relevance: review.score_relevance,
        score_grammar: review.score_grammar,
        score_delays: review.score_delays,
        positive_feedback: review.positive_feedback || '',
        negative_feedback: review.negative_feedback || '',
      });
    }
  }, [isEditing, review.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveEdit(formData);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-3">
        <Input
          value={formData.review_title}
          onChange={(e) => setFormData((p) => ({ ...p, review_title: e.target.value }))}
          placeholder="Title"
          className="h-8 text-sm"
        />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-gray-500 w-12 inline-block">SEO</span><StarInputEdit value={formData.score_seo} onChange={(v) => setFormData((p) => ({ ...p, score_seo: v }))} /></div>
          <div><span className="text-gray-500 w-12 inline-block">Rel.</span><StarInputEdit value={formData.score_relevance} onChange={(v) => setFormData((p) => ({ ...p, score_relevance: v }))} /></div>
          <div><span className="text-gray-500 w-12 inline-block">Gram.</span><StarInputEdit value={formData.score_grammar} onChange={(v) => setFormData((p) => ({ ...p, score_grammar: v }))} /></div>
          <div><span className="text-gray-500 w-12 inline-block">Delays</span><StarInputEdit value={formData.score_delays} onChange={(v) => setFormData((p) => ({ ...p, score_delays: v }))} /></div>
        </div>
        <Textarea value={formData.positive_feedback} onChange={(e) => setFormData((p) => ({ ...p, positive_feedback: e.target.value }))} placeholder="Positive feedback" rows={2} className="text-sm min-h-0" />
        <Textarea value={formData.negative_feedback} onChange={(e) => setFormData((p) => ({ ...p, negative_feedback: e.target.value }))} placeholder="Areas for improvement" rows={2} className="text-sm min-h-0" />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancelEdit} disabled={isSaving}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium shrink-0">
            {review.author?.full_name ? review.author.full_name.split(' ').map(n => n[0]).join('').toUpperCase() : '?'}
          </div>
          <div className="min-w-0">
            <span className="text-xs font-medium text-gray-900 truncate block">{review.author?.full_name || 'Unknown'}</span>
            <span className="text-xs text-gray-500">{getRelativeTime(review.created_at)}{isUpdated && ' · edited'}</span>
          </div>
        </div>
        {isOwnReview && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button type="button" className="p-1 text-gray-400 hover:text-gray-600" onClick={() => onEdit(review)} aria-label="Edit"><Edit className="w-3.5 h-3.5" /></button>
            <button type="button" className="p-1 text-gray-400 hover:text-red-500" onClick={() => onDelete(review)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
      {review.review_title && <div className="text-xs font-medium text-gray-900">{review.review_title}</div>}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        <span><span className="text-gray-500">SEO</span> <StarDisplay score={review.score_seo} /></span>
        <span><span className="text-gray-500">Rel.</span> <StarDisplay score={review.score_relevance} /></span>
        <span><span className="text-gray-500">Gram.</span> <StarDisplay score={review.score_grammar} /></span>
        <span><span className="text-gray-500">Delays</span> <StarDisplay score={review.score_delays} /></span>
      </div>
      {(review.positive_feedback || review.negative_feedback) && (
        <div className="text-xs text-gray-600 space-y-0.5 pt-1 border-t border-gray-100">
          {review.positive_feedback && <div><span className="text-gray-500">+</span> {review.positive_feedback}</div>}
          {review.negative_feedback && <div><span className="text-gray-500">−</span> {review.negative_feedback}</div>}
        </div>
      )}
    </div>
  );
}

export const TaskReviewsList = forwardRef<TaskReviewsListRef, TaskReviewsListProps>(
  ({ taskId, reviewCount, onReviewsChanged, autoOpen = false }, ref) => {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [deletingReview, setDeletingReview] = useState<Review | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentUserPublicId = useCurrentUserStore(state => state.publicUserId);

  const fetchReviews = async () => {
    setIsLoading(true);
    try {
      const cached = queryClient.getQueryData<Review[]>(taskReviewsQueryKey(taskId))
      const transformedReviews = cached ?? await fetchTaskReviews(taskId)
      if (!cached) {
        queryClient.setQueryData(taskReviewsQueryKey(taskId), transformedReviews)
      }
      setReviews(transformedReviews);
      setHasLoaded(true);
    } catch (error: any) {
      console.error('Failed to fetch reviews:', error);
      toast({
        title: 'Failed to load reviews',
        description: error?.message || 'An error occurred while loading reviews.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setHasLoaded(false)
    setReviews([])
  }, [taskId])

  // Fetch reviews when expanded for the first time
  useEffect(() => {
    if (isOpen && !hasLoaded) {
      void fetchReviews();
    }
  }, [isOpen, hasLoaded, taskId]);

  useEffect(() => {
    if (autoOpen && !isOpen) {
      setIsOpen(true);
    }
  }, [autoOpen, isOpen]);

  // Expose fetchReviews function to parent component
  useImperativeHandle(ref, () => ({
    refreshReviews: fetchReviews
  }));

  const handleEdit = (review: Review) => {
    setEditingReview(review);
  };

  const handleEditSave = () => {
    fetchReviews();
    onReviewsChanged();
    setEditingReview(null);
  };

  const handleSaveEdit = async (reviewId: number, data: ReviewFormData) => {
    const supabase = createClientComponentClient();
    const { error } = await supabase
      .from('reviews')
      .update({
        review_title: data.review_title.trim() || null,
        score_seo: data.score_seo,
        score_relevance: data.score_relevance,
        score_grammar: data.score_grammar,
        score_delays: data.score_delays,
        positive_feedback: data.positive_feedback.trim() || null,
        negative_feedback: data.negative_feedback.trim() || null,
      })
      .eq('id', reviewId);
    if (error) {
      if (error.code === '42501' || error.message?.includes('permission')) {
        toast({ title: 'Permission denied', description: 'You can only edit your own reviews.', variant: 'destructive' });
      } else {
        toast({ title: 'Failed to update review', description: error?.message ?? 'Update failed.', variant: 'destructive' });
      }
      throw error;
    }
    toast({ title: 'Review updated', description: 'Your review has been updated.' });
    handleEditSave();
  };

  const handleDelete = (review: Review) => {
    setDeletingReview(review);
  };

  const confirmDelete = async () => {
    if (!deletingReview) return;

    setIsDeleting(true);
    const supabase = createClientComponentClient();

    try {
      const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', deletingReview.id);

      if (error) {
        if (error.code === '42501' || error.message.includes('permission')) {
          toast({
            title: 'Permission denied',
            description: 'You can only delete your own reviews.',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: 'Review deleted',
        description: 'The review has been successfully deleted.',
      });

      // Refetch reviews and refresh summary
      fetchReviews();
      onReviewsChanged();
      setDeletingReview(null);
    } catch (error: any) {
      console.error('Failed to delete review:', error);
      toast({
        title: 'Failed to delete review',
        description: error?.message || 'An error occurred while deleting the review.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="mt-4">
        <div id="all-reviews-panel" className="mt-2">
            {isLoading ? (
              <p className="text-sm text-gray-500 py-2">Loading reviews...</p>
            ) : reviews.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">No reviews yet</p>
            ) : (
              <div className="space-y-2">
                {reviews.map(review => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    currentUserPublicId={currentUserPublicId}
                    isEditing={editingReview?.id === review.id}
                    onEdit={handleEdit}
                    onCancelEdit={() => setEditingReview(null)}
                    onSaveEdit={(data) => handleSaveEdit(review.id, data)}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingReview} onOpenChange={() => !isDeleting && setDeletingReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Review</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to delete this review? This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeletingReview(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}); 