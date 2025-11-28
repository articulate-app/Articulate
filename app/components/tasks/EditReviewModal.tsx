"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { Input } from "../ui/input"
import { Review } from "../../lib/types/tasks"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { toast } from "../ui/use-toast"

interface EditReviewModalProps {
  review: Review | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

// Star input component for rating
function StarInput({ 
  label, 
  value, 
  onChange 
}: { 
  label: string; 
  value: number | null; 
  onChange: (value: number | null) => void;
}) {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  const handleStarClick = (star: number) => {
    if (value === star) {
      // If clicking the same star, clear the rating
      onChange(null);
    } else {
      onChange(star);
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => {
          const star = i + 1;
          const isActive = hoveredStar ? star <= hoveredStar : value ? star <= value : false;
          return (
            <button
              key={star}
              type="button"
              className={`text-2xl transition-colors ${
                isActive ? 'text-yellow-400' : 'text-gray-300'
              } hover:text-yellow-400`}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(null)}
              onClick={() => handleStarClick(star)}
            >
              ★
            </button>
          );
        })}
        <span className="ml-2 text-sm text-gray-500">
          {value ? `${value}/5` : 'No rating'}
        </span>
      </div>
    </div>
  );
}

export function EditReviewModal({ review, isOpen, onClose, onSave }: EditReviewModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    review_title: '',
    score_seo: null as number | null,
    score_relevance: null as number | null,
    score_grammar: null as number | null,
    score_delays: null as number | null,
    positive_feedback: '',
    negative_feedback: ''
  });

  // Reset form when review changes or modal opens
  useEffect(() => {
    if (review && isOpen) {
      setFormData({
        review_title: review.review_title || '',
        score_seo: review.score_seo,
        score_relevance: review.score_relevance,
        score_grammar: review.score_grammar,
        score_delays: review.score_delays,
        positive_feedback: review.positive_feedback || '',
        negative_feedback: review.negative_feedback || ''
      });
    }
  }, [review, isOpen]);

  const handleSave = async () => {
    if (!review) return;
    
    setIsLoading(true);
    const supabase = createClientComponentClient();

    try {
      const { error } = await supabase
        .from('reviews')
        .update({
          review_title: formData.review_title,
          score_seo: formData.score_seo,
          score_relevance: formData.score_relevance,
          score_grammar: formData.score_grammar,
          score_delays: formData.score_delays,
          positive_feedback: formData.positive_feedback || null,
          negative_feedback: formData.negative_feedback || null
        })
        .eq('id', review.id);

      if (error) {
        if (error.code === '42501' || error.message.includes('permission')) {
          toast({
            title: 'Permission denied',
            description: 'You can only edit your own reviews.',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: 'Review updated',
        description: 'Your review has been successfully updated.',
      });

      onSave();
      onClose();
    } catch (error: any) {
      console.error('Failed to update review:', error);
      toast({
        title: 'Failed to update review',
        description: error?.message || 'An error occurred while updating the review.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Review</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Review Title */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Review Title</label>
            <Input
              value={formData.review_title}
              onChange={(e) => setFormData(prev => ({ ...prev, review_title: e.target.value }))}
              placeholder="Enter review title..."
            />
          </div>

          {/* Star Ratings Grid */}
          <div className="grid grid-cols-2 gap-4">
            <StarInput
              label="SEO"
              value={formData.score_seo}
              onChange={(value) => setFormData(prev => ({ ...prev, score_seo: value }))}
            />
            <StarInput
              label="Relevance"
              value={formData.score_relevance}
              onChange={(value) => setFormData(prev => ({ ...prev, score_relevance: value }))}
            />
            <StarInput
              label="Grammar"
              value={formData.score_grammar}
              onChange={(value) => setFormData(prev => ({ ...prev, score_grammar: value }))}
            />
            <StarInput
              label="Delays"
              value={formData.score_delays}
              onChange={(value) => setFormData(prev => ({ ...prev, score_delays: value }))}
            />
          </div>

          {/* Positive Feedback */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Positive Feedback</label>
            <Textarea
              value={formData.positive_feedback}
              onChange={(e) => setFormData(prev => ({ ...prev, positive_feedback: e.target.value }))}
              placeholder="What worked well..."
              rows={3}
            />
          </div>

          {/* Negative Feedback */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Areas for Improvement</label>
            <Textarea
              value={formData.negative_feedback}
              onChange={(e) => setFormData(prev => ({ ...prev, negative_feedback: e.target.value }))}
              placeholder="What could be improved..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 