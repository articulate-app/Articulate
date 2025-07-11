'use client';

import { Button } from './button';
import { Filter } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';

interface FilterButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  activeFilterCount: number;
  className?: string;
}

export function FilterButton({ isOpen, onToggle, activeFilterCount, className }: FilterButtonProps) {
  return (
    <Button
      variant="outline"
      onClick={onToggle}
      className={cn('relative', className)}
    >
      <Filter className="h-4 w-4 mr-2" />
      Filters
      {activeFilterCount > 0 && (
        <Badge
          variant="secondary"
          className="ml-2"
        >
          {activeFilterCount}
        </Badge>
      )}
    </Button>
  );
} 