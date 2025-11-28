"use client"

import { ReviewData } from "../../lib/types/tasks"
import { ChevronRight } from "lucide-react"
import { useState, useRef } from "react"
import { TaskReviewsList, TaskReviewsListRef } from "./TaskReviewsList"
import { AddReviewButton } from "./AddReviewButton"

interface TaskReviewSummaryProps {
  reviewData?: ReviewData | null;
  taskId?: number;
  onReviewsChanged?: () => void;
}

// Simple star renderer helper
function StarRating({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400">—</span>;

  const fullStars = Math.floor(score);
  const hasHalfStar = score % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium text-gray-700">
        {score.toFixed(1)}
      </span>
      <div className="flex items-center">
        {/* Full stars */}
        {Array.from({ length: fullStars }, (_, i) => (
          <span key={`full-${i}`} className="text-yellow-400">★</span>
        ))}
        {/* Half star */}
        {hasHalfStar && (
          <span className="text-yellow-400">☆</span>
        )}
        {/* Empty stars */}
        {Array.from({ length: emptyStars }, (_, i) => (
          <span key={`empty-${i}`} className="text-gray-300">☆</span>
        ))}
      </div>
    </div>
  );
}

export function TaskReviewSummary({ reviewData, taskId, onReviewsChanged }: TaskReviewSummaryProps) {
  const reviewsListRef = useRef<TaskReviewsListRef>(null);

  // If no review data or all scores are null, show empty state
  const hasReviews = reviewData && (
    reviewData.global_score !== null ||
    reviewData.avg_seo_score !== null ||
    reviewData.avg_relevance_score !== null ||
    reviewData.avg_grammar_score !== null ||
    reviewData.avg_delays_score !== null
  );

  // Callback to refresh both summary and reviews list
  const handleReviewAdded = () => {
    // Refresh the task details summary
    if (onReviewsChanged) {
      onReviewsChanged();
    }
    // Refresh the reviews list if it's open
    if (reviewsListRef.current) {
      reviewsListRef.current.refreshReviews();
    }
  };

  return (
    <div className="mt-6">
      {/* Reviews Header - Always visible */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center text-sm font-medium text-gray-400">
          Reviews
          {hasReviews && reviewData?.review_count && (
            <span className="ml-2 text-xs text-gray-500">({reviewData.review_count})</span>
          )}
        </div>
        
        {/* Add Review Button */}
        {taskId && onReviewsChanged && (
          <AddReviewButton 
            taskId={taskId}
            onReviewAdded={handleReviewAdded}
          />
        )}
      </div>
      
      {/* Reviews Summary - Always visible */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
            {!hasReviews ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-lg mb-2">📝</div>
                <div className="text-sm">No reviews yet</div>
                <div className="text-xs text-gray-400 mt-1">
                  Reviews will appear here once feedback is received
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Global Score - Prominently displayed */}
                {reviewData?.global_score !== null && (
                  <div className="text-center pb-4 border-b border-gray-200">
                    <div className="text-2xl font-bold text-gray-900 mb-2">
                      {reviewData.global_score.toFixed(1)} / 5
                    </div>
                    <div className="flex justify-center items-center gap-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={`text-xl ${
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
                    <div className="text-sm text-gray-500 mt-1">Overall Score</div>
                  </div>
                )}
                
                {/* Individual Scores - 2x2 Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">SEO</div>
                    <StarRating score={reviewData?.avg_seo_score} />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">Relevance</div>
                    <StarRating score={reviewData?.avg_relevance_score} />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">Grammar</div>
                    <StarRating score={reviewData?.avg_grammar_score} />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="font-medium text-gray-700">Delays</div>
                    <StarRating score={reviewData?.avg_delays_score} />
                  </div>
                </div>
              </div>
            )}
      </div>
      
      {/* All Reviews List - only show if we have taskId and callback */}
      {taskId && onReviewsChanged && (
        <TaskReviewsList 
          ref={reviewsListRef}
          taskId={taskId}
          reviewCount={reviewData?.review_count}
          onReviewsChanged={onReviewsChanged}
        />
      )}
    </div>
  );
} 