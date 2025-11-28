"use client"

import React, { useEffect } from 'react';
import { ExternalLink, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { type TopResult } from '../hooks/useTopResults';

interface TopResultsSectionProps {
  keyword: string;
  languageId?: string | number;
  regionId?: string | number;
  results?: TopResult[];
  isLoading: boolean;
  error?: string;
  onRetry: () => void;
  onFetch: () => void;
}

export function TopResultsSection({
  keyword,
  languageId,
  regionId,
  results,
  isLoading,
  error,
  onRetry,
  onFetch,
}: TopResultsSectionProps) {
  // Auto-fetch results when component mounts
  useEffect(() => {
    if (!results && !isLoading && !error) {
      onFetch();
    }
  }, [results, isLoading, error, onFetch]);

  const hasResults = results && results.length > 0;
  const hasError = error && error.length > 0;

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      {/* Content */}
      <div className="p-3 bg-white">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        )}

        {hasError && (
          <div className="text-center py-4">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </div>
        )}

        {hasResults && !isLoading && !hasError && (
          <div className="space-y-2">
            {results.map((result, index) => (
              <div key={index} className="border-b border-gray-100 last:border-b-0 pb-2 last:pb-0">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <a
                      href={result.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 line-clamp-2"
                    >
                      {result.title}
                    </a>
                    <div className="text-xs text-gray-500 mt-1">
                      {result.displayLink}
                    </div>
                  </div>
                  <a
                    href={result.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {!hasResults && !isLoading && !hasError && (
          <div className="text-center py-4 text-sm text-gray-500">
            No results found
          </div>
        )}
      </div>
    </div>
  );
} 