import React from 'react';

interface DateToggleProps {
  value: 'delivery_date' | 'publication_date';
  onChange: (val: 'delivery_date' | 'publication_date') => void;
}

/**
 * DateToggle allows switching between Delivery Date and Publication Date views.
 */
export function DateToggle({ value, onChange }: DateToggleProps) {
  return (
    <div className="inline-flex rounded-md shadow-sm" role="group">
      <button
        type="button"
        className={`px-3 py-1 text-sm font-medium border border-gray-200 first:rounded-l-md last:rounded-r-md focus:z-10 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
          value === 'delivery_date' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        aria-pressed={value === 'delivery_date'}
        onClick={() => onChange('delivery_date')}
      >
        Delivery Date
      </button>
      <button
        type="button"
        className={`px-3 py-1 text-sm font-medium border-t border-b border-r border-gray-200 last:rounded-r-md focus:z-10 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
          value === 'publication_date' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        aria-pressed={value === 'publication_date'}
        onClick={() => onChange('publication_date')}
      >
        Publication Date
      </button>
    </div>
  );
} 