import React, { useState, useCallback, useEffect } from 'react';
import { InfiniteList } from '../ui/infinite-list';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface ParentTaskSelectProps {
  currentParentId: string | null;
  onChange: (parentId: string | null, selectedTask?: any) => void;
  disabledIds?: string[]; // ids to exclude (e.g., self, subtasks)
  projectId: string | number;
  parentTaskData?: { id: number; title: string; content_type_id: number } | null; // New prop for parent task data
}

export function ParentTaskSelect({ currentParentId, onChange, disabledIds = [], projectId, parentTaskData }: ParentTaskSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [currentParentTitle, setCurrentParentTitle] = useState<string | null>(null);
  const [currentParentType, setCurrentParentType] = useState<number | null>(null); // content_type_id

  // Debug log for parent task data
  console.log('ParentTaskSelect: parentTaskData', parentTaskData, 'currentParentId', currentParentId);

  // Use parent task data from props if available, otherwise fetch from API
  useEffect(() => {
    if (!currentParentId) {
      setCurrentParentTitle(null);
      setCurrentParentType(null);
      return;
    }

    // If we have parent task data from props, use it
    if (parentTaskData && String(parentTaskData.id) === String(currentParentId)) {
      setCurrentParentTitle(parentTaskData.title);
      setCurrentParentType(parentTaskData.content_type_id);
      return;
    }

    // Fallback: fetch from API if parent task data is not provided
    let isMounted = true;
    const supabase = createClientComponentClient();
    supabase
      .from('tasks')
      .select('title, content_type_id')
      .eq('id', currentParentId)
      .single()
      .then(({ data, error }) => {
        if (isMounted) {
          setCurrentParentTitle(data?.title || null);
          setCurrentParentType(data?.content_type_id ?? null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [currentParentId, parentTaskData]);

  // Only fetch when open
  const trailingQuery = useCallback((query: any) => {
    query = query.is('parent_task_id_int', null);
    query = query.eq('project_id_int', projectId);
    if (search && search.trim() !== '') {
      query = query.ilike('title', `%${search}%`);
    }
    if (disabledIds.length > 0) {
      query = query.not('id', 'in', `(${disabledIds.join(',')})`);
    }
    query = query.order('title', { ascending: true });
    return query;
  }, [search, disabledIds, projectId]);

  // Key InfiniteList by search value to reset pagination on search
  const infiniteListKey = `parent-task-select-${projectId}-${search}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="w-full px-3 py-2 rounded-md cursor-pointer hover:bg-gray-50 truncate text-left"
          tabIndex={0}
          aria-label="Select parent task"
          title={currentParentId && currentParentTitle ? currentParentTitle : 'Set Parent Task'}
        >
          {currentParentId && currentParentTitle
            ? (
                <span className={currentParentType === 39 ? 'font-bold' : ''}>
                  {currentParentTitle}
                </span>
              )
            : <span className="text-gray-400">Click to set parent task</span>}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2">
        <input
          type="text"
          className="w-full border rounded px-2 py-1 text-xs mb-2"
          placeholder="Search parent tasks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        <div className="h-60 overflow-y-auto">
          {open && (
            <InfiniteList<'tasks', any>
              queryKey={infiniteListKey}
              tableName="tasks"
              columns="id,title,content_type_id"
              pageSize={20}
              trailingQuery={trailingQuery}
              renderNoResults={() => <div className="text-xs text-muted-foreground px-2 py-1">No parent tasks found</div>}
              renderSkeleton={count => <div className="text-xs text-muted-foreground px-2 py-1">Loading...</div>}
            >
              {(data) => (
                <ul>
                  {data.map((task: any) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className={`w-full text-left px-2 py-1 hover:bg-accent rounded text-xs truncate ${task.content_type_id === 39 ? 'font-bold' : ''}`}
                        onClick={() => {
                          onChange(task.id, task);
                          setOpen(false);
                        }}
                        disabled={disabledIds.includes(String(task.id))}
                      >
                        {task.title || `Task #${task.id}`}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1 hover:bg-accent rounded text-xs text-destructive"
                      onClick={() => {
                        onChange(null);
                        setOpen(false);
                      }}
                      disabled={!currentParentId}
                    >
                      Clear Parent
                    </button>
                  </li>
                </ul>
              )}
            </InfiniteList>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
} 