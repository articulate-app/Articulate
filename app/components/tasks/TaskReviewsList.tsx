"use client"

import { useState, useEffect, useImperativeHandle, forwardRef } from "react"
import { ChevronRight, Edit, Trash2, Clock } from "lucide-react"
import { Review } from "../../lib/types/tasks"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { toast } from "../ui/use-toast"
import { useCurrentUserStore } from "../../store/current-user"
import { EditReviewModal } from "./EditReviewModal"

interface TaskReviewsListProps {
  taskId: number;
  reviewCount?: number | null;
  onReviewsChanged: () => void; // Callback to refresh the summary
}

export interface TaskReviewsListRef {
  refreshReviews: () => void;
}

// Star display component (read-only)
function StarDisplay({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400">—</span>;

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-medium text-gray-600">
        {score.toFixed(1)}
      </span>
      <div className="flex items-center">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`text-sm ${
              i < score ? 'text-yellow-400' : 'text-gray-300'
            }`}
          >
            ★
          </span>
        ))}
      </div>
    </div>
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

// Individual review card component
function ReviewCard({ 
  review, 
  currentUserPublicId, 
  onEdit, 
  onDelete 
}: { 
  review: Review;
  currentUserPublicId: number | null;
  onEdit: (review: Review) => void;
  onDelete: (review: Review) => void;
}) {
  const isOwnReview = currentUserPublicId === review.created_by;
  const isUpdated = new Date(review.updated_at) > new Date(review.created_at);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Author Avatar */}
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium">
            {review.author?.full_name 
              ? review.author.full_name.split(' ').map(n => n[0]).join('').toUpperCase()
              : '?'
            }
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">
              {review.author?.full_name || 'Unknown User'}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{getRelativeTime(review.created_at)}</span>
              {isUpdated && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    edited
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Actions */}
        {isOwnReview && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(review)}
              className="text-gray-400 hover:text-blue-600 p-1 h-auto"
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(review)}
              className="text-gray-400 hover:text-red-600 p-1 h-auto"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Review Title */}
      {review.review_title && (
        <div className="text-sm font-medium text-gray-900">
          {review.review_title}
        </div>
      )}

      {/* Scores Grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-gray-500 mb-1">SEO</div>
          <StarDisplay score={review.score_seo} />
        </div>
        <div>
          <div className="text-gray-500 mb-1">Relevance</div>
          <StarDisplay score={review.score_relevance} />
        </div>
        <div>
          <div className="text-gray-500 mb-1">Grammar</div>
          <StarDisplay score={review.score_grammar} />
        </div>
        <div>
          <div className="text-gray-500 mb-1">Delays</div>
          <StarDisplay score={review.score_delays} />
        </div>
      </div>

      {/* Overall Score */}
      {review.review_score !== null && (
        <div className="border-t pt-3">
          <div className="text-xs text-gray-500 mb-1">Overall Score</div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {review.review_score.toFixed(1)} / 5
            </span>
            <div className="flex items-center">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className={`text-lg ${
                    i < review.review_score! ? 'text-yellow-400' : 'text-gray-300'
                  }`}
                >
                  ★
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Feedback */}
      {(review.positive_feedback || review.negative_feedback) && (
        <div className="space-y-2 text-xs">
          {review.positive_feedback && (
            <div>
              <div className="text-green-600 font-medium mb-1">Positives</div>
              <div className="text-gray-700">{review.positive_feedback}</div>
            </div>
          )}
          {review.negative_feedback && (
            <div>
              <div className="text-orange-600 font-medium mb-1">Areas for Improvement</div>
              <div className="text-gray-700">{review.negative_feedback}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const TaskReviewsList = forwardRef<TaskReviewsListRef, TaskReviewsListProps>(
  ({ taskId, reviewCount, onReviewsChanged }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [deletingReview, setDeletingReview] = useState<Review | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentUserPublicId = useCurrentUserStore(state => state.publicUserId);

  // Fetch reviews when expanded for the first time
  useEffect(() => {
    if (isOpen && !hasLoaded) {
      fetchReviews();
    }
  }, [isOpen, hasLoaded]);

  // Expose fetchReviews function to parent component
  useImperativeHandle(ref, () => ({
    refreshReviews: fetchReviews
  }));

  const fetchReviews = async () => {
    setIsLoading(true);
    const supabase = createClientComponentClient();

    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          id, task_id, created_by, created_at, updated_at,
          score_seo, score_relevance, score_grammar, score_delays, review_score,
          positive_feedback, negative_feedback, review_title,
          author:created_by ( id, full_name, photo )
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to match our Review type (author is returned as array by Supabase)
      const transformedReviews = (data || []).map(review => ({
        ...review,
        author: Array.isArray(review.author) ? review.author[0] : review.author
      })) as Review[];

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

  const handleEdit = (review: Review) => {
    setEditingReview(review);
  };

  const handleEditSave = () => {
    // Refetch reviews and refresh summary
    fetchReviews();
    onReviewsChanged();
    setEditingReview(null);
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
        <button
          className="flex items-center w-full text-left text-sm font-medium text-gray-400 mb-1 focus:outline-none"
          onClick={() => setIsOpen(prev => !prev)}
          aria-expanded={isOpen}
          aria-controls="all-reviews-panel"
          type="button"
        >
          <ChevronRight className={`transition-transform mr-2 ${isOpen ? 'rotate-90' : ''}`} />
          All Reviews
          {reviewCount && reviewCount > 0 && (
            <span className="ml-2 text-xs text-gray-500">({reviewCount})</span>
          )}
        </button>

        {isOpen && (
          <div id="all-reviews-panel" className="mt-2">
            {isLoading ? (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <div className="text-sm text-gray-500">Loading reviews...</div>
              </div>
            ) : reviews.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
                <div className="text-lg mb-2">💬</div>
                <div className="text-sm">No reviews yet</div>
                <div className="text-xs text-gray-400 mt-1">
                  Be the first to leave a review for this task
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {reviews.map(review => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    currentUserPublicId={currentUserPublicId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <EditReviewModal
        review={editingReview}
        isOpen={!!editingReview}
        onClose={() => setEditingReview(null)}
        onSave={handleEditSave}
      />

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