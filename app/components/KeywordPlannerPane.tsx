"use client"

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search, Loader2, ChevronUp, ChevronDown, Download, AlertCircle, RefreshCw, BookmarkPlus, Bookmark, ExternalLink } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useKeywordPlanner, type KeywordPlannerFilters } from '../hooks/useKeywordPlanner';
import { regions, languages } from '../lib/geoLanguageMaps';
import { SaveKeywordModal } from './SaveKeywordModal';
import { SavedKeywordsSection } from './SavedKeywordsSection';
import { type KeywordIdea } from '../hooks/useKeywordPlanner';
import { useKeywordListsApi } from '../store/keyword-lists-api';
import { useTopResults } from '../hooks/useTopResults';
import { TopResultsSection } from './TopResultsSection';

interface KeywordPlannerPaneProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeywordPlannerPane({ isOpen, onClose }: KeywordPlannerPaneProps) {
  const [filters, setFilters] = useState<KeywordPlannerFilters>({
    keyword: '',
    regionId: '',
    languageId: '',
  });

  const [sortField, setSortField] = useState<'avgMonthlySearches' | 'competitionIndex'>('avgMonthlySearches');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<KeywordIdea | null>(null);
  const [showSavedKeywords, setShowSavedKeywords] = useState(false);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [showTopResults, setShowTopResults] = useState(false);

  // Use the new API store
  const { logSearch, searchHistory, fetchSearchHistory } = useKeywordListsApi();
  
  // Use top results hook
  const {
    fetchTopResults,
    getTopResults,
    isLoading: isTopResultsLoading,
    getError: getTopResultsError,
    retryTopResults,
  } = useTopResults();

  const keywordInputRef = useRef<HTMLInputElement>(null);

  // Helper functions to convert IDs to user-friendly names for top results
  const getLanguageName = useCallback((languageId: string) => {
    if (!languageId) return '';
    const language = languages.find(l => l.id === languageId);
    return language?.name || '';
  }, []);

  const getRegionName = useCallback((regionId: string) => {
    if (!regionId) return '';
    const region = regions.find(r => r.id === regionId);
    return region?.name || '';
  }, []);

  const {
    data,
    isLoading,
    error,
    isFetching,
    triggerSearch,
    canSearch,
    getCompetitionLevel,
    getCompetitionColor,
    hasResults,
    resultCount,
    elapsedMs,
  } = useKeywordPlanner(filters, {
    enabled: false, // We'll trigger manually on button click
  });

  // Focus keyword input when pane opens
  useEffect(() => {
    if (isOpen && keywordInputRef.current) {
      setTimeout(() => keywordInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Load search history when pane opens
  useEffect(() => {
    if (isOpen) {
      fetchSearchHistory();
    }
  }, [isOpen, fetchSearchHistory]);

  // Handle ESC key to close pane
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (canSearch) {
      triggerSearch();
    }
  }, [canSearch, triggerSearch]);

  // Handle input changes
  const handleInputChange = useCallback((field: keyof KeywordPlannerFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  }, []);

  // Handle sorting
  const handleSort = useCallback((field: 'avgMonthlySearches' | 'competitionIndex') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  // Handle save keyword
  const handleSaveKeyword = useCallback((keyword: KeywordIdea) => {
    setSelectedKeyword(keyword);
    setSaveModalOpen(true);
  }, []);

  // Sort results
  const sortedResults = React.useMemo(() => {
    if (!data?.results) return [];
    
    return [...data.results].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (sortDirection === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
  }, [data?.results, sortField, sortDirection]);

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    if (!data?.results) return;

    const headers = ['Keyword', 'Avg Monthly Searches', 'Competition'];
    const csvContent = [
      headers.join(','),
      ...sortedResults.map(row => [
        `"${row.keyword}"`,
        row.avgMonthlySearches,
        row.competitionIndex
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keyword-ideas-${filters.keyword}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data?.results, sortedResults, filters.keyword]);

  // Format number with commas
  const formatNumber = useCallback((num: number) => {
    return num.toLocaleString();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 w-96 bg-white border-l border-gray-200 flex flex-col h-screen z-50 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Keyword Planner</h2>
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTopResults(!showTopResults)}
            className="text-xs"
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            Top Results
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSavedKeywords(!showSavedKeywords)}
            className="text-xs"
          >
            <Bookmark className="w-4 h-4 mr-1" />
            Saved
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 space-y-4">
          {/* Saved Keywords Section */}
          {showSavedKeywords && (
            <SavedKeywordsSection />
          )}
          
          {/* Top Results Section */}
          {showTopResults && filters.keyword.trim() && (
            <TopResultsSection
              keyword={filters.keyword}
              languageId={getLanguageName(filters.languageId)}
              regionId={getRegionName(filters.regionId)}
              results={getTopResults(filters.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId))?.results}
              isLoading={isTopResultsLoading(filters.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId))}
              error={getTopResultsError(filters.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId))}
              onRetry={() => retryTopResults(filters.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId))}
              onFetch={() => fetchTopResults(filters.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId))}
            />
          )}
          
