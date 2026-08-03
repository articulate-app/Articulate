"use client"

import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from "@/lib/utils";
import { X, ChevronDown, FolderKanban, ListTodo, MessageSquare, UserRound, Menu, Bot } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./dropdown-menu";
import { TooltipProvider } from "./tooltip";
import { IconTooltip } from "./icon-tooltip";
import {
  type GlobalSearchDocument,
  type GlobalSearchItemEntityType,
} from "../../lib/global-search-types";
import { GlobalSearchBox } from "./global-search-box";
import { HeaderCreateSurface } from "./header-create-surface";
import {
  CREATE_MODAL_TITLES,
  CREATE_POPUP_Z_CLASS,
  useHeaderCreateFlow,
  type HeaderCreateType,
} from "./use-header-create-flow";
import {
  OPEN_HEADER_CREATE_EVENT,
  type OpenHeaderCreateDetail,
} from "./sidebar-home-feed";

interface TaskHeaderBarProps {
  searchValue: string;
  onSearchChange?: (value: string) => void;
  onSearchCommit?: (value?: string) => void;
  onFilterClick: () => void;
  onSidebarToggle?: () => void;
  onKeywordPlannerClick?: () => void;
  isKeywordPlannerActive?: boolean;
  placeholder?: string;
  onAiChatClick?: () => void;
  onNewAiThreadClick?: () => void;
  /**
   * High-level tasks view mode for the global toggle.
   * - 'list' -> Expanded task list (left pane focused)
   * - 'calendar' -> List (left) + calendar (middle)
   * - 'kanban' -> List (left) + kanban (middle)
   */
  viewMode?: 'list' | 'calendar' | 'kanban';
  onViewModeChange?: (view: 'list' | 'calendar' | 'kanban') => void;
  isSearchOpen?: boolean;
  onSearchOpenChange?: (isOpen: boolean) => void;
  selectedTypeFilters?: GlobalSearchItemEntityType[];
  onToggleTypeFilter?: (type: GlobalSearchItemEntityType) => void;
  onPreviewResultSelect?: (item: GlobalSearchDocument) => void;
  onShowMore?: (type: GlobalSearchItemEntityType, value?: string) => void;
  onShowAll?: (value?: string) => void;
  onClearSearch?: () => void;
}

export function TaskHeaderBar({
  searchValue,
  onSearchChange,
  onSearchCommit,
  onFilterClick,
  onSidebarToggle,
  placeholder,
  onNewAiThreadClick,
  viewMode,
  onViewModeChange,
  isSearchOpen = false,
  onSearchOpenChange,
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onPreviewResultSelect,
  onShowAll,
  onClearSearch,
}: TaskHeaderBarProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false)
  const [isPortalMounted, setIsPortalMounted] = React.useState(false)
  const createFlow = useHeaderCreateFlow({ enabled: isCreateModalOpen })

  React.useEffect(() => {
    setIsPortalMounted(true)
  }, [])

  const openCreateModal = React.useCallback((type: HeaderCreateType = "task") => {
    createFlow.openCreateForm(type)
    setIsCreateModalOpen(true)
  }, [createFlow.openCreateForm])

  React.useEffect(() => {
    const handleOpenCreate = (event: Event) => {
      const detail = (event as CustomEvent<OpenHeaderCreateDetail>).detail
      const type = detail?.type
      if (!type || type === "ai") {
        onNewAiThreadClick?.()
        return
      }
      openCreateModal(type)
    }
    window.addEventListener(OPEN_HEADER_CREATE_EVENT, handleOpenCreate)
    return () => window.removeEventListener(OPEN_HEADER_CREATE_EVENT, handleOpenCreate)
  }, [onNewAiThreadClick, openCreateModal])

  const closeCreateModal = React.useCallback(() => {
    setIsCreateModalOpen(false)
  }, [])

  const handleCreateClose = React.useCallback(() => {
    closeCreateModal()
    createFlow.resetCreateState()
  }, [closeCreateModal, createFlow.resetCreateState])

  return (
    <TooltipProvider delayDuration={120}>
    {/* z-40: above sticky editor toolbars (z-30) so the global-search preview is never covered */}
    <header className="sticky top-0 z-40 grid h-16 w-full grid-cols-[1fr_minmax(0,36rem)_1fr] items-center gap-x-3 border-b bg-white px-4 shadow-sm">
      {/* Left: hamburger + brand (equal 1fr column keeps search visually centered). */}
      <div className="flex min-w-0 items-center gap-2 justify-self-start">
        <div className="flex min-w-0 items-center gap-3">
          {onSidebarToggle ? (
            <IconTooltip label="Toggle sidebar">
              <button
                type="button"
                onClick={onSidebarToggle}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
                aria-label="Toggle sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
            </IconTooltip>
          ) : null}
          <span className="shrink-0 text-base font-semibold tracking-tight text-gray-900">
            Articulate
          </span>
          {onViewModeChange && (
            <div className="hidden items-center rounded-full bg-gray-100 p-0.5 text-xs font-medium text-gray-700 md:inline-flex">
              <button
                type="button"
                className={`rounded-full px-3 py-1 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => onViewModeChange('list')}
              >
                Task list
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => onViewModeChange('calendar')}
              >
                Calendar
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => onViewModeChange('kanban')}
              >
                Kanban
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Center: search */}
      <div className="min-w-0 w-full max-w-xl justify-self-center">
        <GlobalSearchBox
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          onSearchCommit={onSearchCommit}
          onClearSearch={onClearSearch}
          isSearchOpen={isSearchOpen}
          onSearchOpenChange={onSearchOpenChange}
          selectedTypeFilters={selectedTypeFilters}
          onToggleTypeFilter={onToggleTypeFilter}
          onPreviewResultSelect={onPreviewResultSelect}
          onShowAll={onShowAll}
          onFilterClick={onFilterClick}
          placeholder={placeholder}
        />
      </div>

      {/* Right: create (balances left chrome; account avatar lives in the sidebar). */}
      <div className="flex min-w-0 items-center justify-end justify-self-end gap-2">
        <div className="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => openCreateModal("task")}
            className="inline-flex items-center gap-1.5 px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
            aria-label="Add task"
          >
            Add task
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center border-l border-gray-200 px-2 text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                aria-label="Create other"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem onSelect={() => openCreateModal("task")}>
                <ListTodo className="mr-2 h-4 w-4" />
                Add task
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreateModal("project")}>
                <FolderKanban className="mr-2 h-4 w-4" />
                Project
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreateModal("user")}>
                <UserRound className="mr-2 h-4 w-4" />
                User
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openCreateModal("thread")}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Thread
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onNewAiThreadClick?.()}>
                <Bot className="mr-2 h-4 w-4" />
                AI chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isCreateModalOpen && isPortalMounted
        ? createPortal(
        <div
          className={cn(
            "fixed bottom-4 right-4 flex h-[min(86vh,760px)] w-[min(620px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg",
            CREATE_POPUP_Z_CLASS,
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-2">
            <span className="text-sm font-medium">{CREATE_MODAL_TITLES[createFlow.createType]}</span>
            <button
              type="button"
              onClick={handleCreateClose}
              className="rounded p-1.5 hover:bg-gray-100"
              aria-label="Close create popup"
            >
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </div>
          <HeaderCreateSurface
            flow={createFlow}
            onClose={handleCreateClose}
            onSuccess={handleCreateClose}
          />
        </div>,
        document.body
      )
        : null}
    </header>
    </TooltipProvider>
  );
}
