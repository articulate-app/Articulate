"use client"

import { useState } from "react"
import {
  Maximize2,
  Minimize2,
  MoreHorizontal,
  X,
  XCircle,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { PaneTabStrip, type PaneTabStripItem } from "../ui/pane-tab-strip"
import { WorkspaceNewTabMenu } from "../workspace/workspace-new-tab-menu"
import type { GlobalSearchDocument, GlobalSearchItemEntityType } from "../../lib/global-search-types"
import {
  AI_PANE_TAB_CHROME_CLASS,
  AI_PANE_TAB_ROW_CLASS,
} from "../../../features/ai-chat/tab-strip-tokens"
import {
  PANE_CHROME_ICON_BUTTON_CLASS,
  PANE_CHROME_ICON_CLASS,
} from "./pane-header-tokens"
import { PaneOpenIcon } from "./pane-open-icon"
import type { WorkspacePaneId } from "../../lib/workspace-view"

type LeftPaneTabBarProps = {
  tabs: PaneTabStripItem[]
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: (key: string | string[]) => void
  onCloseAll: () => void
  isExpanded?: boolean
  onExpand?: () => void
  onClosePane?: () => void
  onOpenMiddlePane?: () => void
  onOpenActiveInOtherPane?: () => void
  onDropTabFromOtherPane?: (
    tabKey: string,
    fromPane: WorkspacePaneId,
    meta?: { title?: string; beforeKey?: string | null },
  ) => void
  onReorderTab?: (
    tabKey: string,
    meta?: { title?: string; beforeKey?: string | null },
  ) => void
  pathname?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSearchCommit?: (value?: string) => void
  onClearSearch?: () => void
  selectedTypeFilters?: GlobalSearchItemEntityType[]
  onToggleTypeFilter?: (type: GlobalSearchItemEntityType) => void
  onAfterResultOpen?: (item: GlobalSearchDocument) => void
  onShowAll?: (value?: string) => void
}

/** Desktop left-pane tab chrome — same density as middle / right. */
export function LeftPaneTabBar({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onCloseAll,
  isExpanded = false,
  onExpand,
  onClosePane,
  onOpenMiddlePane,
  onOpenActiveInOtherPane,
  onDropTabFromOtherPane,
  onReorderTab,
  pathname,
  searchValue = "",
  onSearchChange,
  onSearchCommit,
  onClearSearch,
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onAfterResultOpen,
  onShowAll,
}: LeftPaneTabBarProps) {
  const [selectedTabKeys, setSelectedTabKeys] = useState<string[]>([])
  const multiSelectedCount = selectedTabKeys.length > 1 ? selectedTabKeys.length : 0
  const showTabMenu = tabs.length > 0 || Boolean(onOpenActiveInOtherPane)

  return (
    <div className={`${AI_PANE_TAB_ROW_CLASS} shrink-0`}>
      <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
        {tabs.length > 0 || onDropTabFromOtherPane || onReorderTab ? (
          <PaneTabStrip
            tabs={tabs}
            activeKey={activeKey}
            onSelect={onSelect}
            onClose={onClose}
            onSelectionChange={setSelectedTabKeys}
            paneId="left"
            onDropTabFromOtherPane={
              onDropTabFromOtherPane
                ? (tabKey, fromPane, meta) => onDropTabFromOtherPane(tabKey, fromPane, meta)
                : undefined
            }
            onReorderTab={
              onReorderTab
                ? (tabKey, meta) => onReorderTab(tabKey, meta)
                : undefined
            }
          />
        ) : (
          <div className="min-w-0 flex-1" aria-hidden />
        )}
      </div>
      <div className={AI_PANE_TAB_CHROME_CLASS}>
        <WorkspaceNewTabMenu
          pane="left"
          pathname={pathname}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          onSearchCommit={onSearchCommit}
          onClearSearch={onClearSearch}
          selectedTypeFilters={selectedTypeFilters}
          onToggleTypeFilter={onToggleTypeFilter}
          onShowAll={onShowAll}
          onAfterResultOpen={onAfterResultOpen}
        />
        {showTabMenu ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={PANE_CHROME_ICON_BUTTON_CLASS}
                title="More options"
                aria-label="Tab options"
              >
                <MoreHorizontal className={PANE_CHROME_ICON_CLASS} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onOpenActiveInOtherPane && activeKey ? (
                <DropdownMenuItem onClick={onOpenActiveInOtherPane}>
                  <PaneOpenIcon className="mr-2 h-4 w-4" />
                  Open in other pane
                </DropdownMenuItem>
              ) : null}
              {multiSelectedCount > 1 ? (
                <DropdownMenuItem onClick={() => onClose(selectedTabKeys)}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Close {multiSelectedCount} tabs
                </DropdownMenuItem>
              ) : null}
              {tabs.length > 0 ? (
                <DropdownMenuItem onClick={onCloseAll}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Close all tabs
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onExpand ? (
          <button
            type="button"
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            title={isExpanded ? "Restore layout" : "Expand"}
            aria-label={isExpanded ? "Restore layout" : "Expand left pane"}
            onClick={onExpand}
          >
            {isExpanded ? (
              <Minimize2 className={PANE_CHROME_ICON_CLASS} />
            ) : (
              <Maximize2 className={PANE_CHROME_ICON_CLASS} />
            )}
          </button>
        ) : null}
        {onClosePane ? (
          <button
            type="button"
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            title="Close pane"
            aria-label="Close left pane"
            onClick={onClosePane}
          >
            <X className={PANE_CHROME_ICON_CLASS} />
          </button>
        ) : null}
        {onOpenMiddlePane ? (
          <button
            type="button"
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            title="Open middle pane"
            aria-label="Open middle pane"
            onClick={onOpenMiddlePane}
          >
            <PaneOpenIcon className={PANE_CHROME_ICON_CLASS} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
