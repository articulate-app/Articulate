'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { useCalendarOccupation } from '../../hooks/use-calendar-occupation';
import { cn } from '../../lib/utils';

interface OccupationAwareDatePickerProps {
  value?: string;
  onChange?: (date: string) => void;
  userId?: string;
  contentTypeId?: string;
  productionTypeId?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function OccupationAwareDatePicker({
  value,
  onChange,
  userId,
  contentTypeId,
  productionTypeId,
  placeholder = "Select date",
  className,
  disabled = false,
}: OccupationAwareDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Calculate calendar range (current month)
  const rangeStart = useMemo(() => {
    const start = new Date(currentMonth);
    start.setDate(1);
    return start.toISOString().split('T')[0];
  }, [currentMonth]);

  const rangeEnd = useMemo(() => {
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    return end.toISOString().split('T')[0];
  }, [currentMonth]);

  // Get calendar occupation data
  const { dateOccupationMap, isCalendarLoading } = useCalendarOccupation({
    userId,
    contentTypeId,
    productionTypeId,
    rangeStart,
    rangeEnd,
  });

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    const currentDate = new Date(startDate);

    while (currentDate <= lastDay || currentDate.getDay() !== 0) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return days;
  }, [currentMonth]);

  // Navigation functions
  const goToPreviousMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    onChange?.(dateString);
    setIsOpen(false);
  };

  // Get occupation color for a date
  const getDateOccupationColor = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    const occupationData = dateOccupationMap.get(dateString);
    
    if (!occupationData) return 'default';
    
    return occupationData.color;
  };

  // Get occupation tooltip for a date
  const getDateOccupationTooltip = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    const occupationData = dateOccupationMap.get(dateString);
    
    if (!occupationData) return '';
    
    const percentage = Math.round(occupationData.adjusted_occupation * 100);
    return `${percentage}% occupied`;
  };

  // Check if date is today
  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if date is selected
  const isSelected = (date: Date) => {
    if (!value) return false;
    return date.toISOString().split('T')[0] === value;
  };

  // Check if date is in current month
  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  return (
    <div className={cn("relative", className)}>
      {/* Date Input */}
      <Button
        variant="outline"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full justify-start text-left font-normal"
      >
        <Calendar className="mr-2 h-4 w-4" />
        {value ? new Date(value).toLocaleDateString() : placeholder}
      </Button>

      {/* Calendar Popup */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border rounded-md shadow-lg p-4 min-w-[280px]">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPreviousMonth}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="text-sm font-medium">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNextMonth}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-xs text-gray-500 text-center py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              const occupationColor = getDateOccupationColor(date);
              const tooltip = getDateOccupationTooltip(date);
              
              return (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDateSelect(date)}
                  className={cn(
                    "h-8 w-8 p-0 text-xs relative",
                    !isCurrentMonth(date) && "text-gray-400",
                    isToday(date) && "font-bold",
                    isSelected(date) && "bg-blue-500 text-white hover:bg-blue-600",
                    occupationColor === 'green' && "bg-green-50 hover:bg-green-100",
                    occupationColor === 'yellow' && "bg-yellow-50 hover:bg-yellow-100",
                    occupationColor === 'red' && "bg-red-50 hover:bg-red-100",
                  )}
                  title={tooltip}
                  disabled={!isCurrentMonth(date)}
                >
                  {date.getDate()}
                  {/* Occupation indicator dot */}
                  {occupationColor !== 'default' && (
                    <div className={cn(
                      "absolute bottom-0.5 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full",
                      occupationColor === 'green' && "bg-green-500",
                      occupationColor === 'yellow' && "bg-yellow-500",
                      occupationColor === 'red' && "bg-red-500",
                    )} />
                  )}
                </Button>
              );
            })}
          </div>

          {/* Loading indicator */}
          {isCalendarLoading && (
            <div className="mt-2 text-xs text-gray-500 text-center">
              Loading availability...
            </div>
          )}

          {/* Legend */}
          <div className="mt-3 pt-3 border-t text-xs text-gray-500">
            <div className="flex items-center justify-center space-x-4">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Available</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span>Busy</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span>Full/OOH</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 