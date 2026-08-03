"use client"

import React, { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Bookmark, Edit3, Trash2, X } from "lucide-react"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog"
import { usePromptListsApi } from "../store/prompt-lists-api"
import type { PromptList, PromptListItem } from "../../lib/types/prompt-list"

type Step = "lists" | "prompts"

type PendingDelete =
  | { type: "list"; listId: number; name: string }
  | { type: "prompt"; listId: number; itemId: number; name: string }
  | null

interface SavedPromptsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SavedPromptsModal({ isOpen, onClose }: SavedPromptsModalProps) {
  const {
    lists,
    isLoading,
    error,
    items,
    itemsLoading,
    itemsError,
    fetchLists,
    fetchItems,
    deleteList,
    updateList,
    removePrompt,
  } = usePromptListsApi()

  const [step, setStep] = useState<Step>("lists")
  const [activeListId, setActiveListId] = useState<number | null>(null)
  const [editingListId, setEditingListId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const activeList = useMemo<PromptList | null>(() => {
    if (!activeListId) return null
    return lists.find((list) => list.id === activeListId) ?? null
  }, [activeListId, lists])

  const activeItems = useMemo<PromptListItem[]>(() => {
    if (!activeListId) return []
    return items[activeListId] ?? []
  }, [activeListId, items])

  const isActiveItemsLoading = activeListId ? Boolean(itemsLoading[activeListId]) : false
  const activeItemsError = activeListId ? itemsError[activeListId] : null

  useEffect(() => {
    if (isOpen) void fetchLists()
  }, [fetchLists, isOpen])

  const handleClose = () => {
    setStep("lists")
    setActiveListId(null)
    setEditingListId(null)
    setEditName("")
    onClose()
  }

  const handleOpenList = async (listId: number) => {
    setActiveListId(listId)
    setStep("prompts")
    await fetchItems(listId)
  }

  const handleBack = () => {
    setStep("lists")
    setActiveListId(null)
    setEditingListId(null)
    setEditName("")
  }

  const startEditing = (list: PromptList) => {
    setEditingListId(list.id)
    setEditName(list.name)
  }

  const cancelEdit = () => {
    setEditingListId(null)
    setEditName("")
  }

  const saveEdit = async () => {
    if (!editingListId || !editName.trim()) return
    await updateList(editingListId, editName.trim())
    setEditingListId(null)
    setEditName("")
  }

  const requestDeleteList = (list: PromptList) => {
    setPendingDelete({ type: "list", listId: list.id, name: list.name })
  }

  const requestRemovePrompt = (listId: number, itemId: number, name: string) => {
    setPendingDelete({ type: "prompt", listId, itemId, name })
  }

  const confirmPendingDelete = async () => {
    if (!pendingDelete || isDeleting) return
    setIsDeleting(true)
    try {
      if (pendingDelete.type === "list") {
        await deleteList(pendingDelete.listId)
        if (activeListId === pendingDelete.listId) handleBack()
      } else {
        await removePrompt(pendingDelete.listId, pendingDelete.itemId)
      }
      setPendingDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="flex h-[70vh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="h-5 w-5" />
              Saved prompt lists
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1">
            {step === "lists" ? (
              <div className="flex h-full flex-col">
                {isLoading ? (
                  <div className="py-6 text-center text-gray-500">
                    <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-400" />
                    <p className="text-sm">Loading prompt lists...</p>
                  </div>
                ) : error ? (
                  <div className="py-6 text-center text-red-500">
                    <p className="text-sm">Error loading prompt lists: {error}</p>
                    <Button variant="outline" size="sm" onClick={() => void fetchLists()} className="mt-2">
                      Retry
                    </Button>
                  </div>
                ) : lists.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    <Bookmark className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                    <p className="text-sm">No saved prompt lists yet</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Save prompts from research results to create lists
                    </p>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {lists.map((list) => (
                      <div
                        key={list.id}
                        className="rounded-md border border-gray-200 p-3 transition-colors hover:bg-gray-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          {editingListId === list.id ? (
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <input
                                type="text"
                                value={editName}
                                onChange={(event) => setEditName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void saveEdit()
                                  if (event.key === "Escape") cancelEdit()
                                }}
                                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                              <Button variant="outline" size="sm" onClick={() => void saveEdit()} className="h-8">
                                Save
                              </Button>
                              <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-8">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              onClick={() => void handleOpenList(list.id)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-gray-900">
                                  {list.name}
                                </span>
                                {typeof items[list.id]?.length === "number" ? (
                                  <Badge variant="secondary" className="text-xs">
                                    {items[list.id]!.length}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                Updated {new Date(list.updated_at).toLocaleDateString()}
                              </div>
                            </button>
                          )}

                          {editingListId !== list.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditing(list)}
                                className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                                title="Edit list name"
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => requestDeleteList(list)}
                                className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                                title="Delete list"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {step === "prompts" && activeListId ? (
              <div className="flex h-full flex-col gap-3">
                <div className="flex flex-shrink-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleBack} className="h-8 px-2">
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Back
                    </Button>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {activeList?.name ?? "List"}
                      </div>
                      <div className="text-xs text-gray-500">{activeItems.length} prompts</div>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-gray-200">
                  <div className="h-full overflow-y-auto">
                    {isActiveItemsLoading ? (
                      <div className="py-6 text-center text-gray-500">
                        <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-b-2 border-gray-400" />
                        <p className="text-sm">Loading prompts...</p>
                      </div>
                    ) : activeItemsError ? (
                      <div className="py-6 text-center text-red-500">
                        <p className="text-sm">Error loading prompts: {activeItemsError}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void fetchItems(activeListId)}
                          className="mt-2"
                        >
                          Retry
                        </Button>
                      </div>
                    ) : activeItems.length === 0 ? (
                      <div className="py-8 text-center text-gray-500">
                        <p className="text-sm">No prompts in this list</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {activeItems.map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <div className="break-words text-sm font-medium text-gray-900">
                                {item.prompt}
                              </div>
                              {item.language_code ? (
                                <div className="mt-1 text-xs text-gray-500">
                                  {item.language_code.toUpperCase()}
                                </div>
                              ) : null}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                requestRemovePrompt(activeListId, item.id, item.prompt)
                              }
                              className="h-8 w-8 shrink-0 p-0 text-gray-400 hover:text-red-600"
                              title="Remove prompt"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.type === "list" ? "Delete prompt list?" : "Remove prompt?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === "list"
                ? `Delete “${pendingDelete.name}”? This cannot be undone.`
                : `Remove “${pendingDelete?.name ?? "this prompt"}” from the list?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault()
                void confirmPendingDelete()
              }}
            >
              {isDeleting
                ? "Deleting…"
                : pendingDelete?.type === "list"
                  ? "Delete list"
                  : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
