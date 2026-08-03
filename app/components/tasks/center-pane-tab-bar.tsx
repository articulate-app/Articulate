"use client"

import { useState } from "react"
import { MoreHorizontal, Plus, XCircle } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { PaneTabStrip, type PaneTabStripItem } from "../ui/pane-tab-strip"
import { GlobalSearchPreviewPanel } from "../search/global-search-preview-panel"
import type { GlobalSearchDocument, GlobalSearchItemEntityType } from "../../lib/global-search-types"
import { COMPACT_PANE_HEADER_ROW_CLASS } from "./pane-header-tokens"

type CenterPaneTabBarProps = {
  tabs: PaneTabStripItem[]
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: (key: string | string[]) => void
  onCloseAll: () => void
  /** Same callbacks as the header search preview — opens items as middle-pane tabs. */
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSearchCommit?: (value?: string) => void
  onClearSearch?: () => void
  selectedTypeFilters?: GlobalSearchItemEntityType[]
  onToggleTypeFilter?: (type: GlobalSearchItemEntityType) => void
  onPreviewResultSelect?: (item: GlobalSearchDocument) => void
  onShowAll?: (value?: string) => void
}

/** Desktop middle-pane tab chrome — same density as the AI pane tab header. */
export function CenterPaneTabBar({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onCloseAll,
  searchValue = "",
  onSearchChange,
  onSearchCommit,
  onClearSearch,
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onPreviewResultSelect,
  onShowAll,
}: CenterPaneTabBarProps) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedTabKeys, setSelectedTabKeys] = useState<string[]>([])
  const multiSelectedCount = selectedTabKeys.length > 1 ? selectedTabKeys.length : 0

  return (
    <div
      className={`${COMPACT_PANE_HEADER_ROW_CLASS} !items-stretch shrink-0 border-b border-gray-200 bg-white pl-0 pr-2`}
    >
      <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
        {tabs.length > 0 ? (
          <PaneTabStrip
            tabs={tabs}
            activeKey={activeKey}
            onSelect={onSelect}
            onClose={onClose}
            onSelectionChange={setSelectedTabKeys}
          />
        ) : (
          <div className="min-w-0 flex-1" aria-hidden />
        )}
      </div>
      <div className="flex items-center gap-0.5 self-stretch">
        <Popover open={isAddOpen} onOpenChange={setIsAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              title="Open tab"
              aria-label="Open tab"
              aria-expanded={isAddOpen}
            >
              <Plus className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-[min(28rem,calc(100vw-2rem))] border-0 bg-transparent p-0 shadow-none"
            onOpenAutoFocus={(event) => {
              // Let the panel input autofocus itself.
              event.preventDefault()
            }}
          >
            <GlobalSearchPreviewPanel
              enabled={isAddOpen}
              showInput
              autoFocusInput
              searchValue={searchValue}
              onSearchChange={onSearchChange}
              onSearchCommit={onSearchCommit}
              onClearSearch={onClearSearch}
              selectedTypeFilters={selectedTypeFilters}
              onToggleTypeFilter={onToggleTypeFilter}
              onPreviewResultSelect={onPreviewResultSelect}
              onShowAll={onShowAll}
              onRequestClose={() => setIsAddOpen(false)}
              className="shadow-xl"
            />
          </PopoverContent>
        </Popover>
        {tabs.length > 1 ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                title="More options"
                aria-label="Tab options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {multiSelectedCount > 0 ? (
                <DropdownMenuItem
                  onClick={() => {
                    onClose(selectedTabKeys)
                    setSelectedTabKeys([])
                  }}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Close {multiSelectedCount} selected tabs
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onCloseAll}>
                <XCircle className="mr-2 h-4 w-4" />
                Close all tabs
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  )
}
