"use client"

import type { ReactNode } from "react"
import { ArtifactPane } from "../../../features/artifacts/ArtifactPane"
import { SourcePane } from "../../../features/sources/SourcePane"
import { ResearchPane } from "../ResearchPane"
import { CreateCenterPane } from "../tasks/create-center-pane"
import { GlobalSearchDetailsPane } from "../search/global-search-details-pane"
import { CenterPaneThreadChat } from "../comments-section/center-pane-thread-chat"
import { NewMessagePane } from "./new-message-pane"
import { TeamDetailsPage } from "../teams/TeamDetailsPage"
import { WorkspaceTaskView } from "./workspace-task-view"
import { WorkspaceTaskListView } from "./workspace-task-list-view"
import { WorkspaceObjectListView } from "./workspace-object-list-view"
import { WorkspaceTemplateListView } from "./workspace-template-list-view"
import { WorkspaceTemplateView } from "./workspace-template-view"
import { WorkspaceSearchResultsView } from "./workspace-search-results-view"
import { getOtherWorkspacePane, openWorkspaceView } from "../../lib/open-workspace-view"
import { WorkspaceHostPaneProvider } from "./workspace-host-pane-context"
import {
  CREATE_TYPE_PARAM,
  CREATE_CENTER_VIEW,
  RESEARCH_CENTER_VIEW,
  RESEARCH_TAB_PARAM,
  type CreateCenterType,
  type ResearchTab,
} from "../../lib/center-pane-selection-url"
import { LEFT_PANE_VIEW_PARAM } from "../../lib/workspace-pane-url"
import { shallowReplaceSearchParams } from "../../lib/tasks-shallow-nav"
import type { GlobalSearchDetailTarget } from "../../lib/global-search-types"
import type { WorkspacePaneId, WorkspaceTab } from "../../lib/workspace-view"
import { CREATE_MODAL_TITLES } from "../ui/use-header-create-flow"

export type WorkspaceViewRendererSlots = {
  /** Keep-alive / parent-owned AI mount (preferred when the shell already owns AiPane). */
  ai?: ReactNode
  /** Keep-alive / parent-owned browser mount. */
  browser?: ReactNode
  /** Parent-owned task mount (e.g. middle pane already hydrated from TasksLayout). */
  task?: ReactNode
  /** Parent-owned full tasks list (same surface as the left pane). */
  taskList?: ReactNode
  /** Fallback when tab is null / unknown. */
  empty?: ReactNode
}

export type WorkspaceViewRendererProps = {
  tab: WorkspaceTab | null
  paneId: WorkspacePaneId
  slots?: WorkspaceViewRendererSlots
  onCloseTab?: () => void
  onResolvedTitle?: (title: string) => void
}

function detailTargetFromTab(tab: WorkspaceTab): GlobalSearchDetailTarget | null {
  if (tab.type === "project") {
    return {
      entityType: "project",
      entityId: tab.id,
      projectId: tab.id,
      title: tab.title,
    }
  }
  if (tab.type === "user") {
    return {
      entityType: "user",
      entityId: tab.id,
      title: tab.title,
    }
  }
  if (tab.type === "team") {
    return {
      entityType: "team",
      entityId: tab.id,
      title: tab.title,
    }
  }
  if (tab.type === "thread") {
    return {
      entityType: "mention",
      entityId: tab.id,
      threadId: tab.id,
      mentionId: (tab.params?.mentionId as string | number | null | undefined) ?? null,
      title: tab.title,
    }
  }
  return null
}

/**
 * Shared view switch for middle and right workspace panes.
 * View behaviour depends on tab.type (+ context), not on pane position.
 */
