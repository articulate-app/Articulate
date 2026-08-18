"use client"

import {
  Copy,
  Edit2,
  Globe2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { PaneTabStrip, type PaneTabStripItem } from "../ui/pane-tab-strip"
import { WorkspaceNewTabMenu } from "../workspace/workspace-new-tab-menu"
import type { GlobalSearchDocument, GlobalSearchItemEntityType } from "../../lib/global-search-types"
import {
  AI_PANE_TAB_CHROME_CLASS,
  AI_PANE_TAB_ROW_CLASS,
} from "../../../features/ai-chat/tab-strip-tokens"
import { PANE_CHROME_ICON_BUTTON_CLASS, PANE_CHROME_ICON_CLASS } from "./pane-header-tokens"
import type { RightPaneTab } from "../../store/right-pane-tabs"
import { PaneOpenIcon } from "./pane-open-icon"
import {
  buildAiRightTabKey,
  useAiPaneChromeStore,
} from "../../../features/ai-chat/ai-pane-chrome-store"
import { HistoryDropdown } from "../../../features/ai-chat/HistoryDrawer"
import { AiPaneThreadLibraryMenus } from "../../../features/ai-chat/AiPaneThreadLibraryMenus"
import { toPersistedAiThreadId } from "../../../features/ai-chat/thread-id"

type RightPaneTabBarProps = {
  browserTabs: RightPaneTab[]
  /** Entity / research / create workspace tabs (pane-neutral views hosted on the right). */
  entityTabs?: RightPaneTab[]
  /** When false, AI chat tabs / History chrome are hidden (browser-only right pane). */
  includeAiTabs?: boolean
  activeKey: string | null
  onSelect: (key: string) => void
  onClose: (key: string) => void
  /** Expand / restore the right tool pane (focus mode). */
  isExpanded?: boolean
  onExpand?: () => void
  /** Close the right pane entirely. */
  onClosePane?: () => void
  /** Open/duplicate the active tab in the other workspace pane. */
  onOpenActiveInOtherPane?: () => void
  /** Drop a tab dragged from the other pane onto this strip. */
  onDropTabFromOtherPane?: (
    tabKey: string,
    fromPane: import("../../lib/workspace-view").WorkspacePaneId,
    meta?: { title?: string; beforeKey?: string | null },
  ) => void
  /** Reorder a tab within this pane. */
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
  onShowAll?: (value?: string) => void
  onAfterResultOpen?: (item: GlobalSearchDocument) => void
}

function browserTabLabel(tab: RightPaneTab): string {
  const page = tab.browser?.pageTitle?.trim()
  if (page) return page.length > 40 ? `${page.slice(0, 39)}…` : page
  const name = tab.browser?.destinationName?.trim()
  return name || tab.title || "Browser"
}

function BrowserTabFavicon({ url }: { url?: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="h-3 w-3 rounded-sm object-contain" width={12} height={12} />
    )
  }
  return <Globe2 className="h-3 w-3" aria-hidden />
}

const ENTITY_RIGHT_TAB_KINDS = new Set([
  "task",
  "suggestion",
  "project",
  "user",
  "team",
  "thread",
  "artifact",
  "source",
  "research",
  "create",
])

