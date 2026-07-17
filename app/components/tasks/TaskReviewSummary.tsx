"use client"

import { ReviewData } from "../../lib/types/tasks"
import { useState, useRef } from "react"
import { TaskReviewsList, TaskReviewsListRef } from "./TaskReviewsList"
import { AddReviewInlineCard } from "./AddReviewInlineCard"

interface TaskReviewSummaryProps {
  reviewData?: ReviewData | null;
  taskId?: number;
  onReviewsChanged?: () => void;
  autoOpenAllReviews?: boolean;
  /** When set, parent owns the section header and + button; show add form when true */
  showAddForm?: boolean;
  onCloseAddForm?: () => void;
}

// Simple star renderer helper
function StarRating({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-xs">—</span>;
  const fullStars = Math.floor(score);
  const hasHalfStar = score % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-xs font-medium text-gray-600">{score.toFixed(1)}</span>
      {Array.from({ length: fullStars }, (_, i) => (<span key={`f-${i}`} className="text-yellow-400 text-xs">★</span>))}
      {hasHalfStar && <span className="text-yellow-400 text-xs">☆</span>}
      {Array.from({ length: emptyStars }, (_, i) => (<span key={`e-${i}`} className="text-gray-300 text-xs">☆</span>))}
    </span>
  );
}

export function TaskReviewSummary({ reviewData, taskId, onReviewsChanged, autoOpenAllReviews, showAddForm, onCloseAddForm }: TaskReviewSummaryProps) {
  const reviewsListRef = useRef<TaskReviewsListRef>(null);
  const [internalAdd, setInternalAdd] = useState(false);
  const isAddingReview = showAddForm !== undefined ? showAddForm : internalAdd;
  const closeAddForm = onCloseAddForm ?? (() => setInternalAdd(false));

  const hasReviews = reviewData && (
    reviewData.global_score !== null ||
    reviewData.avg_seo_score !== null ||
    reviewData.avg_relevance_score !== null ||
    reviewData.avg_grammar_score !== null ||
    reviewData.avg_delays_score !== null
  );

  const handleReviewAdded = () => {
    if (onReviewsChanged) onReviewsChanged();
    reviewsListRef.current?.refreshReviews();
    closeAddForm();
  };

  return (
    <div className="mt-2">
      {/* Header row only when parent doesn't control it (e.g. SuggestionDetails) */}
      {showAddForm === undefined && taskId && onReviewsChanged && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center text-sm font-normal text-gray-400">
            Reviews
            {hasReviews && reviewData?.review_count != null && (
              <span className="ml-1 text-xs text-gray-500">({reviewData.review_count})</span>
            )}
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            onClick={() => setInternalAdd(true)}
            title="Add review"
            aria-label="Add review"
          >
            +
          </button>
        </div>
      )}

      {!hasReviews && !isAddingReview && (
        <p className="text-sm text-gray-500 mb-4">no reviews yet</p>
      )}

      {taskId && onReviewsChanged && isAddingReview && (
        <div className="mb-4">
          <AddReviewInlineCard
            taskId={taskId}
            onSuccess={handleReviewAdded}
            onCancel={closeAddForm}
          />
        </div>
      )}
      
      {hasReviews && (
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
              <div className="space-y-3">
                {reviewData?.global_score !== null && (
                  <div className="text-center pb-3 border-b border-gray-100">
                    <div className="text-lg font-semibold text-gray-900">
                      {reviewData.global_score.toFixed(1)} / 5
                    </div>
                    <div className="flex justify-center gap-0.5 mt-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={`text-sm ${
                            i < Math.floor(reviewData.global_score!)
                              ? 'text-yellow-400'
                              : i < reviewData.global_score!
                              ? 'text-yellow-300'
                              : 'text-gray-300'
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex items-center gap-1.5"><span className="text-gray-500 w-14">SEO</span><StarRating score={reviewData?.avg_seo_score} /></div>
                  <div className="flex items-center gap-1.5"><span className="text-gray-500 w-14">Relevance</span><StarRating score={reviewData?.avg_relevance_score} /></div>
                  <div className="flex items-center gap-1.5"><span className="text-gray-500 w-14">Grammar</span><StarRating score={reviewData?.avg_grammar_score} /></div>
                  <div className="flex items-center gap-1.5"><span className="text-gray-500 w-14">Delays</span><StarRating score={reviewData?.avg_delays_score} /></div>
                </div>
              </div>
      </div>
      )}
      
      {/* All Reviews List - only show if we have taskId and callback */}
      {taskId && onReviewsChanged && hasReviews && (
        <TaskReviewsList 
          ref={reviewsListRef}
          taskId={taskId}
          reviewCount={reviewData?.review_count}
          onReviewsChanged={onReviewsChanged}
          autoOpen={autoOpenAllReviews}
        />
      )}
    </div>
  );
} 