          {/* Search Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="keyword" className="block text-sm font-medium text-gray-700 mb-1">
                Keyword *
              </label>
              <Input
                ref={keywordInputRef}
                id="keyword"
                type="text"
                value={filters.keyword}
                onChange={(e) => handleInputChange('keyword', e.target.value)}
                placeholder="Enter keyword..."
                className="w-full"
                required
              />
              {filters.keyword.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    logSearch(filters.keyword, filters.regionId, filters.languageId);
                    setShowSearchHistory(!showSearchHistory);
                    if (!showSearchHistory) {
                      fetchSearchHistory();
                    }
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline mt-1"
                >
                  see history
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="region" className="block text-sm font-medium text-gray-700 mb-1">
                  Region
                </label>
                <select
                  id="region"
                  value={filters.regionId}
                  onChange={(e) => handleInputChange('regionId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400"
                >
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                  Language
                </label>
                <select
                  id="language"
                  value={filters.languageId}
                  onChange={(e) => handleInputChange('languageId', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400"
                >
                  {languages.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!canSearch || isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Getting ideas...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Get ideas
                </>
              )}
            </Button>
          </form>

          {/* Search History Section */}
          {showSearchHistory && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">Search History</h3>
                <button
                  type="button"
                  onClick={() => setShowSearchHistory(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Hide
                </button>
              </div>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                {searchHistory && searchHistory.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto">
                    {searchHistory.map((item, index) => (
                      <div
                        key={item.id || index}
                        className="px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {item.term}
                            </div>
                            <div className="text-xs text-gray-500">
                              {item.region_id && `Region: ${regions.find(r => r.id === item.region_id)?.name || item.region_id}`}
                              {item.region_id && item.language_id && ' • '}
                              {item.language_id && `Language: ${languages.find(l => l.id === item.language_id)?.name || item.language_id}`}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 ml-2">
                            {new Date(item.searched_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-gray-500">
                    No search history found
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results Section */}
          {hasResults && (
            <div className="space-y-3">
              {/* Results Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {resultCount} results
                  </span>
                  {elapsedMs > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {elapsedMs}ms
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  className="text-xs"
                >
                  <Download className="w-3 h-3 mr-1" />
                  Export CSV
                </Button>
              </div>

              {/* Results Table */}
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">
                        Keyword
                      </th>
                      <th 
                        className="px-3 py-2 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('avgMonthlySearches')}
                      >
                        <div className="flex items-center gap-1">
                          Searches
                          {sortField === 'avgMonthlySearches' ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )
                          ) : null}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-2 text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('competitionIndex')}
                      >
                        <div className="flex items-center gap-1">
                          Competition
                          {sortField === 'competitionIndex' ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )
                          ) : null}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedResults.map((result, index) => {
                      const topResults = getTopResults(result.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId));
                      const isTopResultsLoadingForRow = isTopResultsLoading(result.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId));
                      const topResultsError = getTopResultsError(result.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId));
                      
                      return (
                        <React.Fragment key={index}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-900 font-medium">
                              {result.keyword}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {formatNumber(result.avgMonthlySearches)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${getCompetitionColor(result.competitionIndex)}`}
                                >
                                  {getCompetitionLevel(result.competitionIndex)}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSaveKeyword(result)}
                                  className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600"
                                  title="Save to list"
                                >
                                  <BookmarkPlus className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    fetchTopResults(result.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId));
                                  }}
                                  className="h-6 w-6 p-0 text-gray-400 hover:text-green-600"
                                  title="View top results"
                                  disabled={isTopResultsLoadingForRow}
                                >
                                  {isTopResultsLoadingForRow ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ExternalLink className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {/* Top Results Row */}
                          {(topResults?.results || isTopResultsLoadingForRow || topResultsError) && (
                            <tr>
                              <td colSpan={3} className="px-3 py-2 bg-gray-50">
                                <TopResultsSection
                                  keyword={result.keyword}
                                  languageId={getLanguageName(filters.languageId)}
                                  regionId={getRegionName(filters.regionId)}
                                  results={topResults?.results}
                                  isLoading={isTopResultsLoadingForRow}
                                  error={topResultsError}
                                  onRetry={() => retryTopResults(result.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId))}
                                  onFetch={() => fetchTopResults(result.keyword, getLanguageName(filters.languageId), getRegionName(filters.regionId))}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && !hasResults && filters.keyword && (
            <div className="text-center py-8">
              <Search className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">
                No keyword ideas found for "{filters.keyword}"
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Try a different keyword or adjust your filters
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="border border-red-200 rounded-md p-4 bg-red-50">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-800">
                    Error loading keyword ideas
                  </h3>
                  <p className="text-sm text-red-700 mt-1">
                    {error.message}
                  </p>
                  {showErrorDetails && (
                    <details className="mt-2">
                      <summary className="text-xs text-red-600 cursor-pointer">
                        View details
                      </summary>
                      <pre className="text-xs text-red-600 mt-1 whitespace-pre-wrap">
                        {JSON.stringify(error, null, 2)}
                      </pre>
                    </details>
                  )}
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowErrorDetails(!showErrorDetails)}
                      className="text-xs"
                    >
                      {showErrorDetails ? 'Hide' : 'View'} details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={triggerSearch}
                      className="text-xs"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded w-16 animate-pulse" />
              </div>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <div className="bg-gray-50 px-3 py-2">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="px-3 py-2 border-t border-gray-200">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                      <div className="h-4 bg-gray-200 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Keyword Modal */}
      {selectedKeyword && (
        <SaveKeywordModal
          isOpen={saveModalOpen}
          onClose={() => {
            setSaveModalOpen(false);
            setSelectedKeyword(null);
          }}
          keyword={selectedKeyword}
        />
      )}
    </div>
  );
} 