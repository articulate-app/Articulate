'use client';

import { Badge } from './badge';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterBadge {
  id: string;
  label: string;
  value: string;
  onRemove: () => void;
}

interface FilterBadgesProps {
  badges: FilterBadge[];
  className?: string;
  onClearAll?: () => void;
}

export function FilterBadges({ badges, className, onClearAll }: FilterBadgesProps) {
  if (badges.length === 0) return null;

  // Match the pill button style from TasksLayout
  const pillButton =
    'inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-300 text-gray-700 text-sm font-medium bg-white hover:bg-gray-100 transition shadow-none focus:ring-2 focus:ring-blue-200 focus:outline-none';

  return (
    <div className={cn('flex flex-wrap gap-2 pl-4', className)}>
      {badges.map((badge) => (
        <button
          key={badge.id}
          type="button"
          className={cn(pillButton, 'pr-2')}
          onClick={badge.onRemove}
        >
          <span className="capitalize mr-1">{badge.label}:</span>
          <span className="mr-1">{badge.value}</span>
          <X className="h-3 w-3 text-gray-400 hover:text-destructive transition" />
        </button>
      ))}
      
      {/* Clear All button - show when there are 2 or more filters */}
      {badges.length > 1 && onClearAll && (
        <button
          type="button"
          className={cn(
            pillButton,
            'border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300'
          )}
          onClick={onClearAll}
        >
          <span className="mr-1">Clear All</span>
          <X className="h-3 w-3 text-red-400" />
        </button>
      )}
    </div>
  );
} 