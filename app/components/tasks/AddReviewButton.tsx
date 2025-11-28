"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "../ui/button"
import { AddReviewModal } from "./AddReviewModal"

interface AddReviewButtonProps {
  taskId: number | null;
  onReviewAdded: () => void;
}

export function AddReviewButton({ taskId, onReviewAdded }: AddReviewButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSuccess = () => {
    onReviewAdded();
    setIsModalOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsModalOpen(true)}
        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-sm px-2 py-1 h-auto"
      >
        <Plus className="w-4 h-4 mr-1" />
        Add review
      </Button>

      <AddReviewModal
        taskId={taskId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
} 