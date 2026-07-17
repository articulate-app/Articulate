"use client"

import React from 'react';
import { createPortal } from 'react-dom';
import { cn } from "@/lib/utils";
import { X, Plus, Bot, Lightbulb, Settings, LogOut, Menu } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCurrentUserStore } from '../../store/current-user';
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
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav";
import { buildNewAiThreadParams } from "../../lib/ai-thread-route";
import { UserAvatar } from "../UserAvatar";
import { getImageUrl } from "../../lib/public-media";
import { HeaderCreateSurface } from "./header-create-surface";
import {
  CREATE_MODAL_TITLES,
  CREATE_POPUP_Z_CLASS,
  useHeaderCreateFlow,
} from "./use-header-create-flow";

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
  onKeywordPlannerClick,
  isKeywordPlannerActive = false,
  placeholder,
  onAiChatClick,
  onNewAiThreadClick,
  viewMode,
  onViewModeChange,
  isSearchOpen = false,
  onSearchOpenChange,
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onPreviewResultSelect,
  onShowMore,
  onShowAll,
  onClearSearch,
}: TaskHeaderBarProps) {
  const fullName = useCurrentUserStore((s) => s.fullName)
  const userMetadata = useCurrentUserStore((s) => s.userMetadata)
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false)
  const [isPortalMounted, setIsPortalMounted] = React.useState(false)
  const createFlow = useHeaderCreateFlow({ enabled: isCreateModalOpen })

  React.useEffect(() => {
    setIsPortalMounted(true)
  }, [])

  const accountDisplayName = React.useMemo(
    () => fullName || userMetadata?.full_name || userMetadata?.email || "User",
    [fullName, userMetadata],
  )
  const accountAvatarUrl = React.useMemo(
    () => getImageUrl(userMetadata?.photo || userMetadata?.avatar_url || null),
    [userMetadata],
  )

  const handleAccountSignOut = React.useCallback(async () => {
    await supabase.auth.signOut()
    router.push("/auth")
  }, [router, supabase])

  const openCreateModal = React.useCallback(() => {
    createFlow.openCreateForm("task")
    setIsCreateModalOpen(true)
  }, [createFlow.openCreateForm])

  const handleAiPillSelect = React.useCallback(() => {
    if (!pathname && onNewAiThreadClick) {
      onNewAiThreadClick()
      return
    }
    const next = buildNewAiThreadParams(new URLSearchParams(searchParams.toString()))
    shallowReplaceSearchParams(pathname || "/tasks", next)
  }, [onNewAiThreadClick, pathname, searchParams])

  const closeCreateModal = React.useCallback(() => {
    setIsCreateModalOpen(false)
  }, [])

  const handleCreateClose = React.useCallback(() => {
    closeCreateModal()
    createFlow.resetCreateState()
  }, [closeCreateModal, createFlow.resetCreateState])

  return (
    <TooltipProvider delayDuration={120}>
    <header className="sticky top-0 z-30 grid h-16 w-full grid-cols-[1fr_minmax(0,36rem)_1fr] items-center gap-x-3 border-b bg-white px-4 shadow-sm">
      {/* Left: nav + brand (equal 1fr column keeps search visually centered in header) */}
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
          {/* Create opens Add Task by default; object pills inside the popup switch create type. */}
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
            aria-label="Create"
          >
            <Plus className="h-4 w-4" />
            <span>Create</span>
          </button>
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

      {/* Center: search in middle column of grid */}
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

      {/* Right: actions (second 1fr column, end-aligned) */}
      <div className="flex min-w-0 items-center justify-end justify-self-end gap-2">
        {onAiChatClick ? (
          <IconTooltip label="AI pane">
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
              aria-label="AI pane"
              onClick={() => onAiChatClick()}
            >
              <Bot className="h-5 w-5" />
            </button>
          </IconTooltip>
        ) : null}
        {onKeywordPlannerClick ? (
          <IconTooltip label="Keyword research">
            <button
              type="button"
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 ${
                isKeywordPlannerActive
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
              aria-label="Keyword research"
              onClick={() => onKeywordPlannerClick()}
            >
              <Lightbulb className="h-5 w-5" />
            </button>
          </IconTooltip>
        ) : null}
        <DropdownMenu>
          <IconTooltip label="Account">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1"
                aria-label="Account menu"
              >
                <UserAvatar name={accountDisplayName} photoUrl={accountAvatarUrl} size="sm" />
              </button>
            </DropdownMenuTrigger>
          </IconTooltip>
          <DropdownMenuContent align="end" className="min-w-[190px]">
            <DropdownMenuItem
              onSelect={() => {
                const next = new URLSearchParams(searchParams.toString())
                next.set("settings", "open")
                router.push(`/?${next.toString()}`)
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              Preferences
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void handleAccountSignOut()
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
              onAiPillSelect={handleAiPillSelect}
            />
          </div>,
          document.body
        )
          : null}
      </div>
    </header>
    </TooltipProvider>
  );
} 