export function RightPaneTabBar({
  browserTabs,
  entityTabs = [],
  includeAiTabs = true,
  activeKey,
  onSelect,
  onClose,
  isExpanded: isExpandedProp,
  onExpand,
  onClosePane,
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
  onShowAll,
  onAfterResultOpen,
}: RightPaneTabBarProps) {
  const aiTabs = useAiPaneChromeStore((state) => state.tabs)
  const aiActiveId = useAiPaneChromeStore((state) => state.activeThreadId)
  const activeVisibility = useAiPaneChromeStore((state) => state.activeVisibility)
  const activeProjectId = useAiPaneChromeStore((state) => state.activeProjectId)
  const aiChromeExpanded = useAiPaneChromeStore((state) => state.isExpanded)
  const handlers = useAiPaneChromeStore((state) => state.handlers)
  const isExpanded = isExpandedProp ?? aiChromeExpanded
  const expandHandler = onExpand ?? handlers?.expand

  const items: PaneTabStripItem[] = [
    ...(includeAiTabs
      ? aiTabs.map((tab) => ({
          key: buildAiRightTabKey(tab.id),
          label: tab.title?.trim() || "New chat",
          kind: "ai",
        }))
      : []),
    // `entityTabs` is the store-ordered non-AI list (may include browsers).
    // `browserTabs` is only appended when the parent still splits them (legacy).
    ...entityTabs.map((tab) => ({
      key: tab.key,
      label:
        tab.kind === "browser" ? browserTabLabel(tab) : tab.title?.trim() || tab.kind,
      kind: tab.kind,
      icon:
        tab.kind === "browser" ? (
          <BrowserTabFavicon url={tab.browser?.faviconUrl} />
        ) : undefined,
    })),
    ...(entityTabs.some((tab) => tab.kind === "browser")
      ? []
      : browserTabs.map((tab) => ({
          key: tab.key,
          label: browserTabLabel(tab),
          kind: "browser",
          icon: <BrowserTabFavicon url={tab.browser?.faviconUrl} />,
        }))),
  ]

  const resolvedActiveKey =
    activeKey?.startsWith("browser:") ||
    activeKey?.startsWith("details:") ||
    (activeKey != null && ENTITY_RIGHT_TAB_KINDS.has(activeKey.split(":")[0] || ""))
      ? activeKey
      : aiActiveId
        ? buildAiRightTabKey(aiActiveId)
        : activeKey

  return (
    <div className={`${AI_PANE_TAB_ROW_CLASS} shrink-0`}>
      <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
        <PaneTabStrip
          tabs={items}
          activeKey={resolvedActiveKey}
          onSelect={(key) => {
            if (key.startsWith("ai:")) {
              handlers?.selectThread(key.slice(3))
            }
            onSelect(key)
          }}
          onClose={(key) => {
            const keys = Array.isArray(key) ? key : [key]
            for (const item of keys) {
              if (item.startsWith("ai:")) {
                handlers?.closeThread(item.slice(3))
              } else {
                onClose(item)
              }
            }
          }}
          paneId="right"
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
      </div>

      <div className={AI_PANE_TAB_CHROME_CLASS}>
        {includeAiTabs ? (
          <HistoryDropdown
            onSelectThread={(thread) => {
              handlers?.selectFromHistory(thread)
              onSelect(buildAiRightTabKey(thread.id))
            }}
            activeThreadId={aiActiveId}
          />
        ) : null}

        <WorkspaceNewTabMenu
          pane="right"
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={PANE_CHROME_ICON_BUTTON_CLASS}
              title="More options"
              aria-label="More options"
            >
              <MoreHorizontal className={PANE_CHROME_ICON_CLASS} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {onOpenActiveInOtherPane && resolvedActiveKey ? (
              <DropdownMenuItem onClick={onOpenActiveInOtherPane}>
                <PaneOpenIcon className="mr-2 h-4 w-4" />
                Open in other pane
              </DropdownMenuItem>
            ) : null}
            {onOpenActiveInOtherPane && includeAiTabs ? (
              <DropdownMenuSeparator />
            ) : null}
            {includeAiTabs ? (
              <>
                <DropdownMenuItem
                  disabled={!aiActiveId || !handlers}
                  onClick={() => handlers?.renameActive()}
                >
                  <Edit2 className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!aiActiveId || !handlers}
                  className="text-red-600"
                  onClick={() => handlers?.deleteActive()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <AiPaneThreadLibraryMenus threadId={toPersistedAiThreadId(aiActiveId)} />
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2" disabled={!aiActiveId || !handlers}>
                    <Users className="w-4 h-4" />
                    Share chat
                    {activeVisibility ? (
                      <span className="ml-auto text-[10px] capitalize text-muted-foreground">
                        {activeVisibility}
                      </span>
                    ) : null}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[180px]">
                    <DropdownMenuItem
                      onClick={() => handlers?.setVisibility("private")}
                      disabled={activeVisibility === "private"}
                    >
                      Private (only you)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handlers?.setVisibility("project")}
                      disabled={!activeProjectId || activeVisibility === "project"}
                    >
                      Project members
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handlers?.setVisibility("team")}
                      disabled={activeVisibility === "team"}
                    >
                      Team members
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!handlers} onClick={() => handlers?.closeAllAiTabs()}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Close all AI tabs
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!aiActiveId || !handlers}
                  onClick={() => handlers?.copyLink()}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy link
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {onClosePane ? (
          <button
            type="button"
            onClick={onClosePane}
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            title="Close"
            aria-label="Close right pane"
          >
            <X className={PANE_CHROME_ICON_CLASS} />
          </button>
        ) : null}
        {expandHandler ? (
          <button
            type="button"
            onClick={() => expandHandler()}
            className={PANE_CHROME_ICON_BUTTON_CLASS}
            title={isExpanded ? "Collapse" : "Expand"}
            aria-label={isExpanded ? "Restore right pane" : "Expand right pane"}
          >
            {isExpanded ? (
              <Minimize2 className={PANE_CHROME_ICON_CLASS} />
            ) : (
              <Maximize2 className={PANE_CHROME_ICON_CLASS} />
            )}
          </button>
        ) : null}
      </div>
    </div>
  )
}
