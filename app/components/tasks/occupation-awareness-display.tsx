'use client';

import React from 'react';
import { useOccupationAwareness } from '../../hooks/use-occupation-awareness';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Calendar, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { OccupationAwarenessDisplayProps } from '../../lib/types/occupation';

export function OccupationAwarenessDisplay({
  userId,
  contentTypeId,
  productionTypeId,
  deliveryDate,
  onDateSelect,
}: OccupationAwarenessDisplayProps) {
  const {
    occupationData,
    isOccupationLoading,
    occupationError,
    suggestedDates,
    isSuggestedDatesLoading,
    getOccupationStatus,
    getOccupationMessage,
    isEnabled,
  } = useOccupationAwareness({
    userId,
    contentTypeId,
    productionTypeId,
    deliveryDate,
  });

  if (!isEnabled) {
    return null;
  }

  if (isOccupationLoading) {
    return (
      <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-md">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
        <span className="text-sm text-gray-600">Checking availability...</span>
      </div>
    );
  }

  if (occupationError) {
    return (
      <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
        <XCircle className="h-4 w-4 text-red-500" />
        <span className="text-sm text-red-600">Error loading availability data</span>
      </div>
    );
  }

  if (!occupationData) {
    return null;
  }

  const { status, color } = getOccupationStatus();
  const message = getOccupationMessage();

  const getStatusIcon = () => {
    switch (status) {
      case 'available':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'nearly_full':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'overbooked':
      case 'unavailable':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Calendar className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadgeColor = () => {
    switch (color) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-3">
      {/* Main occupation status */}
      <div className={`flex items-center justify-between p-3 rounded-md border ${
        color === 'green' ? 'bg-green-50 border-green-200' :
        color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
        color === 'red' ? 'bg-red-50 border-red-200' :
        'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className="text-sm font-medium">{message}</span>
        </div>
        <Badge className={getStatusBadgeColor()}>
          {Math.round(occupationData.adjusted_occupation_ratio * 100)}%
        </Badge>
      </div>

      {/* Detailed breakdown */}
      <div className="text-xs text-gray-600 space-y-1">
        <div className="flex justify-between">
          <span>Existing hours:</span>
          <span>{occupationData.existing_hours}h</span>
        </div>
        <div className="flex justify-between">
          <span>New task duration:</span>
          <span>{occupationData.new_task_duration}h</span>
        </div>
        <div className="flex justify-between">
          <span>Total hours:</span>
          <span>{occupationData.adjusted_hours}h</span>
        </div>
        <div className="flex justify-between">
          <span>Daily capacity:</span>
          <span>{occupationData.capacity}h</span>
        </div>
      </div>

      {/* Suggested dates for OOH or overbooked users */}
      {(status === 'unavailable' || status === 'overbooked') && suggestedDates && suggestedDates.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">Suggested dates:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedDates.slice(0, 5).map((suggestion) => (
              <Button
                key={suggestion.suggested_date}
                variant="outline"
                size="sm"
                onClick={() => onDateSelect?.(suggestion.suggested_date)}
                className="text-xs"
              >
                {new Date(suggestion.suggested_date).toLocaleDateString()}
                <span className="ml-1 text-gray-500">
                  ({Math.round(suggestion.occupation_ratio * 100)}%)
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Loading state for suggested dates */}
      {isSuggestedDatesLoading && (
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
          <span>Finding available dates...</span>
        </div>
      )}
    </div>
  );
} 