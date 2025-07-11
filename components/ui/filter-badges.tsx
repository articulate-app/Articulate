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
}

export function FilterBadges({ badges, className }: FilterBadgesProps) {
  if (badges.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {badges.map((badge) => (
        <Badge
          key={badge.id}
          variant="secondary"
          className="flex items-center gap-1"
        >
          <span className="capitalize">{badge.label}:</span>
          <span>{badge.value}</span>
          <button
            onClick={badge.onRemove}
            className="ml-1 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
} 