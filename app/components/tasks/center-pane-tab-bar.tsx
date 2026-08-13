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

type CenterPaneTabBarProps = {
  tabs: PaneTabStripItem[]
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: (key: string | string[]) => void
  onCloseAll: () => void
  /** Expand / restore the middle details pane (focus mode). */
  isExpanded?: boolean
  onExpand?: () => void
  /** Close the middle details pane entirely. */
  onClosePane?: () => void
  /** Re-open the collapsed right tool pane (AI / browser). */
  onOpenRightPane?: () => void
  /** Open/duplicate the active tab in the other workspace pane. */
  onOpenActiveInOtherPane?: () => void
  /** Drop a tab dragged from the other pane onto this strip. */
  onDropTabFromOtherPane?: (
    tabKey: string,
    fromPane: WorkspacePaneId,
    meta?: { title?: string; beforeKey?: string | null },
  ) => void
  pathname?: string
  /** Same callbacks as the header search preview — draft/filters sync. */
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSearchCommit?: (value?: string) => void
  onClearSearch?: () => void
  selectedTypeFilters?: GlobalSearchItemEntityType[]
  onToggleTypeFilter?: (type: GlobalSearchItemEntityType) => void
  /** Optional tracking after a `+` menu result opens in the middle pane. */
  onAfterResultOpen?: (item: GlobalSearchDocument) => void
  onShowAll?: (value?: string) => void
}

/** Desktop middle-pane tab chrome — same density as the AI pane tab header. */
export function CenterPaneTabBar({
  tabs,
  activeKey,
  onSelect,
  onClose,
  onCloseAll,
  isExpanded = false,
  onExpand,
  onClosePane,
  onOpenRightPane,
  onOpenActiveInOtherPane,
  onDropTabFromOtherPane,
  pathname,
  searchValue = "",
  onSearchChange,
  onSearchCommit,
  onClearSearch,
  selectedTypeFilters = [],
  onToggleTypeFilter,
  onAfterResultOpen,
  onShowAll,
}: CenterPaneTabBarProps) {
  const [selectedTabKeys, setSelectedTabKeys] = useState<string[]>([])
  const multiSelectedCount = selectedTabKeys.length > 1 ? selectedTabKeys.length : 0
  const showTabMenu = tabs.length > 0 || Boolean(onOpenActiveInOtherPane)

  return (
    <div className={`${AI_PANE_TAB_ROW_CLASS} shrink-0`}>
      <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
        {tabs.length > 0 || onDropTabFromOtherPane ? (
          <PaneTabStrip
            tabs={tabs}
            activeKey={activeKey}
            onSelect={onSelect}
            onClose={onClose}
            onSelectionChange={setSelectedTabKeys}
            paneId="middle"
            onDropTabFromOtherPane={
              onDropTabFromOtherPane
                ? (tabKey, fromPane, meta) => onDropTabFromOtherPane(tabKey, fromPane, meta)
                : undefined
            }
          />
        ) : (
          <div className="min-w-0 flex-1" aria-hidden />
        )}
      </div>
      <div className={AI_PANE_TAB_CHROME_CLASS}>
        <WorkspaceNewTabMenu
          pane="middle"
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
              {tabs.length > 1 ? (
                <DropdownMenuItem onClick={onCloseAll}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Close all tabs
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onClosePane ? (
          <button
            type="button"
            onClick={onClosePane}
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            title="Close"
            aria-label="Close details pane"
          >
            <X className={PANE_CHROME_ICON_CLASS} />
          </button>
        ) : null}
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            title={isExpanded ? "Collapse" : "Expand"}
            aria-label={isExpanded ? "Restore details pane" : "Expand details pane"}
          >
            {isExpanded ? (
              <Minimize2 className={PANE_CHROME_ICON_CLASS} />
            ) : (
              <Maximize2 className={PANE_CHROME_ICON_CLASS} />
            )}
          </button>
        ) : null}
        {onOpenRightPane ? (
          <button
            type="button"
            onClick={onOpenRightPane}
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            title="Open right pane"
            aria-label="Open right pane"
          >
            <PaneOpenIcon className={PANE_CHROME_ICON_CLASS} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
