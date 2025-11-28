"use client"

import React, { useState, useEffect } from 'react';
import { Bookmark, ChevronDown, ChevronRight, Trash2, Edit3, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useKeywordListsApi } from '../store/keyword-lists-api';
import { type KeywordList, type Keyword } from '../../lib/types/keyword';

interface SavedKeywordsSectionProps {
  onKeywordClick?: (keyword: Keyword) => void;
}

export function SavedKeywordsSection({ onKeywordClick }: SavedKeywordsSectionProps) {
  const { 
    lists, 
    isLoading, 
    error, 
    keywords, 
    keywordsLoading, 
    keywordsError,
    fetchLists, 
    deleteList, 
    removeKeyword, 
    updateList,
    fetchKeywords 
  } = useKeywordListsApi();
  
  const [expandedLists, setExpandedLists] = useState<Set<number>>(new Set());
  const [editingList, setEditingList] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  // Fetch lists on mount
  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const toggleList = (listId: number) => {
    const newExpanded = new Set(expandedLists);
    if (newExpanded.has(listId)) {
      newExpanded.delete(listId);
    } else {
      newExpanded.add(listId);
      // Fetch keywords when expanding
      fetchKeywords(listId);
    }
    setExpandedLists(newExpanded);
  };

  const startEditing = (list: KeywordList) => {
    setEditingList(list.id);
    setEditName(list.name);
  };

  const saveEdit = async () => {
    if (editingList && editName.trim()) {
      try {
        await updateList(editingList, editName.trim());
        setEditingList(null);
        setEditName('');
      } catch (error) {
        console.error('Error updating list:', error);
      }
    }
  };

  const cancelEdit = () => {
    setEditingList(null);
    setEditName('');
  };

  const handleDeleteList = async (listId: number) => {
    if (confirm('Are you sure you want to delete this list? This action cannot be undone.')) {
      try {
        await deleteList(listId);
        const newExpanded = new Set(expandedLists);
        newExpanded.delete(listId);
        setExpandedLists(newExpanded);
      } catch (error) {
        console.error('Error deleting list:', error);
      }
    }
  };

  const handleRemoveKeyword = async (listId: number, keywordId: number) => {
    if (confirm('Remove this keyword from the list?')) {
      try {
        await removeKeyword(listId, keywordId);
      } catch (error) {
        console.error('Error removing keyword:', error);
      }
    }
  };

  const getCompetitionLevel = (competitionIndex: number): string => {
    if (competitionIndex >= 80) return 'High';
    if (competitionIndex >= 50) return 'Medium';
    if (competitionIndex >= 20) return 'Low';
    return 'Very Low';
  };

  const getCompetitionColor = (competitionIndex: number): string => {
    if (competitionIndex >= 80) return 'text-red-600';
    if (competitionIndex >= 50) return 'text-orange-600';
    if (competitionIndex >= 20) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (isLoading) {
    return (
      <div className="text-center py-6 text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
        <p className="text-sm">Loading keyword lists...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-red-500">
        <p className="text-sm">Error loading keyword lists: {error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchLists}
          className="mt-2"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <Bookmark className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm">No saved keyword lists yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Save keywords from search results to create lists
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Saved Keywords</h3>
      
      {lists.map((list) => (
        <div key={list.id} className="border border-gray-200 rounded-md">
          {/* List Header */}
          <div className="flex items-center justify-between p-3 bg-gray-50">
            <div className="flex items-center gap-2 flex-1">
              <button
                onClick={() => toggleList(list.id)}
                className="text-gray-500 hover:text-gray-700"
              >
                {expandedLists.has(list.id) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              
              {editingList === list.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={saveEdit}
                    className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                  >
                    ✓
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={cancelEdit}
                    className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-1">
                  <Bookmark className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">{list.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {keywords[list.id]?.length || 0}
                  </Badge>
                </div>
              )}
            </div>
            
            {editingList !== list.id && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEditing(list)}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                  title="Edit list name"
                >
                  <Edit3 className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteList(list.id)}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                  title="Delete list"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>

          {/* List Content */}
          {expandedLists.has(list.id) && (
            <div className="p-3 space-y-2">
              {keywordsLoading[list.id] ? (
                <div className="text-center py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400 mx-auto"></div>
                </div>
              ) : keywordsError[list.id] ? (
                <div className="text-center py-2 text-red-500">
                  <p className="text-xs">Error loading keywords: {keywordsError[list.id]}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchKeywords(list.id)}
                    className="mt-1"
                  >
                    Retry
                  </Button>
                </div>
              ) : !keywords[list.id] || keywords[list.id].length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-2">
                  No keywords in this list
                </p>
              ) : (
                keywords[list.id].map((keyword) => (
                  <div
                    key={keyword.id}
                    className="flex items-center justify-between p-2 bg-white border border-gray-100 rounded hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {keyword.name}
                      </div>
                                              <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">
                            {keyword.volume?.toLocaleString() || 0} searches
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${getCompetitionColor(keyword.competition_index || 0)}`}
                          >
                            {getCompetitionLevel(keyword.competition_index || 0)}
                          </Badge>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveKeyword(list.id, keyword.id)}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-600"
                        title="Remove keyword"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
} 