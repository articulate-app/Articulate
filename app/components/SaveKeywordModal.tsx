"use client"

import React, { useState } from 'react';
import { X, Plus, Save } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useKeywordListsApi } from '../store/keyword-lists-api';
import { type KeywordIdea } from '../hooks/useKeywordPlanner';
import { type KeywordList } from '../../lib/types/keyword';

interface SaveKeywordModalProps {
  isOpen: boolean;
  onClose: () => void;
  keyword: KeywordIdea;
}

export function SaveKeywordModal({ isOpen, onClose, keyword }: SaveKeywordModalProps) {
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { lists, isLoading, error, createList, addKeyword } = useKeywordListsApi();

  const handleSave = async () => {
    if (!selectedListId) return;

    setIsSaving(true);
    try {
      // Add the keyword to the selected list
      await addKeyword(
        selectedListId,
        keyword.keyword,
        keyword.avgMonthlySearches,
        keyword.competitionIndex
      );

      // Reset form and close modal
      setSelectedListId(null);
      setIsCreatingNew(false);
      setNewListName('');
      onClose();
    } catch (error) {
      console.error('Error saving keyword:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewList = async () => {
    if (!newListName.trim()) return;

    setIsSaving(true);
    try {
      // Create new list
      const newList = await createList(newListName.trim());
      
      if (newList && newList.id && typeof newList.id === 'number') {
        // Add keyword to the new list (store already ensured list is committed)
        await addKeyword(
          newList.id,
          keyword.keyword,
          keyword.avgMonthlySearches,
          keyword.competitionIndex
        );
      } else {
        throw new Error('Failed to create list - no valid ID returned');
      }

      // Reset form and close modal
      setSelectedListId(null);
      setIsCreatingNew(false);
      setNewListName('');
      onClose();
    } catch (error) {
      console.error('Error creating list:', error);
      // Don't close modal on error, let user try again
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedListId(null);
    setIsCreatingNew(false);
    setNewListName('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5" />
            Save Keyword
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Keyword Preview */}
          <div className="p-3 bg-gray-50 rounded-md">
            <div className="text-sm font-medium text-gray-900">{keyword.keyword}</div>
            <div className="text-xs text-gray-500 mt-1">
              {keyword.avgMonthlySearches.toLocaleString()} monthly searches • 
              Competition: {keyword.competitionIndex >= 80 ? 'High' : 
                           keyword.competitionIndex >= 50 ? 'Medium' : 
                           keyword.competitionIndex >= 20 ? 'Low' : 'Very Low'}
            </div>
          </div>

          {/* List Selection */}
          {!isCreatingNew ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Select List</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreatingNew(true)}
                  className="text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  New List
                </Button>
              </div>

              {lists.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm">No lists created yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreatingNew(true)}
                    className="mt-2"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Create First List
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {lists.map((list) => (
                    <label
                      key={list.id}
                      className={`flex items-center p-3 border rounded-md cursor-pointer transition-colors ${
                        selectedListId === list.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="list"
                        value={list.id.toString()}
                        checked={selectedListId === list.id}
                        onChange={(e) => setSelectedListId(parseInt(e.target.value))}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">{list.name}</div>
                        <div className="text-xs text-gray-500">
                          Updated {new Date(list.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Create New List */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Create New List</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreatingNew(false)}
                  className="text-xs"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              <Input
                placeholder="Enter list name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newListName.trim()) {
                    handleCreateNewList();
                  }
                }}
                autoFocus
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              Cancel
            </Button>
            {isCreatingNew ? (
              <Button
                onClick={handleCreateNewList}
                disabled={!newListName.trim() || isSaving}
                className="flex-1"
              >
                {isSaving ? 'Creating...' : 'Create & Save'}
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={!selectedListId || isSaving}
                className="flex-1"
              >
                {isSaving ? 'Saving...' : 'Save to List'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 