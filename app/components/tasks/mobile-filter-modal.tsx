"use client";

import React from 'react';
import { ResizableBottomSheet } from '../ui/resizable-bottom-sheet';
import { TaskFilters } from './TaskFilters';
import type { TaskFilters as TaskFiltersType } from '../../store/tasks-ui';

interface MobileFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: TaskFiltersType;
  onFiltersChange: (filters: TaskFiltersType) => void;
  filterOptions?: any;
}

export function MobileFilterModal({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  filterOptions,
}: MobileFilterModalProps) {
  return (
    <ResizableBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      initialHeight={0.8}
      minHeight={0.5}
      maxHeight={0.95}
      title="Filter Tasks"
    >
      <div className="p-4">
        <TaskFilters
          isOpen={isOpen}
          onClose={onClose}
          onApplyFilters={(mappedFilters, displayFilters) => {
            onFiltersChange(displayFilters);
            onClose();
          }}
          activeFilters={filters}
          filterOptions={filterOptions}
        />
      </div>
    </ResizableBottomSheet>
  );
} 