export function WorkspaceViewRenderer({
  tab,
  paneId,
  slots,
  onCloseTab,
  onResolvedTitle,
}: WorkspaceViewRendererProps) {
  if (!tab) {
    return <>{slots?.empty ?? null}</>
  }

  switch (tab.type) {
    case "ai":
      return (
        <div className="h-full min-h-0 overflow-hidden">
          {slots?.ai ?? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              AI chat unavailable
            </div>
          )}
        </div>
      )

    case "browser":
      return (
        <div className="h-full min-h-0 overflow-hidden">
          {slots?.browser ?? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Browser unavailable
            </div>
          )}
        </div>
      )

    case "task":
    case "suggestion":
      if (slots?.task) {
        return <>{slots.task}</>
      }
      return (
        <WorkspaceTaskView
          taskId={tab.taskId ?? tab.id}
          mode={tab.type === "suggestion" ? "suggestion" : "task"}
          paneId={paneId}
          onClose={onCloseTab}
        />
      )

    case "task-list":
      if (slots?.taskList) {
        return <div className="h-full min-h-0 overflow-hidden">{slots.taskList}</div>
      }
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <WorkspaceTaskListView paneId={paneId} />
        </div>
      )

    case "project-list":
    case "mention-list":
    case "user-list":
    case "ai-thread-list":
    case "artifact-list":
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <WorkspaceObjectListView listType={tab.type} paneId={paneId} />
        </div>
      )

    case "template-list":
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <WorkspaceTemplateListView paneId={paneId} />
        </div>
      )

    case "artifact": {
      const artifactId = tab.artifactId || tab.id
      const version =
        typeof tab.params?.version === "number" ? tab.params.version : null
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <ArtifactPane
            artifactId={artifactId}
            version={version}
            onClose={onCloseTab}
          />
        </div>
      )
    }

    case "source": {
      const sourceId = tab.sourceId || tab.id
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <SourcePane sourceId={sourceId} onClose={onCloseTab} />
        </div>
      )
    }

    case "template": {
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <WorkspaceTemplateView
            workspaceId={tab.id}
            paneId={paneId}
            onClose={onCloseTab}
            onResolvedTitle={onResolvedTitle}
          />
        </div>
      )
    }

    case "research": {
      const researchTab =
        tab.params?.researchTab === "prompts" ? "prompts" : ("keywords" as ResearchTab)
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <ResearchPane
            isOpen
            variant="inline"
            initialTab={researchTab}
            onTabChange={(nextTab) => {
              const baseParams = new URLSearchParams(window.location.search)
              if (paneId === "middle") {
                baseParams.set(RESEARCH_TAB_PARAM, nextTab)
                baseParams.set("centerView", RESEARCH_CENTER_VIEW)
              } else if (paneId === "left") {
                baseParams.set(LEFT_PANE_VIEW_PARAM, "research")
                baseParams.set(RESEARCH_TAB_PARAM, nextTab)
              } else {
                baseParams.set("rightView", "research")
                baseParams.set(RESEARCH_TAB_PARAM, nextTab)
              }
              shallowReplaceSearchParams(
                window.location.pathname,
                baseParams,
                `workspace-research-tab:${paneId}`,
              )
            }}
            onClose={onCloseTab ?? (() => {})}
          />
        </div>
      )
    }

    case "create": {
      const createType = (tab.params?.createType as CreateCenterType | undefined) || "task"
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <CreateCenterPane
            createType={createType}
            onCreateTypeChange={(nextType) => {
              const baseParams = new URLSearchParams(window.location.search)
              if (paneId === "middle") {
                baseParams.set("centerView", CREATE_CENTER_VIEW)
                baseParams.set(CREATE_TYPE_PARAM, nextType)
              } else if (paneId === "left") {
                baseParams.set(LEFT_PANE_VIEW_PARAM, "create")
                baseParams.set(CREATE_TYPE_PARAM, nextType)
              } else {
                baseParams.set("rightView", "create")
                baseParams.set(CREATE_TYPE_PARAM, nextType)
              }
              shallowReplaceSearchParams(
                window.location.pathname,
                baseParams,
                `workspace-create-type:${paneId}`,
              )
            }}
            onClose={onCloseTab ?? (() => {})}
            onSuccess={onCloseTab ?? (() => {})}
            onAiPillSelect={() => {
              onCloseTab?.()
              openWorkspaceView(
                { type: "ai", params: { forceNewAiThread: true } },
                {
                  pane: paneId === "right" ? "middle" : "right",
                  source: `workspace-create-ai:${paneId}`,
                },
              )
            }}
          />
          {/* Title hint for create type — CreateCenterPane owns UI; titles map kept for callers. */}
          <span className="sr-only">{CREATE_MODAL_TITLES[createType]}</span>
        </div>
      )
    }

    case "search-results": {
      const searchQuery =
        typeof tab.params?.searchQuery === "string" ? tab.params.searchQuery : ""
      return (
        <div className="h-full min-h-0 overflow-hidden">
          <WorkspaceSearchResultsView query={searchQuery} paneId={paneId} />
        </div>
      )
    }

    case "thread": {
      if (tab.id === "new") {
        return (
          <NewMessagePane
            paneId={paneId}
            onClose={onCloseTab}
          />
        )
      }
      const threadId = Number(tab.id)
      const mentionRaw = tab.params?.mentionId
      const mentionId =
        mentionRaw == null || mentionRaw === "" ? null : Number(mentionRaw)
      if (!Number.isFinite(threadId) || threadId <= 0) {
        return (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Invalid thread
          </div>
        )
      }
      return (
        <CenterPaneThreadChat
          key={`${threadId}-${mentionId ?? ""}`}
          threadId={threadId}
          focusedMentionId={Number.isFinite(mentionId) ? mentionId : null}
          onThreadCreated={(nextThreadId) => {
            openWorkspaceView(
              { type: "thread", id: nextThreadId },
              { pane: paneId, source: `workspace-thread-created:${paneId}` },
            )
          }}
        />
      )
    }

    case "team": {
      const teamId = Number(tab.id)
      if (!Number.isFinite(teamId) || teamId <= 0) return null
      return (
        <div className="h-full overflow-auto">
          <TeamDetailsPage teamId={teamId} onResolvedTitle={onResolvedTitle} />
        </div>
      )
    }

    case "project":
    case "user": {
      const target = detailTargetFromTab(tab)
      if (!target) return null
      return (
        <div className="h-full overflow-auto">
          <WorkspaceHostPaneProvider pane={paneId}>
            <GlobalSearchDetailsPane
              target={target}
              paneId={paneId}
              onOpenTask={(taskId) => {
                // Default established UX: tasks open in middle. From a right-pane
                // project/user, open beside (middle) so the parent stays visible.
                openWorkspaceView(
                  { type: "task", taskId },
                  {
                    pane: paneId === "right" ? getOtherWorkspacePane(paneId) : "middle",
                    source: `workspace-open-task-from-${tab.type}`,
                  },
                )
              }}
              onOpenProject={(projectId) => {
                openWorkspaceView(
                  { type: "project", projectId },
                  { pane: paneId, source: `workspace-open-project-from-${tab.type}` },
                )
              }}
              onResolvedTitle={onResolvedTitle}
            />
          </WorkspaceHostPaneProvider>
        </div>
      )
    }

    case "details":
      return (
        <>
          {slots?.empty ?? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              No details open
            </div>
          )}
        </>
      )

    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-gray-500">
          Unknown workspace view
        </div>
      )
  }
}
