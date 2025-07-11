"use client"

import { ReactNode, useState, cloneElement, useEffect, useCallback } from "react"
import { Sidebar } from "./Sidebar"
import { TaskDetails, normalizeTask } from "./TaskDetails"
import { Menu, X, ChevronLeft, ChevronRight, Calendar, PanelLeft, PanelRight, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Task } from '../../lib/types/tasks'
import React from "react"
import { CalendarView } from '../../components/calendar-view/calendar-view'
import { TaskHeaderBar } from '../../components/ui/task-header-bar'
import { ResizablePanel } from "../ui/resizable-panel"
import { SlidePanel } from "../ui/slide-panel"
import { AddTaskForm } from './AddTaskForm'
import { useRouter } from 'next/navigation'
import { useTasksUI, ViewMode } from '../../store/tasks-ui'
import { useSearchParams, usePathname } from 'next/navigation'
import { TaskList } from './TaskList'
import { getTaskById } from '../../../lib/services/tasks';
import { useQuery } from '@tanstack/react-query';
import { GroupingDropdown } from './grouping-dropdown';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

interface TasksLayoutProps {
  children: ReactNode
  selectedTask?: Task | null
  isDetailsCollapsed?: boolean
  onCloseDetails?: () => void
  viewMode: 'list' | 'calendar' | 'kanban'
  setViewMode: (view: 'list' | 'calendar' | 'kanban') => void
  searchValue: string
  setSearchValue: (value: string) => void
  onFilterClick: () => void
  onAddTaskClick: () => void
  onSidebarToggle?: () => void
  onTaskUpdate?: (updatedFields: Partial<Task>) => void
  onAddSubtask?: (parentTaskId: number, projectId: number) => void
  onSubtaskFormCancel?: () => void
  onSubtaskFormSuccess?: () => void
  isAddTaskOpen: boolean
  setIsAddTaskOpen: (open: boolean) => void
  isAddSubtaskPaneOpen: boolean
  setIsAddSubtaskPaneOpen: (open: boolean) => void
  addSubtaskContext: { parentTaskId: number, projectId: number } | null
  handleAddTaskSuccess: (task: Task) => void
}

