"use client"

import { useState } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { NewReviewPayload } from "../../lib/types/tasks"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { toast } from "../ui/use-toast"
import { submitTaskReview } from "./review-submit"

interface AddReviewInlineCardProps {
  taskId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

function StarInputInline({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? value ?? 0;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`text-sm ${star <= active ? "text-yellow-400" : "text-gray-300"} hover:text-yellow-400`}
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

export function AddReviewInlineCard({ taskId, onSuccess, onCancel }: AddReviewInlineCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    review_title: "",
    score_seo: null as number | null,
    score_relevance: null as number | null,
    score_grammar: null as number | null,
    score_delays: null as number | null,
    positive_feedback: "",
    negative_feedback: "",
  });

  const isFormValid = () =>
    formData.review_title.trim() ||
    formData.score_seo !== null ||
    formData.score_relevance !== null ||
    formData.score_grammar !== null ||
    formData.score_delays !== null ||
    formData.positive_feedback.trim() ||
    formData.negative_feedback.trim();

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
        negative_feedback: formData.negative_feedback.trim() || null,
      };

      const { error } = await submitTaskReview(supabase, payload);

      if (error) {
        if (
          error.code === "42501" ||
          error.message.includes("permission") ||
          error.message.includes("403")
        ) {
          toast({
            title: "Permission denied",
            description: "You do not have permission to review this task.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Review added",
        description: "Your review has been successfully submitted.",
      });

      onSuccess();
    } catch (error: any) {
      console.error("Failed to create review:", error);
      toast({
        title: "Failed to add review",
        description:
          error?.message || "An error occurred while submitting your review.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <Input
        value={formData.review_title}
        onChange={(e) =>
          setFormData((prev) => ({ ...prev, review_title: e.target.value }))
        }
        placeholder="Title"
        className="h-7 text-xs border-gray-200"
      />
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs items-center">
        <span><span className="text-gray-500">SEO</span> <StarInputInline value={formData.score_seo} onChange={(v) => setFormData((p) => ({ ...p, score_seo: v }))} /></span>
        <span><span className="text-gray-500">Rel.</span> <StarInputInline value={formData.score_relevance} onChange={(v) => setFormData((p) => ({ ...p, score_relevance: v }))} /></span>
        <span><span className="text-gray-500">Gram.</span> <StarInputInline value={formData.score_grammar} onChange={(v) => setFormData((p) => ({ ...p, score_grammar: v }))} /></span>
        <span><span className="text-gray-500">Delays</span> <StarInputInline value={formData.score_delays} onChange={(v) => setFormData((p) => ({ ...p, score_delays: v }))} /></span>
      </div>
      <Input
        value={formData.positive_feedback}
        onChange={(e) => setFormData((prev) => ({ ...prev, positive_feedback: e.target.value }))}
        placeholder="+ Positive feedback"
        className="h-7 text-xs border-gray-200"
      />
      <Input
        value={formData.negative_feedback}
        onChange={(e) =>
          setFormData((prev) => ({ ...prev, negative_feedback: e.target.value }))
        }
        placeholder="− Areas for improvement"
        className="h-7 text-xs border-gray-200"
      />
      {!isFormValid() && (
        <p className="text-xs text-gray-500">Provide at least a title, rating, or feedback.</p>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isLoading} className="h-6 text-xs">
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={isLoading || !isFormValid()} className="h-6 text-xs">
          {isLoading ? "Saving..." : "Submit"}
        </Button>
      </div>
    </div>
  );
}
