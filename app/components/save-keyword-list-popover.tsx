"use client"

import { useEffect, useState } from "react"
import { BookmarkPlus, Check, Loader2, Plus } from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command"
import { cn } from "@/lib/utils"
import { useKeywordListsApi } from "../store/keyword-lists-api"
import type { KeywordIdea } from "../hooks/useKeywordPlanner"

type SaveKeywordListPopoverProps = {
  keyword: KeywordIdea
  disabled?: boolean
  className?: string
}

/**
 * Inline select-or-create list picker for saving a keyword idea (no modal).
 * Mirrors the OverviewConfigDropdowns Command + footer "add" pattern.
 */
export function SaveKeywordListPopover({
  keyword,
  disabled = false,
  className,
}: SaveKeywordListPopoverProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [isAddInlineOpen, setIsAddInlineOpen] = useState(false)
  const [addDraft, setAddDraft] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [savedListId, setSavedListId] = useState<number | null>(null)

  const { lists, fetchLists, createList, addKeyword } = useKeywordListsApi()

  useEffect(() => {
    if (!open) return
    void fetchLists()
  }, [fetchLists, open])

  useEffect(() => {
    if (!open) {
      setSearch("")
      setIsAddInlineOpen(false)
      setAddDraft("")
      setSavedListId(null)
    }
  }, [open])

  const saveToList = async (listId: number) => {
    setIsSaving(true)
    try {
      await addKeyword(
        listId,
        keyword.keyword,
        keyword.avgMonthlySearches,
        keyword.competitionIndex,
      )
      setSavedListId(listId)
      window.setTimeout(() => setOpen(false), 450)
    } catch (error) {
      console.error("Error saving keyword:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateList = async () => {
    const name = addDraft.trim()
    if (!name) return
    setIsSaving(true)
    try {
      const newList = await createList(name)
      if (newList?.id && typeof newList.id === "number") {
        await addKeyword(
          newList.id,
          keyword.keyword,
          keyword.avgMonthlySearches,
          keyword.competitionIndex,
        )
        setSavedListId(newList.id)
        window.setTimeout(() => setOpen(false), 450)
      }
    } catch (error) {
      console.error("Error creating list:", error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || isSaving}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "h-7 w-7 p-0 text-gray-400 hover:text-gray-900",
            className,
          )}
          title="Save to list"
          aria-label={`Save ${keyword.keyword} to a list`}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BookmarkPlus className="h-3.5 w-3.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(92vw,18rem)] p-0"
        align="end"
        onClick={(event) => event.stopPropagation()}
      >
        <Command>
          {!isAddInlineOpen ? (
            <>
              <CommandInput
                placeholder="Search lists..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList className="max-h-[220px]">
                <CommandEmpty>No lists found.</CommandEmpty>
                <CommandGroup>
                  {lists.map((list) => {
                    const isJustSaved = savedListId === list.id
                    return (
                      <CommandItem
                        key={list.id}
                        value={list.name}
                        disabled={isSaving}
                        onSelect={() => {
                          void saveToList(list.id)
                        }}
                      >
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <div className="flex h-4 w-4 items-center justify-center">
                            <Check
                              className={cn(
                                "h-4 w-4",
                                isJustSaved ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </div>
                          <span className="min-w-0 flex-1 truncate">{list.name}</span>
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </>
          ) : null}
          <div className="border-t border-gray-200 p-1">
            {!isAddInlineOpen ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-full justify-start px-2 text-gray-600 hover:text-gray-900"
                disabled={isSaving}
                onClick={() => {
                  setAddDraft(search)
                  setIsAddInlineOpen(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New list
              </Button>
            ) : (
              <div className="space-y-2 p-2">
                <Input
                  value={addDraft}
                  onChange={(event) => setAddDraft(event.target.value)}
                  placeholder="List name..."
                  className="h-8"
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void handleCreateList()
                    }
                  }}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={isSaving}
                    onClick={() => {
                      setIsAddInlineOpen(false)
                      setAddDraft("")
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2"
                    disabled={!addDraft.trim() || isSaving}
                    onClick={() => void handleCreateList()}
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
