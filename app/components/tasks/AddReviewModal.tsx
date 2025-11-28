"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { Input } from "../ui/input"
import { NewReviewPayload } from "../../lib/types/tasks"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { toast } from "../ui/use-toast"

interface AddReviewModalProps {
  taskId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Star input component for rating (reusable from EditReviewModal)
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

export function AddReviewModal({ taskId, isOpen, onClose, onSuccess }: AddReviewModalProps) {
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

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        review_title: '',
        score_seo: null,
        score_relevance: null,
        score_grammar: null,
        score_delays: null,
        positive_feedback: '',
        negative_feedback: ''
      });
    }
  }, [isOpen]);

  // Client-side validation - at least one field must be filled
  const isFormValid = () => {
    return (
      formData.review_title.trim() ||
      formData.score_seo !== null ||
      formData.score_relevance !== null ||
      formData.score_grammar !== null ||
      formData.score_delays !== null ||
      formData.positive_feedback.trim() ||
      formData.negative_feedback.trim()
    );
  };

  const handleSubmit = async () => {
    if (!taskId || !isFormValid()) return;
    
    setIsLoading(true);
    const supabase = createClientComponentClient();

    try {
      const payload: NewReviewPayload = {
        task_id: taskId,
        review_title: formData.review_title.trim() || null,
        score_seo: formData.score_seo,
        score_relevance: formData.score_relevance,
        score_grammar: formData.score_grammar,
        score_delays: formData.score_delays,
        positive_feedback: formData.positive_feedback.trim() || null,
        negative_feedback: formData.negative_feedback.trim() || null
      };

      const { error } = await supabase
        .from('reviews')
        .insert(payload);

      if (error) {
        if (error.code === '42501' || error.message.includes('permission') || error.message.includes('403')) {
          toast({
            title: 'Permission denied',
            description: 'You do not have permission to review this task.',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: 'Review added',
        description: 'Your review has been successfully submitted.',
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to create review:', error);
      toast({
        title: 'Failed to add review',
        description: error?.message || 'An error occurred while submitting your review.',
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
          <DialogTitle>Add Review</DialogTitle>
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

          {/* Validation message */}
          {!isFormValid() && (
            <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-md">
              Please provide at least a title, rating, or feedback to submit your review.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isLoading || !isFormValid()}
          >
            {isLoading ? 'Submitting...' : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 