export function TasksLayout({ 
  children, 
  isDetailsCollapsed = true,
  onCloseDetails = () => {},
  viewMode: _viewMode,
  setViewMode: _setViewMode,
  searchValue: _searchValue,
  setSearchValue: _setSearchValue,
  onFilterClick,
  onAddTaskClick,
  onSidebarToggle,
  onTaskUpdate,
  onAddSubtask,
  onSubtaskFormCancel,
  onSubtaskFormSuccess,
  isAddTaskOpen: _isAddTaskOpen,
  setIsAddTaskOpen: _setIsAddTaskOpen,
  isAddSubtaskPaneOpen,
  setIsAddSubtaskPaneOpen,
  addSubtaskContext,
  handleAddTaskSuccess,
  isSidebarOpen = false,
  isSidebarCollapsed = true,
  onSidebarToggle: _onSidebarToggle,
}: Omit<TasksLayoutProps, 'selectedTask'> & { isSidebarOpen?: boolean, isSidebarCollapsed?: boolean, onSidebarToggle?: () => void }) {
  // --- Global UI state ---
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const {
    viewMode,
    setViewMode,
    searchValue,
    setSearchValue,
    syncFromUrl,
    selectedTaskId,
    setSelectedTaskId,
  } = useTasksUI();

  // Local state fallback for Add Task modal
  const [localIsAddTaskOpen, localSetIsAddTaskOpen] = useState(false);
  const isAddTaskOpen = typeof _isAddTaskOpen === 'boolean' ? _isAddTaskOpen : localIsAddTaskOpen;
  const setIsAddTaskOpen = _setIsAddTaskOpen || localSetIsAddTaskOpen;

  // Sync Zustand state from URL on mount and when params change
  React.useEffect(() => {
    syncFromUrl(params as any);
  }, [params.toString()]);

  // When selectedTaskId changes, update URL
  React.useEffect(() => {
    if (selectedTaskId) {
      const paramsStr = params.toString();
      const url = paramsStr ? `/tasks/${selectedTaskId}?${paramsStr}` : `/tasks/${selectedTaskId}`;
      window.history.pushState({}, '', url);
    } else {
      // Remove task id from URL
      const url = `${pathname}${params.toString() ? '?' + params.toString() : ''}`;
      window.history.pushState({}, '', url);
    }
  }, [selectedTaskId]);

  // When viewMode changes, update URL
  React.useEffect(() => {
    const urlView = params.get('view');
    if (viewMode !== urlView) {
      const newParams = new URLSearchParams(params.toString());
      if (viewMode) newParams.set('view', viewMode);
      else newParams.delete('view');
      router.replace(`${pathname}?${newParams.toString()}`);
    }
  }, [viewMode]);

  // When searchValue changes, update URL
  React.useEffect(() => {
    const urlQ = params.get('q') || '';
    if (searchValue !== urlQ) {
      const newParams = new URLSearchParams(params.toString());
      if (searchValue) newParams.set('q', searchValue);
      else newParams.delete('q');
      router.replace(`${pathname}?${newParams.toString()}`);
    }
  }, [searchValue]);

  // --- Fetch selected task if selectedTaskId is present ---
  const { data: selectedTask, isLoading: isTaskLoading } = useQuery({
    queryKey: ['task', selectedTaskId],
    queryFn: async () => {
      if (!selectedTaskId) return null;
      return getTaskById({ signal: null as any, id: String(selectedTaskId) });
    },
    enabled: !!selectedTaskId,
    staleTime: 0,
  });

  // Compute visibleMonth for calendar when a task is selected
  let visibleMonth: Date | null = null;
  if (selectedTask) {
    const dateStr = selectedTask.delivery_date || selectedTask.publication_date;
    if (dateStr) {
      const date = new Date(dateStr);
      visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    }
  }

  // Handler for selecting a task from list or calendar/kanban
  const handleTaskSelect = (task: any) => {
    if (!task || !task.id) return;
    if (expandedPane === 'left' || expandedPane === 'middle') {
      if (expandedPane === 'left') {
        setIsCenterCollapsed(true);
        setShouldShowCenterPane(false);
      }
      if (expandedPane === 'middle') setIsLeftCollapsed(true);
      setExpandedPane(null);
      // Delay selecting the task until after layout restores, to avoid race condition
      setTimeout(() => {
        setSelectedTaskId(typeof task.id === 'string' ? task.id : String(task.id));
      }, 0);
    } else {
      setSelectedTaskId(typeof task.id === 'string' ? task.id : String(task.id));
    }
  };

  // Handler for closing details pane
  const handleCloseDetails = () => {
    setSelectedTaskId(null);
    if (onCloseDetails) onCloseDetails();
  };

  // Collapsed state for each panel
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isCenterCollapsed, setIsCenterCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  // Control whether the center pane is rendered at all
  const [shouldShowCenterPane, setShouldShowCenterPane] = useState(true);

  // Expanded pane state: 'left', 'middle', or 'right', or null
  const [expandedPane, setExpandedPane] = useState<'left' | 'middle' | 'right' | null>(null);

  // Helper: pill button style
  const pillButton =
    'inline-flex items-center gap-1 px-4 py-1 rounded-full border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition';
  // Helper: collapse button style
  const collapseButton =
    'inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400';
  // Helper: expand/restore button style
  const expandButton =
    'inline-flex items-center justify-center w-7 h-7 text-gray-500 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-blue-400 ml-auto';

  // Panel size logic
  // The right pane always keeps its default width (defaultSize: 25, minSize: 18, maxSize: 40)
  // Only left and middle compete for the remaining space
  // When expanded, set the other to 0, but do not hide the panel or the resize handle
  const leftPanelProps = expandedPane === 'left'
    ? { defaultSize: 75, minSize: 60, maxSize: 82, collapsed: false }
    : expandedPane === 'middle'
      ? { defaultSize: 0, minSize: 0, maxSize: 0, collapsed: false }
      : { defaultSize: 22, minSize: 15, maxSize: 40, collapsed: isLeftCollapsed };
  const centerPanelProps = expandedPane === 'middle'
    ? { defaultSize: 75, minSize: 60, maxSize: 82, collapsed: false }
    : expandedPane === 'left'
      ? { defaultSize: 0, minSize: 0, maxSize: 0, collapsed: false }
      : { defaultSize: 33, minSize: 20, maxSize: 60, collapsed: isCenterCollapsed };

  // CSS class helpers for pane states
  function getPaneClass(pane: 'left' | 'middle' | 'right') {
    if (expandedPane === pane) return 'pane-fullscreen';
    if (expandedPane && expandedPane !== pane) return 'pane-collapsed';
    return '';
  }

  return (
    <div className="flex h-full w-full max-w-full overflow-x-hidden bg-white">
      {/* Sidebar (mobile/desktop) */}
      <div style={{ width: isSidebarCollapsed ? 0 : undefined, transition: 'width 0.2s', overflow: 'hidden' }}>
        <Sidebar isCollapsed={isSidebarCollapsed} isMobileMenuOpen={isSidebarOpen} onClose={_onSidebarToggle} />
      </div>
      {/* Always render all three panels, use CSS for fullscreen/collapse */}
      <PanelGroup direction="horizontal" className="flex-1 h-full" autoSaveId="tasks-layout">
        {/* Left Pane: Task List */}
        <Panel
          id="left-pane"
          order={1}
          {...leftPanelProps}
          className={cn(
            'border-r border-gray-200 bg-white flex flex-col transition-all duration-200',
            isLeftCollapsed && expandedPane !== 'left' ? 'w-9 min-w-[36px] max-w-[36px] p-0 items-center justify-start' : '',
            getPaneClass('left')
          )}
        >
          {isLeftCollapsed && expandedPane !== 'left' ? (
            <div className="flex flex-col items-center justify-start h-full pt-2 gap-2">
              <button
                className={collapseButton}
                aria-label="Expand task list"
                onClick={() => setIsLeftCollapsed(false)}
                type="button"
              >
                <PanelRight className="w-5 h-5" />
              </button>
              <button
                className={collapseButton + ' mt-2 bg-blue-600 text-white border-blue-600 hover:bg-blue-700'}
                aria-label="Add Task"
                onClick={() => setIsAddTaskOpen(true)}
                type="button"
              >
                +
              </button>
            </div>
          ) : (
            <div className="px-4 pt-4 pb-2 flex gap-2 items-center relative">
              <button
                className={collapseButton}
                aria-label="Collapse task list"
                onClick={() => setIsLeftCollapsed(true)}
                type="button"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
              <div className="inline-block">
                <GroupingDropdown />
              </div>
              <button
                className={pillButton + ' ml-2'}
                onClick={() => setIsAddTaskOpen(true)}
                type="button"
              >
                + Add Task
              </button>
              {/* Expand/Restore button for left pane */}
              {expandedPane !== 'middle' && (
                <button
                  className={expandButton}
                  aria-label={expandedPane === 'left' ? 'Restore layout' : 'Expand left pane'}
                  title={expandedPane === 'left' ? 'Restore layout' : 'Expand left pane'}
                  onClick={() => setExpandedPane(expandedPane === 'left' ? null : 'left')}
                  type="button"
                >
                  {expandedPane === 'left' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
              )}
            </div>
          )}
          <div className="flex-1">
            <TaskList 
              onTaskSelect={handleTaskSelect}
              selectedTaskId={selectedTaskId !== undefined && selectedTaskId !== null ? String(selectedTaskId) : undefined}
            />
          </div>
          {isAddTaskOpen && (
            <SlidePanel isOpen={isAddTaskOpen} onClose={() => setIsAddTaskOpen(false)} position="right" className="w-[400px]">
              <AddTaskForm onSuccess={() => setIsAddTaskOpen(false)} onClose={() => setIsAddTaskOpen(false)} />
            </SlidePanel>
          )}
        </Panel>
        <PanelResizeHandle className={cn(
          'w-2 bg-gray-100 hover:bg-blue-200 transition cursor-col-resize',
        )} />
        {/* Center Pane: Calendar/Kanban */}
        <Panel
          id="center-pane"
          order={2}
          {...centerPanelProps}
          className={cn(
            'border-r border-gray-200 bg-white flex flex-col min-w-0 transition-all duration-200',
            getPaneClass('middle')
          )}
        >
          <div className="flex-1 overflow-y-auto">
            {viewMode === 'calendar' && (
              <CalendarView
                onTaskClick={handleTaskSelect}
                selectedTaskId={selectedTaskId != null ? String(selectedTaskId) : undefined}
                searchValue={searchValue}
                expandButton={
                  expandedPane !== 'left' && (
                    <button
                      className={expandButton}
                      aria-label={expandedPane === 'middle' ? 'Restore layout' : 'Expand center pane'}
                      title={expandedPane === 'middle' ? 'Restore layout' : 'Expand center pane'}
                      onClick={() => {
                        setShouldShowCenterPane(true);
                        setExpandedPane(expandedPane === 'middle' ? null : 'middle');
                      }}
                      type="button"
                    >
                      {expandedPane === 'middle' ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                    </button>
                  )
                }
              />
            )}
            {viewMode === 'kanban' && (
              <div className="flex items-center justify-center h-full text-gray-400">Kanban view coming soon...</div>
            )}
          </div>
        </Panel>
        <PanelResizeHandle className={cn(
          'w-2 bg-gray-100 hover:bg-blue-200 transition cursor-col-resize',
        )} />
        {/* Right Pane: Task Details */}
        <Panel
          id="right-pane"
          order={3}
          minSize={18}
          maxSize={40}
          defaultSize={25}
          collapsible
          collapsedSize={36}
          onCollapse={() => setIsRightCollapsed(true)}
          onExpand={() => setIsRightCollapsed(false)}
          className={cn(
            'bg-white flex-shrink-0 border-l border-gray-200 h-full transition-all duration-200',
            isRightCollapsed ? 'w-9 min-w-[36px] max-w-[36px] p-0 items-center justify-start' : '',
            getPaneClass('right')
          )}
        >
          {selectedTask && (
            <TaskDetails
              isCollapsed={false}
              selectedTask={normalizeTask(selectedTask)}
              onClose={handleCloseDetails}
              onCollapse={() => setIsRightCollapsed(true)}
              isExpanded={expandedPane === 'right'}
              onExpand={() => setExpandedPane('right')}
              onRestore={() => setExpandedPane(null)}
              onTaskUpdate={updatedFields => {
                let normalized = { ...updatedFields };
                ['project_id_int', 'parent_task_id_int'].forEach(key => {
                  if (key in normalized) {
                    let val = (normalized as any)[key];
                    if (val === null || val === undefined) {
                      delete (normalized as any)[key];
                    } else if (typeof val === 'string') {
                      const parsed = parseInt(val, 10);
                      if (isNaN(parsed)) {
                        delete (normalized as any)[key];
                      } else {
                        (normalized as any)[key] = parsed;
                      }
                    } else if (typeof val !== 'number') {
                      delete (normalized as any)[key];
                    }
                  }
                });
                if (onTaskUpdate) onTaskUpdate(normalized as any);
              }}
              onAddSubtask={onAddSubtask}
            />
          )}
        </Panel>
      </PanelGroup>
    </div>
  );
} 