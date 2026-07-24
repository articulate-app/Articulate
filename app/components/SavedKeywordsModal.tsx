"use client"

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, Edit3, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { useKeywordListsApi } from '../store/keyword-lists-api';
import type { KeywordList, Keyword } from '../../lib/types/keyword';

type Step = 'lists' | 'keywords';

type PendingDelete =
  | { type: 'list'; listId: number; name: string }
  | { type: 'keyword'; listId: number; keywordId: number; name: string }
  | null;

interface SavedKeywordsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SavedKeywordsModal({ isOpen, onClose }: SavedKeywordsModalProps) {
  const {
    lists,
    isLoading,
    error,
    keywords,
    keywordsLoading,
    keywordsError,
    fetchLists,
    fetchKeywords,
    deleteList,
    updateList,
    removeKeyword,
  } = useKeywordListsApi();

  const [step, setStep] = useState<Step>('lists');
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const activeList = useMemo<KeywordList | null>(() => {
    if (!activeListId) return null;
    return lists.find(l => l.id === activeListId) ?? null;
  }, [activeListId, lists]);

  const activeKeywords = useMemo<Keyword[]>(() => {
    if (!activeListId) return [];
    return keywords[activeListId] ?? [];
  }, [activeListId, keywords]);

  const isActiveKeywordsLoading = activeListId ? Boolean(keywordsLoading[activeListId]) : false;
  const activeKeywordsError = activeListId ? keywordsError[activeListId] : null;

  useEffect(() => {
    if (isOpen) {
      fetchLists();
    }
  }, [isOpen, fetchLists]);

  const handleClose = () => {
    setStep('lists');
    setActiveListId(null);
    setEditingListId(null);
    setEditName('');
    onClose();
  };

  const handleOpenList = async (listId: number) => {
    setActiveListId(listId);
    setStep('keywords');
    await fetchKeywords(listId);
  };

  const handleBack = () => {
    setStep('lists');
    setActiveListId(null);
    setEditingListId(null);
    setEditName('');
  };

  const startEditing = (list: KeywordList) => {
    setEditingListId(list.id);
    setEditName(list.name);
  };

  const cancelEdit = () => {
    setEditingListId(null);
    setEditName('');
  };

  const saveEdit = async () => {
    if (!editingListId || !editName.trim()) return;
    await updateList(editingListId, editName.trim());
    setEditingListId(null);
    setEditName('');
  };

  const requestDeleteList = (list: KeywordList) => {
    setPendingDelete({ type: 'list', listId: list.id, name: list.name });
  };

  const requestRemoveKeyword = (listId: number, keywordId: number, name: string) => {
    setPendingDelete({ type: 'keyword', listId, keywordId, name });
  };

  const confirmPendingDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      if (pendingDelete.type === 'list') {
        await deleteList(pendingDelete.listId);
        if (activeListId === pendingDelete.listId) {
          handleBack();
        }
      } else {
        await removeKeyword(pendingDelete.listId, pendingDelete.keywordId);
      }
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl h-[70vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="w-5 h-5" />
            Saved keyword lists
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {step === 'lists' && (
            <div className="h-full flex flex-col">
            {isLoading ? (
              <div className="text-center py-6 text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2" />
                <p className="text-sm">Loading keyword lists...</p>
              </div>
            ) : error ? (
              <div className="text-center py-6 text-red-500">
                <p className="text-sm">Error loading keyword lists: {error}</p>
                <Button variant="outline" size="sm" onClick={fetchLists} className="mt-2">
                  Retry
                </Button>
              </div>
            ) : lists.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bookmark className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No saved keyword lists yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Save keywords from search results to create lists
                </p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {lists.map((list) => (
                  <div
                    key={list.id}
                    className="border border-gray-200 rounded-md p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      {editingListId === list.id ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
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
                            variant="outline"
                            size="sm"
                            onClick={saveEdit}
                            className="h-8"
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEdit}
                            className="h-8"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex-1 min-w-0 text-left"
                          onClick={() => handleOpenList(list.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">{list.name}</span>
                            {typeof keywords[list.id]?.length === 'number' ? (
                              <Badge variant="secondary" className="text-xs">
                                {keywords[list.id]!.length}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Updated {new Date(list.updated_at).toLocaleDateString()}
                          </div>
                        </button>
                      )}

                      {editingListId !== list.id && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditing(list)}
                            className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                            title="Edit list name"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => requestDeleteList(list)}
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                            title="Delete list"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          )}

          {step === 'keywords' && activeListId && (
            <div className="h-full flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Button variant="ghost" size="sm" onClick={handleBack} className="h-8 px-2">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {activeList?.name ?? 'List'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {activeKeywords.length} keywords
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-md overflow-hidden flex-1 min-h-0">
              <div className="h-full overflow-y-auto">
                {isActiveKeywordsLoading ? (
                  <div className="text-center py-6 text-gray-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400 mx-auto mb-2" />
                    <p className="text-sm">Loading keywords...</p>
                  </div>
                ) : activeKeywordsError ? (
                  <div className="text-center py-6 text-red-500">
                    <p className="text-sm">Error loading keywords: {activeKeywordsError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchKeywords(activeListId)}
                      className="mt-2"
                    >
                      Retry
                    </Button>
                  </div>
                ) : activeKeywords.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No keywords in this list</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {activeKeywords.map((k) => (
                      <div key={k.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {k.name || (k as any).keyword || (k as any).term || '(untitled keyword)'}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">
                              {k.volume.toLocaleString()} searches
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${getCompetitionColor(k.competition_index)}`}
                            >
                              {getCompetitionLevel(k.competition_index)}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            requestRemoveKeyword(
                              activeListId,
                              k.id,
                              k.name || (k as any).keyword || (k as any).term || 'this keyword',
                            )
                          }
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                          title="Remove keyword"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={pendingDelete != null}
      onOpenChange={(open) => {
        if (!open && !isDeleting) setPendingDelete(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingDelete?.type === 'list' ? 'Delete keyword list?' : 'Remove keyword?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDelete?.type === 'list'
              ? `Delete “${pendingDelete.name}”? This cannot be undone.`
              : `Remove “${pendingDelete?.name ?? 'this keyword'}” from the list?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(e) => {
              e.preventDefault()
              void confirmPendingDelete()
            }}
          >
            {isDeleting ? 'Deleting…' : pendingDelete?.type === 'list' ? 'Delete list' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}


